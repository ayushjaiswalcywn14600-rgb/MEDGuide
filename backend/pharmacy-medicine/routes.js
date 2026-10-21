const express = require("express");
const { requireAuth } = require("../shared/authMiddleware");

const router = express.Router();

// NOTE: replace with real Postgres-backed medicine + pharmacy inventory tables.
// Composition (salt) matching is what lets us suggest "same composition, different
// brand" alternatives safely — brand name alone is not a valid substitution key.

/**
 * GET /api/pharmacy/search?query=&lat=&lng=
 * Search medicines by brand name or composition; returns nearby pharmacy stock.
 */
router.get("/search", requireAuth, async (req, res) => {
  const { query } = req.query;
  // TODO: full-text search against medicines table + geo join against pharmacy_stock.
  res.json({
    query,
    results: [],
    message: "Search endpoint placeholder — wire up to medicines + pharmacy_stock tables.",
  });
});

/**
 * GET /api/pharmacy/alternatives/:medicineId
 * Returns other medicines with the same composition/salt + strength,
 * flagged with substitution warnings for sensitive drug classes.
 */
router.get("/alternatives/:medicineId", requireAuth, async (req, res) => {
  // TODO: SELECT * FROM medicines WHERE composition = (SELECT composition FROM medicines WHERE id = $1) AND id != $1
  res.json({
    medicineId: req.params.medicineId,
    alternatives: [],
    requiresPharmacistConfirmation: true,
    substitutionCaution: SUBSTITUTION_CAUTION_CLASSES,
  });
});

// Drug classes where "same composition, different brand" swaps still need explicit
// pharmacist/doctor sign-off because bioavailability, delivery mechanism, or dosing
// precision differs meaningfully between brands.
const SUBSTITUTION_CAUTION_CLASSES = [
  "modified_release",
  "combination_drugs",
  "insulin",
  "inhalers",
  "narrow_therapeutic_index", // e.g. warfarin, levothyroxine, phenytoin, digoxin
];

/**
 * POST /api/pharmacy/savings-calculator
 * Body: { brandMedicinePrice: number, alternativeMedicinePrice: number }
 */
router.post("/savings-calculator", requireAuth, (req, res) => {
  const { brandMedicinePrice, alternativeMedicinePrice } = req.body;

  if (typeof brandMedicinePrice !== "number" || typeof alternativeMedicinePrice !== "number") {
    return res.status(400).json({ error: "brandMedicinePrice and alternativeMedicinePrice must be numbers" });
  }

  const savings = Number((brandMedicinePrice - alternativeMedicinePrice).toFixed(2));
  const savingsPercent =
    brandMedicinePrice > 0 ? Number(((savings / brandMedicinePrice) * 100).toFixed(1)) : 0;

  res.json({
    brandMedicinePrice,
    alternativeMedicinePrice,
    savings,
    savingsPercent,
    note: "A pharmacist or doctor must confirm any substitution before you switch, especially for modified-release, combination, insulin, inhaler, or narrow-safety-margin medicines.",
  });
});

module.exports = router;
