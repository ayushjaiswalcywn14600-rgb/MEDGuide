const express = require("express");
const { z } = require("zod");
const { pool } = require("../shared/db");
const { requireAuth } = require("../shared/authMiddleware");
const { requireConsent } = require("../shared/consentGate");
const { writeAuditLog } = require("../shared/auditLog");
const { QUESTIONNAIRES } = require("./questionnaires");

const router = express.Router();

const conditionList = [
  "fever",
  "headache",
  "cough_cold",
  "stomach_pain",
  "vomiting",
  "diarrhea",
  "skin_issue",
  "menstrual",
  "stress_anxiety",
  "allergy",
  "minor_injury",
];

const startSessionSchema = z.object({
  condition: z.enum(conditionList),
  inputMode: z.enum(["guided_form", "text", "voice", "image"]).default("guided_form"),
  familyProfileId: z.string().uuid().optional().nullable(),
  detectedLanguage: z.string().default("en"),
  answers: z.record(z.any()).default({}),
});

const freeTextIntakeSchema = z.object({
  description: z
    .string()
    .min(5, "Please provide at least a few words describing your symptom")
    .max(2000),
  familyProfileId: z.string().uuid().optional().nullable(),
  preferredLanguage: z.string().default("en"),
});

/**
 * GET /api/symptom-intake/questionnaires
 * Returns available conditions and question bank definitions.
 */
router.get("/questionnaires", (req, res) => {
  const lang = req.query.lang === "hi" ? "hi" : "en";
  res.json({
    supportedConditions: conditionList,
    questionnaires: QUESTIONNAIRES,
    currentLanguage: lang,
  });
});

/**
 * GET /api/symptom-intake/questionnaires/:condition
 * Returns questions for a specific condition.
 */
router.get("/questionnaires/:condition", (req, res) => {
  const condition = req.params.condition;
  const q = QUESTIONNAIRES[condition];
  if (!q) {
    return res.status(404).json({ error: `Questionnaire not found for condition '${condition}'` });
  }
  res.json(q);
});

/**
 * POST /api/symptom-intake/sessions
 * DPDP Gate: Requires active consent for 'symptom_analysis'.
 * Persists user symptom answers in `symptom_sessions`.
 */
router.post(
  "/sessions",
  requireAuth,
  requireConsent("symptom_analysis"),
  async (req, res, next) => {
    try {
      const data = startSessionSchema.parse(req.body);

      // Verify family profile ownership if specified
      if (data.familyProfileId) {
        const familyCheck = await pool.query(
          "SELECT id FROM family_profiles WHERE id = $1 AND managed_by_user_id = $2",
          [data.familyProfileId, req.user.id]
        );
        if (familyCheck.rows.length === 0) {
          return res.status(403).json({ error: "Invalid family profile or access denied" });
        }
      }

      const result = await pool.query(
        `INSERT INTO symptom_sessions
           (user_id, family_profile_id, condition, input_mode, detected_language, answers)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          req.user.id,
          data.familyProfileId || null,
          data.condition,
          data.inputMode,
          data.detectedLanguage,
          JSON.stringify(data.answers),
        ]
      );

      const session = result.rows[0];

      await writeAuditLog({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: "SYMPTOM_SESSION_CREATED",
        targetType: "symptom_session",
        targetId: session.id,
        metadata: { condition: data.condition, inputMode: data.inputMode },
      });

      res.status(201).json({
        message: "Symptom session recorded successfully",
        session,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/symptom-intake/free-text
 * "Describe your problem" free-text entry endpoint.
 */
router.post(
  "/free-text",
  requireAuth,
  requireConsent("symptom_analysis"),
  async (req, res, next) => {
    try {
      const { description, familyProfileId, preferredLanguage } = freeTextIntakeSchema.parse(
        req.body
      );

      // Keyword-based condition matching for initial routing
      let matchedCondition = "fever";
      const lower = description.toLowerCase();
      if (lower.includes("headache") || lower.includes("sir dard") || lower.includes("sar dard"))
        matchedCondition = "headache";
      else if (
        lower.includes("cough") ||
        lower.includes("cold") ||
        lower.includes("khansi") ||
        lower.includes("zukam")
      )
        matchedCondition = "cough_cold";
      else if (lower.includes("stomach") || lower.includes("pet") || lower.includes("abdominal"))
        matchedCondition = "stomach_pain";
      else if (lower.includes("vomit") || lower.includes("ulti")) matchedCondition = "vomiting";
      else if (lower.includes("loose") || lower.includes("diarrhea") || lower.includes("dast"))
        matchedCondition = "diarrhea";
      else if (
        lower.includes("skin") ||
        lower.includes("rash") ||
        lower.includes("itching") ||
        lower.includes("khujli")
      )
        matchedCondition = "skin_issue";
      else if (lower.includes("period") || lower.includes("menstrual") || lower.includes("cramp"))
        matchedCondition = "menstrual";
      else if (
        lower.includes("stress") ||
        lower.includes("anxiety") ||
        lower.includes("depression") ||
        lower.includes("panic")
      )
        matchedCondition = "stress_anxiety";
      else if (lower.includes("allergy") || lower.includes("reaction"))
        matchedCondition = "allergy";
      else if (
        lower.includes("cut") ||
        lower.includes("burn") ||
        lower.includes("injury") ||
        lower.includes("fracture") ||
        lower.includes("chot")
      )
        matchedCondition = "minor_injury";

      const answers = {
        freeTextDescription: description,
        inferredCondition: matchedCondition,
      };

      const result = await pool.query(
        `INSERT INTO symptom_sessions
           (user_id, family_profile_id, condition, input_mode, detected_language, answers)
         VALUES ($1, $2, $3, 'text', $4, $5)
         RETURNING *`,
        [
          req.user.id,
          familyProfileId || null,
          matchedCondition,
          preferredLanguage,
          JSON.stringify(answers),
        ]
      );

      const session = result.rows[0];

      await writeAuditLog({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: "FREE_TEXT_SYMPTOM_SUBMITTED",
        targetType: "symptom_session",
        targetId: session.id,
        metadata: { matchedCondition },
      });

      res.status(201).json({
        message: "Free-text intake processed",
        session,
        suggestedCondition: matchedCondition,
        suggestedQuestionnaire: QUESTIONNAIRES[matchedCondition],
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/symptom-intake/sessions
 * Retrieves past symptom sessions for the current user.
 */
router.get("/sessions", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT s.*, t.level as triage_level, t.reasons as triage_reasons
       FROM symptom_sessions s
       LEFT JOIN triage_results t ON t.symptom_session_id = s.id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC`,
      [req.user.id]
    );

    res.json({ sessions: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/symptom-intake/sessions/:id
 * Retrieves specific session.
 */
router.get("/sessions/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT s.*, t.level as triage_level, t.reasons as triage_reasons
       FROM symptom_sessions s
       LEFT JOIN triage_results t ON t.symptom_session_id = s.id
       WHERE s.id = $1 AND s.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Symptom session not found or access denied" });
    }

    res.json({ session: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
