const express = require("express");
const { z } = require("zod");
const { pool } = require("../shared/db");
const { requireAuth, requireRole } = require("../shared/authMiddleware");
const { writeAuditLog } = require("../shared/auditLog");

const router = express.Router();

// All admin-verification routes strictly require super_admin role
router.use(requireAuth);
router.use(requireRole("super_admin"));

const doctorVerificationSchema = z
  .object({
    status: z.enum(["verified", "rejected"]),
    reason: z.string().max(500).optional(),
  })
  .refine((data) => data.status !== "rejected" || (data.reason && data.reason.trim().length > 0), {
    message: "Reason is required when rejecting a doctor verification",
    path: ["reason"],
  });

const clinicVerificationSchema = z.object({
  status: z.enum(["verified", "rejected"]),
  reason: z.string().max(500).optional(),
});

const userStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
  reason: z.string().max(500).optional(),
});

/**
 * GET /api/admin/verification/doctors
 * Lists doctors in the verification queue.
 */
router.get("/doctors", async (req, res, next) => {
  try {
    const status = req.query.status || "pending";
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "50", 10)));
    const offset = Math.max(0, parseInt(req.query.offset || "0", 10));

    const result = await pool.query(
      `SELECT d.*, c.name AS clinic_name, u.phone AS doctor_phone
       FROM doctors d
       LEFT JOIN clinics c ON d.clinic_id = c.id
       LEFT JOIN users u ON d.user_id = u.id
       WHERE ($1 = 'all' OR d.verification_status = $1)
       ORDER BY d.created_at ASC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM doctors WHERE ($1 = 'all' OR verification_status = $1)`,
      [status]
    );

    res.json({
      statusFilter: status,
      totalCount: parseInt(countRes.rows[0]?.count || "0", 10),
      doctors: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/verification/doctors/:id
 * Approve or reject doctor KYC verification.
 */
router.patch("/doctors/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = doctorVerificationSchema.parse(req.body);

    const checkDoctor = await pool.query(`SELECT * FROM doctors WHERE id = $1`, [id]);
    if (checkDoctor.rows.length === 0) {
      return res.status(404).json({ error: "Doctor not found" });
    }

    const doctor = checkDoctor.rows[0];

    const updateRes = await pool.query(
      `UPDATE doctors
       SET verification_status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    const action = status === "verified" ? "DOCTOR_VERIFIED" : "DOCTOR_REJECTED";

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action,
      targetType: "doctor",
      targetId: id,
      metadata: {
        doctorName: doctor.full_name,
        licenseNumber: doctor.license_number,
        newStatus: status,
        reason: reason || null,
      },
    });

    res.json({
      message: `Doctor verification status updated to ${status}`,
      doctor: updateRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/verification/clinics
 * Lists clinics in the verification queue.
 */
router.get("/clinics", async (req, res, next) => {
  try {
    const status = req.query.status || "pending";
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "50", 10)));
    const offset = Math.max(0, parseInt(req.query.offset || "0", 10));

    const result = await pool.query(
      `SELECT * FROM clinics
       WHERE ($1 = 'all' OR verification_status = $1)
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM clinics WHERE ($1 = 'all' OR verification_status = $1)`,
      [status]
    );

    res.json({
      statusFilter: status,
      totalCount: parseInt(countRes.rows[0]?.count || "0", 10),
      clinics: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/verification/clinics/:id
 * Approve or reject clinic verification.
 */
router.patch("/clinics/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = clinicVerificationSchema.parse(req.body);

    const checkClinic = await pool.query(`SELECT * FROM clinics WHERE id = $1`, [id]);
    if (checkClinic.rows.length === 0) {
      return res.status(404).json({ error: "Clinic not found" });
    }

    const clinic = checkClinic.rows[0];

    const updateRes = await pool.query(
      `UPDATE clinics
       SET verification_status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    const action = status === "verified" ? "CLINIC_VERIFIED" : "CLINIC_REJECTED";

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action,
      targetType: "clinic",
      targetId: id,
      metadata: {
        clinicName: clinic.name,
        newStatus: status,
        reason: reason || null,
      },
    });

    res.json({
      message: `Clinic verification status updated to ${status}`,
      clinic: updateRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/verification/audit-logs
 * Immutable audit trail viewer with filtering and pagination.
 */
router.get("/audit-logs", async (req, res, next) => {
  try {
    const { actorRole, action, targetType, from, to } = req.query;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "50", 10)));
    const offset = Math.max(0, parseInt(req.query.offset || "0", 10));

    let conditions = ["1=1"];
    let params = [];

    if (actorRole) {
      params.push(actorRole);
      conditions.push(`actor_role = $${params.length}`);
    }
    if (action) {
      params.push(`%${action}%`);
      conditions.push(`action ILIKE $${params.length}`);
    }
    if (targetType) {
      params.push(targetType);
      conditions.push(`target_type = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`created_at <= $${params.length}`);
    }

    const whereClause = conditions.join(" AND ");
    const query = `
      SELECT * FROM audit_logs
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const result = await pool.query(query, [...params, limit, offset]);

    const countQuery = `SELECT COUNT(*) FROM audit_logs WHERE ${whereClause}`;
    const countRes = await pool.query(countQuery, params);

    res.json({
      totalCount: parseInt(countRes.rows[0]?.count || "0", 10),
      limit,
      offset,
      logs: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/verification/users/:id/status
 * Suspend or reactivate user accounts.
 */
router.patch("/users/:id/status", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = userStatusSchema.parse(req.body);

    const updateRes = await pool.query(
      `UPDATE users
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, phone, full_name, role, status`,
      [status, id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: status === "suspended" ? "USER_SUSPENDED" : "USER_REACTIVATED",
      targetType: "user",
      targetId: id,
      metadata: { newStatus: status, reason },
    });

    res.json({
      message: `User account has been ${status}`,
      user: updateRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
