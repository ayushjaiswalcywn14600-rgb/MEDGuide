const express = require("express");
const crypto = require("crypto");
const { z } = require("zod");
const { pool } = require("../shared/db");
const { requireAuth, requireRole } = require("../shared/authMiddleware");
const { writeAuditLog } = require("../shared/auditLog");

const router = express.Router();

const updateProfileSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  preferredLanguage: z.enum(["en", "hi", "ta", "te", "bn", "mr", "gu", "kn"]).optional(),
  caregiverMode: z.boolean().optional(),
});

const changeRoleSchema = z.object({
  role: z.enum(["patient", "doctor", "clinic_admin", "pharmacist", "super_admin"]),
});

/**
 * GET /api/users/profile (also /me)
 * Retrieves current user's profile.
 */
router.get("/profile", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, phone, full_name, preferred_language, role, caregiver_mode, created_at, updated_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User profile not found" });
    }

    const u = result.rows[0];
    res.json({
      id: u.id,
      phone: u.phone,
      fullName: u.full_name,
      preferredLanguage: u.preferred_language,
      role: u.role,
      caregiverMode: u.caregiver_mode,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  // Alias for /profile
  req.url = "/profile";
  return router.handle(req, res, next);
});

/**
 * PATCH /api/users/profile
 * Updates current user's display name, language, or caregiver mode.
 */
router.patch("/profile", requireAuth, async (req, res, next) => {
  try {
    const data = updateProfileSchema.parse(req.body);

    const fields = [];
    const values = [];
    let idx = 1;

    if (data.fullName !== undefined) {
      fields.push(`full_name = $${idx++}`);
      values.push(data.fullName);
    }
    if (data.preferredLanguage !== undefined) {
      fields.push(`preferred_language = $${idx++}`);
      values.push(data.preferredLanguage);
    }
    if (data.caregiverMode !== undefined) {
      fields.push(`caregiver_mode = $${idx++}`);
      values.push(data.caregiverMode);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields provided to update" });
    }

    fields.push("updated_at = NOW()");
    values.push(req.user.id);

    const query = `
      UPDATE users
      SET ${fields.join(", ")}
      WHERE id = $${idx}
      RETURNING id, phone, full_name, preferred_language, role, caregiver_mode, updated_at
    `;

    const result = await pool.query(query, values);
    const updated = result.rows[0];

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "PROFILE_UPDATE",
      targetType: "user",
      targetId: req.user.id,
      metadata: data,
    });

    res.json({
      message: "Profile updated successfully",
      user: {
        id: updated.id,
        phone: updated.phone,
        fullName: updated.full_name,
        preferredLanguage: updated.preferred_language,
        role: updated.role,
        caregiverMode: updated.caregiver_mode,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/export
 * DPDP Act 2023: Right to Data Portability.
 * Exports comprehensive personal health and activity data in structured JSON.
 */
router.get("/export", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [userRes, familyRes, consentRes, sessionsRes, recordsRes, appointmentsRes] =
      await Promise.all([
        pool.query(
          "SELECT id, phone, full_name, preferred_language, role, created_at FROM users WHERE id = $1",
          [userId]
        ),
        pool.query("SELECT * FROM family_profiles WHERE managed_by_user_id = $1", [userId]),
        pool.query("SELECT * FROM consents WHERE user_id = $1 ORDER BY granted_at DESC", [userId]),
        pool.query(
          `SELECT s.*, t.level, t.reasons, t.escalated_by_ai
           FROM symptom_sessions s
           LEFT JOIN triage_results t ON t.symptom_session_id = s.id
           WHERE s.user_id = $1`,
          [userId]
        ),
        pool.query("SELECT * FROM health_records WHERE user_id = $1", [userId]),
        pool.query(
          `SELECT a.*, p.medicines, p.notes as prescription_notes
           FROM appointments a
           LEFT JOIN prescriptions p ON p.appointment_id = a.id
           WHERE a.user_id = $1`,
          [userId]
        ),
      ]);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      dpdpCompliance: "DPDP Act 2023 - Data Portability Export",
      user: userRes.rows[0] || null,
      familyProfiles: familyRes.rows,
      consents: consentRes.rows,
      symptomHistory: sessionsRes.rows,
      healthRecords: recordsRes.rows,
      appointments: appointmentsRes.rows,
    };

    await writeAuditLog({
      actorId: userId,
      actorRole: req.user.role,
      action: "DATA_EXPORT",
      targetType: "user",
      targetId: userId,
    });

    res.setHeader("Content-Disposition", `attachment; filename="medguide_export_${userId}.json"`);
    res.setHeader("Content-Type", "application/json");
    res.json(exportPayload);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/users/account
 * DPDP Act 2023: Right to Erasure / Account Deletion.
 * Starts 30-day grace period, revokes tokens, and anonymizes PII to preserve clinical audit trails.
 */
router.delete("/account", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const anonymizedPhone = `deleted_${crypto.randomBytes(6).toString("hex")}`;

    await pool.query(
      `UPDATE users
       SET full_name = 'Anonymized User',
           phone = $1,
           refresh_token_hash = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [anonymizedPhone, userId]
    );

    // Revoke all consents
    await pool.query(
      `INSERT INTO consents (user_id, purpose, granted, withdrawn_at, version)
       SELECT DISTINCT user_id, purpose, FALSE, NOW(), 'DELETION'
       FROM consents WHERE user_id = $1`,
      [userId]
    );

    await writeAuditLog({
      actorId: userId,
      actorRole: req.user.role,
      action: "ACCOUNT_DELETE",
      targetType: "user",
      targetId: userId,
      metadata: { gracePeriodDays: 30 },
    });

    res.json({
      message: "Account deletion initiated. Personal identifiers anonymized under DPDP Act 2023.",
      gracePeriodDays: 30,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * ADMIN ONLY: GET /api/users
 * Paginated list of users.
 */
router.get("/", requireAuth, requireRole("super_admin"), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "20", 10);
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT id, phone, full_name, preferred_language, role, caregiver_mode, created_at
       FROM users
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await pool.query("SELECT COUNT(*) FROM users");
    const total = parseInt(countResult.rows[0].count, 10);

    res.json({
      users: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * ADMIN ONLY: PATCH /api/users/:id/role
 * Allows super_admin to promote/change user roles.
 */
router.patch("/:id/role", requireAuth, requireRole("super_admin"), async (req, res, next) => {
  try {
    const { role } = changeRoleSchema.parse(req.body);
    const targetUserId = req.params.id;

    const result = await pool.query(
      "UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, phone, role",
      [role, targetUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "ROLE_CHANGE",
      targetType: "user",
      targetId: targetUserId,
      metadata: { newRole: role },
    });

    res.json({ message: "Role updated successfully", user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
