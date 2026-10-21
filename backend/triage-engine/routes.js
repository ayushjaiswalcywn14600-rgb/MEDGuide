const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("../shared/authMiddleware");
const { writeAuditLog } = require("../shared/auditLog");
const { evaluateTriage, reconcileWithAiSuggestion, TRIAGE } = require("./rules");

const router = express.Router();

const triageInputSchema = z.object({
  condition: z.string(),
  ageGroup: z.string(),
  durationDays: z.number().nonnegative(),
  severity: z.number().min(1).max(10),
  flags: z.array(z.string()).default([]),
  chronicConditions: z.array(z.string()).default([]),
  currentMedicines: z.array(z.string()).default([]),
  temperatureC: z.number().optional(),
});

/**
 * POST /api/triage/evaluate
 * Runs rule-based triage synchronously. If the result is not RED, and the
 * request opts in, the caller may separately invoke the AI service for a
 * refined suggestion — but the rule engine's RED verdict is final and
 * short-circuits everything, including any AI call, to avoid latency in
 * an emergency.
 */
router.post("/evaluate", requireAuth, async (req, res, next) => {
  try {
    const answers = triageInputSchema.parse(req.body);
    const result = evaluateTriage(answers);

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "TRIAGE_EVALUATED",
      targetType: "triage_session",
      targetId: null,
      metadata: { condition: answers.condition, level: result.level },
    });

    if (result.level === TRIAGE.RED) {
      // Short-circuit: client should immediately route to the SOS/emergency screen.
      return res.json({ ...result, redirectTo: "/emergency-sos" });
    }

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/triage/reconcile
 * Body: { ruleResult, aiSuggestedLevel }
 * Used after ai-service/symptom-classification returns a suggestion for a
 * non-red case. Can only escalate, never downgrade.
 */
router.post("/reconcile", requireAuth, (req, res, next) => {
  try {
    const { ruleResult, aiSuggestedLevel } = req.body;
    const final = reconcileWithAiSuggestion(ruleResult, aiSuggestedLevel);
    res.json(final);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
