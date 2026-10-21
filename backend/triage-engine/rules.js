/**
 * RULE-BASED TRIAGE ENGINE
 * ------------------------
 * This file is the single source of truth for red-flag detection. It MUST run
 * before any AI/ML classification, and its verdict cannot be downgraded by the
 * AI service — only upgraded (AI can escalate Green->Yellow or Yellow->Red if
 * it detects something concerning, but never the reverse).
 *
 * Keep this file's logic mirrored in ai-service/safety-red-flag-rules/rules.py.
 *
 * Input shape (answers collected by the guided questionnaire):
 * {
 *   condition: "fever" | "headache" | "cough_cold" | "stomach_pain" | "vomiting" |
 *              "diarrhea" | "skin_issue" | "menstrual" | "stress_anxiety" |
 *              "allergy" | "minor_injury",
 *   ageGroup: "infant_0_3m" | "infant_3_12m" | "child_1_12y" | "teen_13_17y" |
 *             "adult_18_59y" | "senior_60plus" | "pregnant",
 *   durationDays: number,
 *   severity: 1-10,
 *   flags: string[]   // free selection from checkboxes, e.g. ["breathing_difficulty"]
 *   chronicConditions: string[],
 *   currentMedicines: string[],
 *   temperatureC?: number,
 * }
 */

const TRIAGE = Object.freeze({ RED: "RED", YELLOW: "YELLOW", GREEN: "GREEN" });

// Flags that are an automatic RED regardless of which condition flow they came from.
// These map to the "Important Safety Rules" list: breathing trouble, unconsciousness,
// chest pain, stroke-like symptoms, severe bleeding, suicidal intent.
const UNIVERSAL_RED_FLAGS = new Set([
  "breathing_difficulty",
  "severe_breathing_difficulty",
  "unconsciousness",
  "unresponsive",
  "chest_pain",
  "stroke_symptoms", // facial droop, slurred speech, one-sided weakness
  "severe_bleeding",
  "suicidal_intent",
  "self_harm_intent",
  "seizure",
  "severe_allergic_reaction", // anaphylaxis: swelling, throat tightness, whole-body hives
  "blue_lips_or_face",
  "non_blanching_rash", // rash that doesn't fade under pressure
]);

function hasAnyFlag(answers, flagSet) {
  return (answers.flags || []).some((f) => flagSet.has ? flagSet.has(f) : flagSet.includes(f));
}

/**
 * Condition-specific red flag checks. Each returns true if this condition's
 * answers independently justify a RED verdict, even without a universal flag.
 */
const CONDITION_RED_RULES = {
  fever: (a) => {
    const highTemp = typeof a.temperatureC === "number" && a.temperatureC >= 40;
    const veryYoungInfant = a.ageGroup === "infant_0_3m"; // ANY fever in <3 months = ER
    const neuroSigns = hasAnyFlag(a, ["stiff_neck", "severe_headache", "confusion", "seizure"]);
    const prolongedHighFeverChild =
      (a.ageGroup === "infant_3_12m" || a.ageGroup === "child_1_12y") &&
      a.durationDays >= 5 &&
      a.severity >= 7;
    return highTemp || veryYoungInfant || neuroSigns || prolongedHighFeverChild;
  },

  headache: (a) =>
    hasAnyFlag(a, ["worst_headache_of_life", "stroke_symptoms", "stiff_neck", "vision_loss", "head_injury_before_onset"]),

  cough_cold: (a) =>
    hasAnyFlag(a, ["breathing_difficulty", "blue_lips_or_face", "coughing_blood", "chest_pain"]) ||
    (a.ageGroup === "infant_0_3m" && a.severity >= 5),

  stomach_pain: (a) =>
    hasAnyFlag(a, ["severe_bleeding", "vomiting_blood", "black_tarry_stool", "rigid_abdomen"]) ||
    (a.severity >= 8 && a.durationDays <= 1) ||
    a.ageGroup === "pregnant",

  vomiting: (a) =>
    hasAnyFlag(a, ["vomiting_blood", "signs_severe_dehydration", "unresponsive"]) ||
    (a.ageGroup === "infant_0_3m") ||
    (a.durationDays >= 2 && a.severity >= 7),

  diarrhea: (a) =>
    hasAnyFlag(a, ["blood_in_stool", "signs_severe_dehydration"]) ||
    (a.ageGroup === "infant_0_3m" || a.ageGroup === "infant_3_12m") && a.severity >= 6,

  skin_issue: (a) => hasAnyFlag(a, ["severe_allergic_reaction", "rapidly_spreading_rash", "non_blanching_rash"]),

  menstrual: (a) =>
    hasAnyFlag(a, ["soaking_pad_hourly", "severe_bleeding", "fainting", "pregnancy_with_severe_pain"]),

  stress_anxiety: (a) =>
    hasAnyFlag(a, ["suicidal_intent", "self_harm_intent", "plan_or_means_for_self_harm", "psychosis_signs"]),

  allergy: (a) => hasAnyFlag(a, ["severe_allergic_reaction", "throat_tightness", "swelling_face_lips"]),

  minor_injury: (a) =>
    hasAnyFlag(a, ["severe_bleeding", "suspected_fracture_deformity", "head_injury_with_confusion", "unresponsive"]),
};

