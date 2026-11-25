const express = require("express");
const { z } = require("zod");
const { pool } = require("../shared/db");
const { requireAuth } = require("../shared/authMiddleware");

const router = express.Router();

/**
 * GET /api/directory/doctors
 * Searches verified doctors with optional geo-distance (Haversine formula),
 * specialty, language, and fee filters with pagination.
 */
router.get("/doctors", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "10", 10)));
    const offset = (page - 1) * limit;

    const {
      specialty,
      language,
      city,
      maxFee,
      lat,
      lng,
      maxDistanceKm = 50,
      includeUnverified = "false",
    } = req.query;

    const whereClauses = [];
    const values = [];
    let idx = 1;

    // By default, only verified doctors are listed for patient safety
    if (includeUnverified !== "true") {
      whereClauses.push("d.verified = TRUE");
    }

    if (specialty) {
      whereClauses.push(`LOWER(d.specialty) LIKE LOWER($${idx++})`);
      values.push(`%${specialty}%`);
    }

    if (maxFee) {
      whereClauses.push(`d.consultation_fee <= $${idx++}`);
      values.push(parseFloat(maxFee));
    }

    if (language) {
      whereClauses.push(`d.languages @> $${idx++}::jsonb`);
      values.push(JSON.stringify([language]));
    }

    if (city) {
      whereClauses.push(`LOWER(c.address) LIKE LOWER($${idx++})`);
      values.push(`%${city}%`);
    }

    let distanceSelect = "";
    let distanceOrderBy = "d.rating DESC NULLS LAST";

    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      distanceSelect = `, (
        6371 * acos(
          cos(radians(${userLat})) * cos(radians(c.latitude)) *
          cos(radians(c.longitude) - radians(${userLng})) +
          sin(radians(${userLat})) * sin(radians(c.latitude))
        )
      ) AS distance_km`;
      whereClauses.push(`(
        6371 * acos(
          cos(radians(${userLat})) * cos(radians(c.latitude)) *
          cos(radians(c.longitude) - radians(${userLng})) +
          sin(radians(${userLat})) * sin(radians(c.latitude))
        )
      ) <= $${idx++}`);
      values.push(parseFloat(maxDistanceKm));
      distanceOrderBy = "distance_km ASC";
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const query = `
      SELECT
        d.id, d.registration_number, d.specialty, d.languages,
        d.consultation_fee, d.verified, d.rating,
        u.full_name AS doctor_name, u.phone AS doctor_phone,
        c.id AS clinic_id, c.name AS clinic_name, c.address AS clinic_address,
        c.latitude, c.longitude, c.has_pharmacy
        ${distanceSelect}
      FROM doctors d
      JOIN users u ON u.id = d.user_id
      LEFT JOIN clinics c ON c.id = d.clinic_id
      ${whereSql}
      ORDER BY ${distanceOrderBy}
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    values.push(limit, offset);
    const result = await pool.query(query, values);

    res.json({
      doctors: result.rows,
      pagination: { page, limit, count: result.rows.length },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/directory/doctors/:id
 * Fetches single doctor profile and clinic information.
 */
router.get("/doctors/:id", async (req, res, next) => {
  try {
    const query = `
      SELECT
        d.id, d.registration_number, d.specialty, d.languages,
        d.consultation_fee, d.verified, d.rating,
        u.full_name AS doctor_name, u.preferred_language,
        c.id AS clinic_id, c.name AS clinic_name, c.address AS clinic_address,
        c.operating_hours, c.accessibility_features, c.has_pharmacy
      FROM doctors d
      JOIN users u ON u.id = d.user_id
      LEFT JOIN clinics c ON c.id = d.clinic_id
      WHERE d.id = $1
    `;

    const result = await pool.query(query, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Doctor profile not found" });
    }

    res.json({ doctor: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/directory/clinics
 * Lists clinics with ABDM HFR verification, geo-distance, and operating hours.
 */
router.get("/clinics", async (req, res, next) => {
  try {
    const { city, verifiedOnly = "true" } = req.query;

    const whereClauses = [];
    const values = [];
    let idx = 1;

    if (verifiedOnly === "true") {
      whereClauses.push("verified = TRUE");
    }

    if (city) {
      whereClauses.push(`LOWER(address) LIKE LOWER($${idx++})`);
      values.push(`%${city}%`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const query = `
      SELECT id, name, abdm_hfr_id, verified, address, latitude, longitude,
             operating_hours, accessibility_features, has_pharmacy
      FROM clinics
      ${whereSql}
      ORDER BY name ASC
    `;

    const result = await pool.query(query, values);
    res.json({ clinics: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/directory/clinics/:id
 * Fetches single clinic details with affiliated doctors.
 */
router.get("/clinics/:id", async (req, res, next) => {
  try {
    const clinicResult = await pool.query("SELECT * FROM clinics WHERE id = $1", [req.params.id]);

    if (clinicResult.rows.length === 0) {
      return res.status(404).json({ error: "Clinic not found" });
    }

    const doctorsResult = await pool.query(
      `SELECT d.id, u.full_name, d.specialty, d.consultation_fee, d.rating
       FROM doctors d
       JOIN users u ON u.id = d.user_id
       WHERE d.clinic_id = $1 AND d.verified = TRUE`,
      [req.params.id]
    );

    res.json({
      clinic: clinicResult.rows[0],
      doctors: doctorsResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

// Alias root GET to doctors
router.get("/", async (req, res, next) => {
  req.url = "/doctors";
  return router.handle(req, res, next);
});

module.exports = router;
