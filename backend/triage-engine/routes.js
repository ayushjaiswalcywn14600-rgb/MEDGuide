const express = require("express");
const { z } = require("zod");
const { pool } = require("../shared/db");
const { requireAuth } = require("../shared/authMiddleware");
const { writeAuditLog } = require("../shared/auditLog");
const { evaluateTriage, reconcileWithAiSuggestion, TRIAGE } = require("./rules");
const { getAiTriageSuggestion } = require("../shared/aiClient");
const { env } = require("../shared/env");

const router = express.Router();

const triageInputSchema = z.object({
  symptomSessionId: z.string().uuid().optional(),
  condition: z.string(),
  ageGroup: z.string(),
  durationDays: z.number().nonnegative(),
  severity: z.number().min(1).max(10),
  flags: z.array(z.string()).default([]),
  chronicConditions: z.array(z.string()).default([]),
  currentMedicines: z.array(z.string()).default([]),
  temperatureC: z.number().optional(),
  consultAi: z.boolean().default(false),
});

const reconcileSchema = z.object({
  symptomSessionId: z.string().uuid().optional(),
  ruleResult: z.object({
    level: z.enum(["GREEN", "YELLOW", "RED"]),
    reasons: z.array(z.string()),
    disclaimer: z.string().optional(),
  }),
  aiSuggestedLevel: z.enum(["GREEN", "YELLOW", "RED"]),
});

/**
 * Checks for self-harm or suicidal intent flags and constructs the Tele-MANAS emergency block.
 */
function checkSelfHarmProtocol(answers) {
  const flags = answers.flags || [];
  const isSelfHarm =
    flags.includes("suicidal_intent") ||
    flags.includes("self_harm_intent") ||
    flags.includes("plan_or_means_for_self_harm");

  if (isSelfHarm) {
    return {
      isSelfHarm: true,
      helpline: env.TELE_MANAS_HELPLINE || "14416",
      tollFree: "1-800-891-4416",
      name: "Tele-MANAS: National Tele Mental Health Programme of India",
      availability: "24 hours / 7 days a week (Free & Confidential)",
      emergencyNumber: env.NATIONAL_EMERGENCY_NUMBER || "112",
      immediateAction:
        "Please speak with a counselor immediately. Help is available right now at 14416 or call 112.",
    };
  }
  return null;
}

/**
 * POST /api/triage/evaluate
 * Evaluates rule-based triage synchronously.
 * 1. Hard-coded rules run FIRST.
 * 2. If RED: short-circuits immediately. Never calls AI.
 * 3. If suicidal/self-harm: attaches Tele-MANAS India helpline details.
 * 4. If non-RED and consultAi: queries AI service through circuit breaker for possible escalation.
 * 5. Persists in `triage_results`.
 */
router.post("/evaluate", requireAuth, async (req, res, next) => {
  try {
    const answers = triageInputSchema.parse(req.body);

    // 1. Mandatory Rule-Based Evaluation (Runs first, pure & synchronous)
    let triageResult = evaluateTriage(answers);

    // 2. Check Self-Harm / Suicidal Intent Emergency Protocol
    const selfHarmInfo = checkSelfHarmProtocol(answers);
    if (selfHarmInfo) {
      triageResult.level = TRIAGE.RED;
      triageResult.reasons.unshift(
        "Suicidal or self-harm intent detected — immediate mental health support required"
      );
      triageResult.mentalHealthHelpline = selfHarmInfo;
    }

    let escalatedByAi = false;

    // 3. AI Service Call (Only for non-RED, if consultAi is requested)
    if (triageResult.level !== TRIAGE.RED && answers.consultAi) {
      const aiResponse = await getAiTriageSuggestion(answers, triageResult);
      if (aiResponse && aiResponse.aiSuggestedLevel) {
        const reconciled = reconcileWithAiSuggestion(triageResult, aiResponse.aiSuggestedLevel);
        if (reconciled.level !== triageResult.level) {
          escalatedByAi = true;
          triageResult = reconciled;
        }
      }
    }

    // 4. Persist in `triage_results` if a symptom session is provided
    let savedTriageId = null;
    if (answers.symptomSessionId) {
      const insertResult = await pool.query(
        `INSERT INTO triage_results (symptom_session_id, level, reasons, escalated_by_ai)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          answers.symptomSessionId,
          triageResult.level,
          JSON.stringify(triageResult.reasons),
          escalatedByAi,
        ]
      );
      savedTriageId = insertResult.rows[0].id;
    }

    // 5. Audit Logging
    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "TRIAGE_EVALUATED",
      targetType: "triage_result",
      targetId: savedTriageId,
      metadata: {
        condition: answers.condition,
        level: triageResult.level,
        escalatedByAi,
        hasSelfHarmFlag: !!selfHarmInfo,
      },
    });

    const responsePayload = {
      ...triageResult,
      triageResultId: savedTriageId,
      escalatedByAi,
      emergencyContacts: {
        nationalEmergency: env.NATIONAL_EMERGENCY_NUMBER || "112",
        ambulance: env.NATIONAL_AMBULANCE_NUMBER || "108",
      },
    };

    if (triageResult.level === TRIAGE.RED) {
      responsePayload.redirectTo = "/emergency-sos";
      responsePayload.alertNote =
        "EMERGENCY: Immediate medical attention required. Please call 112 or 108.";
    }

    return res.json(responsePayload);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/triage/reconcile
 * Validated with Zod. Strict server-side enforcement that AI can ONLY escalate (never downgrade).
 */
router.post("/reconcile", requireAuth, async (req, res, next) => {
  try {
    const { ruleResult, aiSuggestedLevel, symptomSessionId } = reconcileSchema.parse(req.body);

    // Enforce escalation-only contract
    const finalResult = reconcileWithAiSuggestion(ruleResult, aiSuggestedLevel);
    const escalated = finalResult.level !== ruleResult.level;

    if (symptomSessionId) {
      await pool.query(
        `INSERT INTO triage_results (symptom_session_id, level, reasons, escalated_by_ai)
         VALUES ($1, $2, $3, $4)`,
        [symptomSessionId, finalResult.level, JSON.stringify(finalResult.reasons), escalated]
      );
    }

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "TRIAGE_RECONCILED",
      targetType: "triage_result",
      targetId: null,
      metadata: {
        ruleLevel: ruleResult.level,
        aiSuggestedLevel,
        finalLevel: finalResult.level,
        escalated,
      },
    });

    res.json({
      ...finalResult,
      escalatedByAi: escalated,
      redirectTo: finalResult.level === TRIAGE.RED ? "/emergency-sos" : null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