// Condition-specific YELLOW thresholds (doctor consult, not emergency).
const CONDITION_YELLOW_RULES = {
  fever: (a) => a.durationDays >= 3 || a.severity >= 5 || (a.chronicConditions || []).length > 0,
  headache: (a) => a.durationDays >= 3 || a.severity >= 6,
  cough_cold: (a) => a.durationDays >= 7 || a.severity >= 6,
  stomach_pain: (a) => a.durationDays >= 2 || a.severity >= 5,
  vomiting: (a) => a.durationDays >= 1 || a.severity >= 5,
  diarrhea: (a) => a.durationDays >= 2 || a.severity >= 5,
  skin_issue: (a) => a.durationDays >= 5 || a.severity >= 5,
  menstrual: (a) => a.severity >= 6,
  stress_anxiety: (a) => a.durationDays >= 14 || a.severity >= 6,
  allergy: (a) => a.severity >= 5,
  minor_injury: (a) => a.severity >= 5,
};

/**
 * Runs the full rule-based triage. Returns { level, reasons, requiresRuleOverride }.
 * This function must be pure and synchronous — no network/AI calls here.
 */
function evaluateTriage(answers) {
  const reasons = [];

  if (hasAnyFlag(answers, UNIVERSAL_RED_FLAGS)) {
    reasons.push("Universal emergency red flag present");
    return finalize(TRIAGE.RED, reasons);
  }

  const conditionRedCheck = CONDITION_RED_RULES[answers.condition];
  if (conditionRedCheck && conditionRedCheck(answers)) {
    reasons.push(`Condition-specific red flag for '${answers.condition}'`);
    return finalize(TRIAGE.RED, reasons);
  }

  const conditionYellowCheck = CONDITION_YELLOW_RULES[answers.condition];
  if (conditionYellowCheck && conditionYellowCheck(answers)) {
    reasons.push(`Condition-specific consult threshold met for '${answers.condition}'`);
    return finalize(TRIAGE.YELLOW, reasons);
  }

  reasons.push("No red or yellow triggers matched; safe self-care guidance applies");
  return finalize(TRIAGE.GREEN, reasons);
}

function finalize(level, reasons) {
  return {
    level,
    reasons,
    disclaimer:
      "This is not a final medical diagnosis. In an emergency, contact emergency services immediately.",
  };
}

/**
 * The AI service may only ESCALATE (Green->Yellow, Yellow->Red, Green->Red), never downgrade.
 * Call this after getting the AI service's suggested level.
 */
function reconcileWithAiSuggestion(ruleResult, aiSuggestedLevel) {
  const order = [TRIAGE.GREEN, TRIAGE.YELLOW, TRIAGE.RED];
  const ruleIdx = order.indexOf(ruleResult.level);
  const aiIdx = order.indexOf(aiSuggestedLevel);
  if (aiIdx > ruleIdx) {
    return finalize(aiSuggestedLevel, [...ruleResult.reasons, "Escalated by AI triage model"]);
  }
  return ruleResult;
}

module.exports = {
  TRIAGE,
  UNIVERSAL_RED_FLAGS,
  evaluateTriage,
  reconcileWithAiSuggestion,
};
