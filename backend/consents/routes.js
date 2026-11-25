const express = require("express");
const { z } = require("zod");
const { pool } = require("../shared/db");
const { requireAuth } = require("../shared/authMiddleware");
const { writeAuditLog } = require("../shared/auditLog");

const router = express.Router();

const CONSENT_VERSION = "2024.1-dpdp";

const consentSchema = z.object({
  purpose: z.enum([
    "symptom_analysis",
    "history_based_recommendations",
    "care_navigation",
    "emergency_dispatch",
    "marketing",
  ]),
  granted: z.boolean(),
  version: z.string().default(CONSENT_VERSION),
});

const withdrawSchema = z.object({
  purpose: z.enum([
    "symptom_analysis",
    "history_based_recommendations",
    "care_navigation",
    "emergency_dispatch",
    "marketing",
  ]),
  version: z.string().default(CONSENT_VERSION),
});

/**
 * GET /api/consents/policy-text
 * Returns versioned consent disclosure and purpose descriptions in English & Hindi.
 */
router.get("/policy-text", (_req, res) => {
  res.json({
    version: CONSENT_VERSION,
    effectiveDate: "2024-06-01",
    dpdpCompliant: true,
    purposes: {
      symptom_analysis: {
        en: "Processing self-reported symptoms through rule engines and AI to suggest care triage urgency (Green, Yellow, or Red).",
        hi: "आपके लक्षणों का विश्लेषण कर उचित देखभाल स्तर (हरा, पीला, या लाल) सुझाना।",
        requiredForTriage: true,
      },
      history_based_recommendations: {
        en: "Using previous consultations and health records to provide personalized health guidance and drug interaction alerts.",
        hi: "पिछली परामर्शों और स्वास्थ्य रिकॉर्ड के आधार पर व्यक्तिगत मार्गदर्शन और दवाओं के टकराव की चेतावनी।",
        requiredForTriage: false,
      },
      care_navigation: {
        en: "Displaying verified doctors, clinics, and pharmacies based on location and medical specialty.",
        hi: "स्थान और चिकित्सा विशेषता के आधार पर सत्यापित डॉक्टरों, क्लीनिकों और फार्मेसी को दिखाना।",
        requiredForTriage: false,
      },
      emergency_dispatch: {
        en: "Transmitting emergency SOS alerts and GPS coordinates to designated emergency contacts and ambulance services.",
        hi: "आपातकालीन स्थिति में आपके स्थान और संपर्क विवरण को सहायता सेवाओं और नामित संपर्कों तक पहुंचाना।",
        requiredForTriage: false,
      },
      marketing: {
        en: "Sending non-essential health tips, service updates, and preventive care reminders.",
        hi: "स्वास्थ्य सुझाव और निवारक देखभाल से संबंधित सूचनाएं भेजना।",
        requiredForTriage: false,
      },
    },
  });
});

/**
 * GET /api/consents
 * Lists latest active status for all consent purposes for the authenticated user.
 */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (purpose)
         id, purpose, granted, granted_at, withdrawn_at, version
       FROM consents
       WHERE user_id = $1
       ORDER BY purpose, COALESCE(withdrawn_at, granted_at) DESC, id DESC`,
      [req.user.id]
    );

    res.json({ consents: result.rows, currentPolicyVersion: CONSENT_VERSION });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/consents
 * Grants or updates consent for a specific purpose under DPDP Act 2023.
 */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { purpose, granted, version } = consentSchema.parse(req.body);

    const now = new Date();
    const result = await pool.query(
      `INSERT INTO consents (user_id, purpose, granted, granted_at, withdrawn_at, version)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.id, purpose, granted, granted ? now : null, granted ? null : now, version]
    );

    const consentRecord = result.rows[0];

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: granted ? "CONSENT_GRANT" : "CONSENT_WITHDRAW",
      targetType: "consent",
      targetId: consentRecord.id,
      metadata: { purpose, granted, version },
    });

    res.status(201).json({
      message: granted ? "Consent granted successfully" : "Consent withdrawn",
      consent: consentRecord,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/consents/withdraw
 * Revokes a previously granted consent purpose.
 */
router.post("/withdraw", requireAuth, async (req, res, next) => {
  try {
    const { purpose, version } = withdrawSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO consents (user_id, purpose, granted, granted_at, withdrawn_at, version)
       VALUES ($1, $2, FALSE, NULL, NOW(), $3)
       RETURNING *`,
      [req.user.id, purpose, version]
    );

    const record = result.rows[0];

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "CONSENT_WITHDRAW",
      targetType: "consent",
      targetId: record.id,
      metadata: { purpose, version },
    });

    res.json({ message: `Consent for '${purpose}' successfully withdrawn`, consent: record });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/consents/history
 * Full audit history of consent events for data subject rights under DPDP Act 2023.
 */
router.get("/history", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, purpose, granted, granted_at, withdrawn_at, version
       FROM consents
       WHERE user_id = $1
       ORDER BY COALESCE(withdrawn_at, granted_at) DESC`,
      [req.user.id]
    );

    res.json({ history: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
