const express = require("express");
const { z } = require("zod");
const { pool } = require("../shared/db");
const { requireAuth } = require("../shared/authMiddleware");
const { writeAuditLog } = require("../shared/auditLog");

const router = express.Router();

const ageGroups = [
  "infant_0_3m",
  "infant_3_12m",
  "child_1_12y",
  "teen_13_17y",
  "adult_18_59y",
  "senior_60plus",
  "pregnant",
];

const createProfileSchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(255),
  relationship: z.string().min(1, "Relationship is required").max(50), // e.g. 'child', 'parent', 'spouse', 'other'
  ageGroup: z.enum(ageGroups, {
    errorMap: () => ({ message: `Age group must be one of: ${ageGroups.join(", ")}` }),
  }),
});

const updateProfileSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  relationship: z.string().min(1).max(50).optional(),
  ageGroup: z.enum(ageGroups).optional(),
});

/**
 * GET /api/family-profiles
 * Lists all family profiles managed by the current authenticated user.
 * Strictly owner-scoped: a user can never view another user's profiles.
 */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, relationship, age_group, created_at
       FROM family_profiles
       WHERE managed_by_user_id = $1
       ORDER BY created_at ASC`,
      [req.user.id]
    );

    res.json({ familyProfiles: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/family-profiles/:id
 * Fetches a single family profile, strictly owner-scoped.
 */
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, relationship, age_group, created_at
       FROM family_profiles
       WHERE id = $1 AND managed_by_user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Family profile not found or access denied" });
    }

    res.json({ familyProfile: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/family-profiles
 * Creates a new family profile managed by the logged-in user.
 */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { fullName, relationship, ageGroup } = createProfileSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO family_profiles (managed_by_user_id, full_name, relationship, age_group)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, relationship, age_group, created_at`,
      [req.user.id, fullName, relationship, ageGroup]
    );

    const created = result.rows[0];

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "FAMILY_PROFILE_CREATE",
      targetType: "family_profile",
      targetId: created.id,
      metadata: { relationship, ageGroup },
    });

    res.status(201).json({ message: "Family profile created", familyProfile: created });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/family-profiles/:id (and PUT)
 * Updates a family profile, strictly owner-scoped.
 */
router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const data = updateProfileSchema.parse(req.body);

    const fields = [];
    const values = [];
    let idx = 1;

    if (data.fullName !== undefined) {
      fields.push(`full_name = $${idx++}`);
      values.push(data.fullName);
    }
    if (data.relationship !== undefined) {
      fields.push(`relationship = $${idx++}`);
      values.push(data.relationship);
    }
    if (data.ageGroup !== undefined) {
      fields.push(`age_group = $${idx++}`);
      values.push(data.ageGroup);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields provided to update" });
    }

    values.push(req.params.id);
    values.push(req.user.id);

    const query = `
      UPDATE family_profiles
      SET ${fields.join(", ")}
      WHERE id = $${idx++} AND managed_by_user_id = $${idx}
      RETURNING id, full_name, relationship, age_group, created_at
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Family profile not found or access denied" });
    }

    const updated = result.rows[0];

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "FAMILY_PROFILE_UPDATE",
      targetType: "family_profile",
      targetId: updated.id,
      metadata: data,
    });

    res.json({ message: "Family profile updated", familyProfile: updated });
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireAuth, async (req, res, next) => {
  req.url = `/${req.params.id}`;
  return router.handle(req, res, next);
});

/**
 * DELETE /api/family-profiles/:id
 * Deletes a family profile, strictly owner-scoped.
 */
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `DELETE FROM family_profiles
       WHERE id = $1 AND managed_by_user_id = $2
       RETURNING id`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Family profile not found or access denied" });
    }

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "FAMILY_PROFILE_DELETE",
      targetType: "family_profile",
      targetId: req.params.id,
    });

    res.json({ message: "Family profile deleted successfully" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
