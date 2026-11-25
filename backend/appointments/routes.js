const express = require("express");
const { z } = require("zod");
const { pool } = require("../shared/db");
const { requireAuth } = require("../shared/authMiddleware");
const { writeAuditLog } = require("../shared/auditLog");

const router = express.Router();

const bookSchema = z.object({
  doctorId: z.string().uuid("Invalid doctor ID"),
  scheduledAt: z.string().datetime("Must be valid ISO timestamp (e.g. 2024-12-01T10:00:00Z)"),
  mode: z.enum(["online", "offline"]).default("online"),
});

const rescheduleSchema = z.object({
  newScheduledAt: z.string().datetime("Must be valid ISO timestamp"),
});

const cancelSchema = z.object({
  reason: z.string().max(500).optional(),
});

const DEFAULT_CANCELLATION_POLICY =
  "Free cancellation up to 2 hours before consultation time. Cancellations within 2 hours are subject to standard clinic fee policy.";

/**
 * GET /api/appointments
 * Strict Role-Based Access Control:
 * - Patient sees appointments they booked (user_id = req.user.id)
 * - Doctor sees appointments scheduled with them (doctor_id = doctor.id)
 * - Super admin sees all appointments
 */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    let query;
    let values = [];

    if (req.user.role === "doctor") {
      query = `
        SELECT
          a.id, a.user_id, a.doctor_id, a.mode, a.scheduled_at, a.status,
          a.cancellation_policy, a.created_at,
          u.full_name AS patient_name, u.phone AS patient_phone,
          c.name AS clinic_name, c.address AS clinic_address
        FROM appointments a
        JOIN doctors d ON d.id = a.doctor_id
        JOIN users u ON u.id = a.user_id
        LEFT JOIN clinics c ON c.id = d.clinic_id
        WHERE d.user_id = $1
        ORDER BY a.scheduled_at ASC
      `;
      values = [req.user.id];
    } else if (req.user.role === "super_admin") {
      query = `
        SELECT
          a.id, a.user_id, a.doctor_id, a.mode, a.scheduled_at, a.status,
          a.cancellation_policy, a.created_at,
          u.full_name AS patient_name,
          doc_u.full_name AS doctor_name, d.specialty
        FROM appointments a
        JOIN users u ON u.id = a.user_id
        JOIN doctors d ON d.id = a.doctor_id
        JOIN users doc_u ON doc_u.id = d.user_id
        ORDER BY a.scheduled_at DESC
      `;
    } else {
      // Patient default
      query = `
        SELECT
          a.id, a.user_id, a.doctor_id, a.mode, a.scheduled_at, a.status,
          a.cancellation_policy, a.created_at,
          doc_u.full_name AS doctor_name, d.specialty, d.consultation_fee,
          c.name AS clinic_name, c.address AS clinic_address
        FROM appointments a
        JOIN doctors d ON d.id = a.doctor_id
        JOIN users doc_u ON doc_u.id = d.user_id
        LEFT JOIN clinics c ON c.id = d.clinic_id
        WHERE a.user_id = $1
        ORDER BY a.scheduled_at ASC
      `;
      values = [req.user.id];
    }

    const result = await pool.query(query, values);
    res.json({ appointments: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/appointments/:id
 * Fetches single appointment with strict ownership verification.
 */
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const query = `
      SELECT
        a.id, a.user_id, a.doctor_id, a.mode, a.scheduled_at, a.status,
        a.cancellation_policy, a.created_at,
        doc_u.full_name AS doctor_name, d.specialty, d.consultation_fee, d.user_id AS doctor_user_id,
        u.full_name AS patient_name, u.phone AS patient_phone,
        c.name AS clinic_name, c.address AS clinic_address
      FROM appointments a
      JOIN doctors d ON d.id = a.doctor_id
      JOIN users doc_u ON doc_u.id = d.user_id
      JOIN users u ON u.id = a.user_id
      LEFT JOIN clinics c ON c.id = d.clinic_id
      WHERE a.id = $1
    `;

    const result = await pool.query(query, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    const appt = result.rows[0];

    // Ownership check
    const isPatient = appt.user_id === req.user.id;
    const isDoctor = appt.doctor_user_id === req.user.id;
    const isAdmin = req.user.role === "super_admin";

    if (!isPatient && !isDoctor && !isAdmin) {
      return res.status(403).json({ error: "Access denied to this appointment" });
    }

    res.json({ appointment: appt });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/appointments/book (and POST /)
 * Transactional appointment booking with double-booking prevention.
 */
router.post(["/book", "/"], requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { doctorId, scheduledAt, mode } = bookSchema.parse(req.body);

    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      return res.status(400).json({ error: "Cannot book an appointment in the past" });
    }

    await client.query("BEGIN");

    // Check doctor existence & verification
    const docCheck = await client.query("SELECT id, verified, user_id FROM doctors WHERE id = $1", [
      doctorId,
    ]);
    if (docCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Doctor not found" });
    }
    if (!docCheck.rows[0].verified) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Cannot book unverified doctor" });
    }

    // Double-booking check: lock conflicting row if exists
    const conflictCheck = await client.query(
      `SELECT id FROM appointments
       WHERE doctor_id = $1 AND scheduled_at = $2 AND status != 'cancelled'
       FOR UPDATE`,
      [doctorId, scheduledDate]
    );

    if (conflictCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "This consultation slot is already booked. Please choose another time.",
        conflict: true,
      });
    }

    // Insert appointment
    const insertResult = await client.query(
      `INSERT INTO appointments (user_id, doctor_id, mode, scheduled_at, status, cancellation_policy)
       VALUES ($1, $2, $3, $4, 'booked', $5)
       RETURNING *`,
      [req.user.id, doctorId, mode, scheduledDate, DEFAULT_CANCELLATION_POLICY]
    );

    const appt = insertResult.rows[0];
    await client.query("COMMIT");

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "APPOINTMENT_BOOKED",
      targetType: "appointment",
      targetId: appt.id,
      metadata: { doctorId, scheduledAt, mode },
    });

    res.status(201).json({
      message: "Appointment booked successfully",
      appointment: appt,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    // Handle unique constraint violation on (doctor_id, scheduled_at)
    if (err.code === "23505") {
      return res.status(409).json({
        error: "This consultation slot is already booked. Please choose another time.",
        conflict: true,
      });
    }
    next(err);
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/appointments/:id/reschedule
 * Transactional reschedule with slot conflict validation.
 */
router.patch("/:id/reschedule", requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { newScheduledAt } = rescheduleSchema.parse(req.body);
    const newDate = new Date(newScheduledAt);

    if (newDate <= new Date()) {
      return res.status(400).json({ error: "Cannot reschedule to a past time" });
    }

    await client.query("BEGIN");

    // Fetch existing appointment and verify ownership
    const apptResult = await client.query("SELECT * FROM appointments WHERE id = $1 FOR UPDATE", [
      req.params.id,
    ]);

    if (apptResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Appointment not found" });
    }

    const appt = apptResult.rows[0];
    if (appt.user_id !== req.user.id && req.user.role !== "super_admin") {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Access denied" });
    }

    if (appt.status === "cancelled") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Cannot reschedule a cancelled appointment" });
    }

    // Check conflict at new time
    const conflict = await client.query(
      `SELECT id FROM appointments
       WHERE doctor_id = $1 AND scheduled_at = $2 AND id != $3 AND status != 'cancelled'`,
      [appt.doctor_id, newDate, appt.id]
    );

    if (conflict.rows.length > 0) {
      await client.query("ROLLBACK");
      return res
        .status(409)
        .json({ error: "New slot is already booked. Please pick another time." });
    }

    const updateResult = await client.query(
      `UPDATE appointments
       SET scheduled_at = $1, status = 'booked'
       WHERE id = $2
       RETURNING *`,
      [newDate, appt.id]
    );

    await client.query("COMMIT");

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "APPOINTMENT_RESCHEDULED",
      targetType: "appointment",
      targetId: appt.id,
      metadata: { oldTime: appt.scheduled_at, newTime: newDate },
    });

    res.json({
      message: "Appointment rescheduled successfully",
      appointment: updateResult.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/appointments/:id/cancel
 * Cancels appointment per cancellation policy.
 */
router.patch("/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    const { reason } = cancelSchema.parse(req.body);

    const apptResult = await pool.query(
      `SELECT a.*, d.user_id AS doctor_user_id
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       WHERE a.id = $1`,
      [req.params.id]
    );

    if (apptResult.rows.length === 0) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    const appt = apptResult.rows[0];
    const isOwner =
      appt.user_id === req.user.id ||
      appt.doctor_user_id === req.user.id ||
      req.user.role === "super_admin";
    if (!isOwner) {
      return res.status(403).json({ error: "Access denied" });
    }

    const updateResult = await pool.query(
      `UPDATE appointments
       SET status = 'cancelled'
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "APPOINTMENT_CANCELLED",
      targetType: "appointment",
      targetId: req.params.id,
      metadata: { reason: reason || "User initiated cancellation" },
    });

    res.json({
      message: "Appointment cancelled successfully",
      appointment: updateResult.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/appointments/doctors/:doctorId/available-slots
 * Generates available 30-min consultation slots for a specific date, excluding existing bookings.
 */
router.get("/doctors/:doctorId/available-slots", async (req, res, next) => {
  try {
    const { doctorId } = req.params;
    const dateStr = req.query.date || new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // 09:00 to 17:00 IST in 30-min intervals
    const candidateSlots = [
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
      "14:00",
      "14:30",
      "15:00",
      "15:30",
      "16:00",
      "16:30",
    ];

    const bookedResult = await pool.query(
      `SELECT scheduled_at FROM appointments
       WHERE doctor_id = $1
         AND DATE(scheduled_at) = $2
         AND status != 'cancelled'`,
      [doctorId, dateStr]
    );

    const bookedTimes = new Set(
      bookedResult.rows.map((r) => {
        const d = new Date(r.scheduled_at);
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      })
    );

    const availableSlots = candidateSlots
      .filter((slot) => !bookedTimes.has(slot))
      .map((slot) => ({
        time: slot,
        isoTimestamp: `${dateStr}T${slot}:00.000Z`,
        available: true,
      }));

    res.json({
      doctorId,
      date: dateStr,
      availableSlots,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
