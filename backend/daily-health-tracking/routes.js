const express = require("express");
const { z } = require("zod");
const { pool } = require("../shared/db");
const { requireAuth } = require("../shared/authMiddleware");

const router = express.Router();

const trackingEntrySchema = z.object({
  trackedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
    .default(() => new Date().toISOString().split("T")[0]),
  sleepHours: z.number().min(0).max(24).optional().nullable(),
  waterMl: z.number().int().min(0).max(10000).optional().nullable(),
  steps: z.number().int().min(0).max(100000).optional().nullable(),
  bpSystolic: z.number().int().min(50).max(250).optional().nullable(),
  bpDiastolic: z.number().int().min(30).max(150).optional().nullable(),
  bloodSugar: z.number().min(20).max(600).optional().nullable(),
  temperatureC: z.number().min(30).max(45).optional().nullable(),
  mood: z.enum(["great", "good", "neutral", "tired", "stressed", "pain"]).optional().nullable(),
  weightKg: z.number().min(1).max(300).optional().nullable(),
  painScore: z.number().int().min(0).max(10).optional().nullable(),
});

/**
 * GET /api/tracking
 * Retrieves past tracking records for authenticated user.
 */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(90, parseInt(req.query.limit || "30", 10));
    const result = await pool.query(
      `SELECT * FROM daily_health_tracking
       WHERE user_id = $1
       ORDER BY tracked_date DESC
       LIMIT $2`,
      [req.user.id, limit]
    );

    res.json({ trackingHistory: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tracking/today
 * Retrieves today's vitals.
 */
router.get("/today", requireAuth, async (req, res, next) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const result = await pool.query(
      `SELECT * FROM daily_health_tracking
       WHERE user_id = $1 AND tracked_date = $2`,
      [req.user.id, today]
    );

    res.json({ entry: result.rows[0] || null });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tracking/trends
 * Aggregates vitals and trends over the past N days.
 */
router.get("/trends", requireAuth, async (req, res, next) => {
  try {
    const days = Math.min(180, Math.max(7, parseInt(req.query.days || "30", 10)));
    const result = await pool.query(
      `SELECT 
         COUNT(*) as total_entries,
         ROUND(AVG(sleep_hours)::numeric, 1) as avg_sleep_hours,
         ROUND(AVG(water_ml)::numeric, 0) as avg_water_ml,
         ROUND(AVG(steps)::numeric, 0) as avg_steps,
         ROUND(AVG(bp_systolic)::numeric, 0) as avg_bp_systolic,
         ROUND(AVG(bp_diastolic)::numeric, 0) as avg_bp_diastolic,
         ROUND(AVG(blood_sugar)::numeric, 1) as avg_blood_sugar,
         ROUND(AVG(weight_kg)::numeric, 1) as avg_weight_kg
       FROM daily_health_tracking
       WHERE user_id = $1 AND tracked_date >= CURRENT_DATE - ($2 || ' days')::interval`,
      [req.user.id, days]
    );

    const historyResult = await pool.query(
      `SELECT tracked_date, sleep_hours, water_ml, steps, bp_systolic, bp_diastolic, blood_sugar, mood, weight_kg
       FROM daily_health_tracking
       WHERE user_id = $1 AND tracked_date >= CURRENT_DATE - ($2 || ' days')::interval
       ORDER BY tracked_date ASC`,
      [req.user.id, days]
    );

    res.json({
      days,
      summary: result.rows[0] || null,
      timeline: historyResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tracking/export
 * Exports daily health tracking data.
 */
router.get("/export", requireAuth, async (req, res, next) => {
  try {
    const format = req.query.format || "json";
    const result = await pool.query(
      `SELECT tracked_date, sleep_hours, water_ml, steps, bp_systolic, bp_diastolic, blood_sugar, temperature_c, mood, weight_kg, pain_score
       FROM daily_health_tracking
       WHERE user_id = $1
       ORDER BY tracked_date DESC`,
      [req.user.id]
    );

    if (format === "csv") {
      const headers =
        "Date,Sleep (hrs),Water (ml),Steps,BP Systolic,BP Diastolic,Blood Sugar (mg/dL),Temp (C),Mood,Weight (kg),Pain Score\n";
      const rows = result.rows
        .map((r) =>
          [
            r.tracked_date,
            r.sleep_hours,
            r.water_ml,
            r.steps,
            r.bp_systolic,
            r.bp_diastolic,
            r.blood_sugar,
            r.temperature_c,
            r.mood,
            r.weight_kg,
            r.pain_score,
          ]
            .map((v) => (v === null ? "" : v))
            .join(",")
        )
        .join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="health_tracking_${req.user.id}.csv"`
      );
      return res.send(headers + rows);
    }

    res.json({
      exportedAt: new Date().toISOString(),
      userId: req.user.id,
      count: result.rows.length,
      records: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/tracking
 * Upserts daily vitals & tracker record (one record per user per day).
 */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const data = trackingEntrySchema.parse(req.body);

    const query = `
      INSERT INTO daily_health_tracking (
        user_id, tracked_date, sleep_hours, water_ml, steps,
        bp_systolic, bp_diastolic, blood_sugar, temperature_c,
        mood, weight_kg, pain_score
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (user_id, tracked_date) DO UPDATE SET
        sleep_hours = EXCLUDED.sleep_hours,
        water_ml = EXCLUDED.water_ml,
        steps = EXCLUDED.steps,
        bp_systolic = EXCLUDED.bp_systolic,
        bp_diastolic = EXCLUDED.bp_diastolic,
        blood_sugar = EXCLUDED.blood_sugar,
        temperature_c = EXCLUDED.temperature_c,
        mood = EXCLUDED.mood,
        weight_kg = EXCLUDED.weight_kg,
        pain_score = EXCLUDED.pain_score
      RETURNING *;
    `;

    const values = [
      req.user.id,
      data.trackedDate,
      data.sleepHours || null,
      data.waterMl || null,
      data.steps || null,
      data.bpSystolic || null,
      data.bpDiastolic || null,
      data.bloodSugar || null,
      data.temperatureC || null,
      data.mood || null,
      data.weightKg || null,
      data.painScore || null,
    ];

    const result = await pool.query(query, values);

    res.json({
      message: "Daily vitals logged successfully",
      entry: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
