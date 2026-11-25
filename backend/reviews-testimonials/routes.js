const express = require("express");
const { z } = require("zod");
const { pool } = require("../shared/db");
const { requireAuth, requireRole } = require("../shared/authMiddleware");
const { writeAuditLog } = require("../shared/auditLog");

const router = express.Router();

const reviewSchema = z
  .object({
    doctorId: z.string().uuid("Invalid doctor UUID").optional().nullable(),
    clinicId: z.string().uuid("Invalid clinic UUID").optional().nullable(),
    rating: z.number().int().min(1).max(5),
    body: z
      .string()
      .min(5, "Review must be at least 5 characters")
      .max(1000, "Review exceeds 1000 characters"),
  })
  .refine((data) => data.doctorId || data.clinicId, {
    message: "Either doctorId or clinicId must be specified",
    path: ["doctorId"],
  });

const moderateSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  notes: z.string().max(500).optional(),
});

/**
 * GET /api/reviews/doctor/:doctorId
 * Public view of approved reviews for a specific doctor.
 */
router.get("/doctor/:doctorId", async (req, res, next) => {
  try {
    const { doctorId } = req.params;

    const listQuery = `
      SELECT r.id, r.rating, r.body, r.verified_patient, r.created_at,
             u.full_name AS reviewer_name
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.doctor_id = $1 AND r.moderation_status = 'approved'
      ORDER BY r.created_at DESC
      LIMIT 50
    `;
    const listResult = await pool.query(listQuery, [doctorId]);

    const aggQuery = `
      SELECT COUNT(*) AS total_reviews,
             ROUND(AVG(rating)::numeric, 1) AS average_rating
      FROM reviews
      WHERE doctor_id = $1 AND moderation_status = 'approved'
    `;
    const aggResult = await pool.query(aggQuery, [doctorId]);

    res.json({
      doctorId,
      totalReviews: parseInt(aggResult.rows[0]?.total_reviews || "0", 10),
      averageRating: parseFloat(aggResult.rows[0]?.average_rating || "0"),
      reviews: listResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reviews/clinic/:clinicId
 * Public view of approved reviews for a clinic.
 */
router.get("/clinic/:clinicId", async (req, res, next) => {
  try {
    const { clinicId } = req.params;

    const listQuery = `
      SELECT r.id, r.rating, r.body, r.verified_patient, r.created_at,
             u.full_name AS reviewer_name
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.clinic_id = $1 AND r.moderation_status = 'approved'
      ORDER BY r.created_at DESC
      LIMIT 50
    `;
    const listResult = await pool.query(listQuery, [clinicId]);

    const aggQuery = `
      SELECT COUNT(*) AS total_reviews,
             ROUND(AVG(rating)::numeric, 1) AS average_rating
      FROM reviews
      WHERE clinic_id = $1 AND moderation_status = 'approved'
    `;
    const aggResult = await pool.query(aggQuery, [clinicId]);

    res.json({
      clinicId,
      totalReviews: parseInt(aggResult.rows[0]?.total_reviews || "0", 10),
      averageRating: parseFloat(aggResult.rows[0]?.average_rating || "0"),
      reviews: listResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reviews/my
 * Authenticated patient viewing their own submitted reviews.
 */
router.get("/my", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT r.*, d.full_name AS doctor_name, c.name AS clinic_name
       FROM reviews r
       LEFT JOIN doctors d ON r.doctor_id = d.id
       LEFT JOIN clinics c ON r.clinic_id = c.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );

    res.json({ reviews: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/reviews
 * Submit patient review with verified-patient check.
 */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const data = reviewSchema.parse(req.body);

    // Verified-patient check: user must have a completed appointment with this doctor/clinic
    const appointmentCheck = await pool.query(
      `SELECT id FROM appointments
       WHERE user_id = $1
         AND ($2::uuid IS NULL OR doctor_id = $2)
         AND ($3::uuid IS NULL OR clinic_id = $3)
         AND status = 'completed'
       LIMIT 1`,
      [req.user.id, data.doctorId || null, data.clinicId || null]
    );

    const isVerifiedPatient = appointmentCheck.rows.length > 0;

    const insertResult = await pool.query(
      `INSERT INTO reviews (user_id, doctor_id, clinic_id, rating, body, verified_patient, moderation_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [
        req.user.id,
        data.doctorId || null,
        data.clinicId || null,
        data.rating,
        data.body,
        isVerifiedPatient,
      ]
    );

    const newReview = insertResult.rows[0];

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "REVIEW_SUBMITTED",
      targetType: "review",
      targetId: newReview.id,
      metadata: {
        doctorId: data.doctorId,
        clinicId: data.clinicId,
        verifiedPatient: isVerifiedPatient,
      },
    });

    res.status(201).json({
      message: "Review submitted successfully and is pending moderation.",
      review: newReview,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reviews/pending
 * Admin-only: list reviews awaiting moderation.
 */
router.get(
  "/pending",
  requireAuth,
  requireRole("super_admin", "clinic_admin"),
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT r.*, u.full_name AS reviewer_name, d.full_name AS doctor_name, c.name AS clinic_name
       FROM reviews r
       LEFT JOIN users u ON r.user_id = u.id
       LEFT JOIN doctors d ON r.doctor_id = d.id
       LEFT JOIN clinics c ON r.clinic_id = c.id
       WHERE r.moderation_status = 'pending'
       ORDER BY r.created_at ASC`
      );

      res.json({ pendingReviews: result.rows });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/reviews/:id/moderate
 * Admin-only: approve or reject review.
 */
router.patch(
  "/:id/moderate",
  requireAuth,
  requireRole("super_admin", "clinic_admin"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status, notes } = moderateSchema.parse(req.body);

      const updateResult = await pool.query(
        `UPDATE reviews
       SET moderation_status = $1
       WHERE id = $2
       RETURNING *`,
        [status, id]
      );

      if (updateResult.rows.length === 0) {
        return res.status(404).json({ error: "Review not found" });
      }

      const updatedReview = updateResult.rows[0];

      await writeAuditLog({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: "REVIEW_MODERATED",
        targetType: "review",
        targetId: id,
        metadata: { newStatus: status, notes },
      });

      res.json({
        message: `Review has been ${status}`,
        review: updatedReview,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/reviews/:id
 * Delete review (author or super_admin).
 */
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const findResult = await pool.query(`SELECT user_id FROM reviews WHERE id = $1`, [id]);
    if (findResult.rows.length === 0) {
      return res.status(404).json({ error: "Review not found" });
    }

    const review = findResult.rows[0];
    if (review.user_id !== req.user.id && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Access denied. Cannot delete another user's review." });
    }

    await pool.query(`DELETE FROM reviews WHERE id = $1`, [id]);

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "REVIEW_DELETED",
      targetType: "review",
      targetId: id,
      metadata: {},
    });

    res.json({ message: "Review deleted successfully" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
