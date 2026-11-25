const express = require("express");
const { z } = require("zod");
const { pool } = require("../shared/db");
const { requireAuth } = require("../shared/authMiddleware");

const router = express.Router();

const SUBSTITUTION_CAUTION_CLASSES = [
  "modified_release",
  "combination_drugs",
  "insulin",
  "inhalers",
  "narrow_therapeutic_index",
];

const savingsSchema = z.object({
  brandMedicinePrice: z.number().positive("Brand price must be positive"),
  alternativeMedicinePrice: z.number().positive("Alternative price must be positive"),
});

const MANDATORY_CAUTION_NOTE =
  "A pharmacist or doctor must confirm any substitution before you switch, especially for modified-release, combination, insulin, inhaler, or narrow-safety-margin medicines. Never switch brands without medical guidance.";

/**
 * GET /api/pharmacy/search
 * Searches medicines by brand name or chemical composition (salt) and joins nearby pharmacy stock.
 */
router.get("/search", async (req, res, next) => {
  try {
    const queryStr = (req.query.query || "").trim();
    if (!queryStr) {
      return res.status(400).json({ error: "Search query is required" });
    }

    const searchQuery = `
      SELECT
        m.id, m.brand_name, m.composition, m.strength, m.substitution_caution_class,
        ps.price, ps.in_stock,
        c.id AS clinic_id, c.name AS clinic_name, c.address AS clinic_address,
        c.latitude, c.longitude
      FROM medicines m
      LEFT JOIN pharmacy_stock ps ON ps.medicine_id = m.id AND ps.in_stock = TRUE
      LEFT JOIN clinics c ON c.id = ps.clinic_id
      WHERE LOWER(m.brand_name) LIKE LOWER($1)
         OR LOWER(m.composition) LIKE LOWER($1)
      ORDER BY m.brand_name ASC
      LIMIT 30
    `;

    const result = await pool.query(searchQuery, [`%${queryStr}%`]);

    res.json({
      query: queryStr,
      results: result.rows,
      substitutionCautionClasses: SUBSTITUTION_CAUTION_CLASSES,
      mandatoryNotice: MANDATORY_CAUTION_NOTE,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/pharmacy/alternatives/:medicineId
 * Retrieves generic or lower-cost alternatives with the EXACT SAME composition and strength.
 */
router.get("/alternatives/:medicineId", async (req, res, next) => {
  try {
    const medResult = await pool.query("SELECT * FROM medicines WHERE id = $1", [
      req.params.medicineId,
    ]);

    if (medResult.rows.length === 0) {
      return res.status(404).json({ error: "Medicine not found" });
    }

    const currentMed = medResult.rows[0];

    // Find alternatives with same composition and strength, excluding current medicine
    const altResult = await pool.query(
      `SELECT
         m.id, m.brand_name, m.composition, m.strength, m.substitution_caution_class,
         MIN(ps.price) AS lowest_price,
         BOOL_OR(ps.in_stock) AS available_nearby
       FROM medicines m
       LEFT JOIN pharmacy_stock ps ON ps.medicine_id = m.id
       WHERE LOWER(m.composition) = LOWER($1)
         AND LOWER(m.strength) = LOWER($2)
         AND m.id != $3
       GROUP BY m.id, m.brand_name, m.composition, m.strength, m.substitution_caution_class
       ORDER BY lowest_price ASC NULLS LAST`,
      [currentMed.composition, currentMed.strength, currentMed.id]
    );

    const isSensitiveClass = !!currentMed.substitution_caution_class;

    res.json({
      medicine: currentMed,
      alternatives: altResult.rows,
      isSensitiveClass,
      substitutionCautionClass: currentMed.substitution_caution_class,
      requiresPharmacistConfirmation: true,
      substitutionCaution: MANDATORY_CAUTION_NOTE,
      advice: isSensitiveClass
        ? "CRITICAL CAUTION: This medicine belongs to a narrow therapeutic or modified-release class. Consult your prescribing doctor before any change."
        : "Generic alternative matches chemical composition. Always consult your dispensing pharmacist before purchasing.",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/pharmacy/savings-calculator
 * Calculates cost savings between brand and generic/alternative.
 * Enforces safety note: NEVER recommends standalone "just switch".
 */
router.post("/savings-calculator", (req, res, next) => {
  try {
    const { brandMedicinePrice, alternativeMedicinePrice } = savingsSchema.parse(req.body);

    const savings = Number((brandMedicinePrice - alternativeMedicinePrice).toFixed(2));
    const savingsPercent =
      brandMedicinePrice > 0 ? Number(((savings / brandMedicinePrice) * 100).toFixed(1)) : 0;

    res.json({
      brandMedicinePrice,
      alternativeMedicinePrice,
      savings,
      savingsPercent,
      isSavings: savings > 0,
      note: MANDATORY_CAUTION_NOTE,
      safetyDisclaimer:
        "MEDGUIDE provides price transparency for informational purposes. Patients should never switch medications without physician or pharmacist approval.",
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
