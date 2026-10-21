"""
Python mirror of backend/triage-engine/rules.js.

CRITICAL: This module runs BEFORE symptom-classification's ML model is ever
called. If a universal or condition-specific red flag is present, the ML
model is skipped entirely and RED is returned immediately — no added latency,
no chance of a model softening an emergency signal.

Keep this file's logic in sync with the Node.js version. Consider generating
both from a single shared YAML/JSON rule definition in a future iteration.
"""

from enum import Enum
from typing import Any


class TriageLevel(str, Enum):
    RED = "RED"
    YELLOW = "YELLOW"
    GREEN = "GREEN"


UNIVERSAL_RED_FLAGS = {
    "breathing_difficulty",
    "severe_breathing_difficulty",
    "unconsciousness",
    "unresponsive",
    "chest_pain",
    "stroke_symptoms",
    "severe_bleeding",
    "suicidal_intent",
    "self_harm_intent",
    "seizure",
    "severe_allergic_reaction",
    "blue_lips_or_face",
    "non_blanching_rash",
}


def _has_any_flag(answers: dict[str, Any], flag_set: set[str]) -> bool:
    return bool(flag_set.intersection(answers.get("flags", [])))


def _fever_red(a: dict[str, Any]) -> bool:
    high_temp = isinstance(a.get("temperatureC"), (int, float)) and a["temperatureC"] >= 40
    very_young_infant = a.get("ageGroup") == "infant_0_3m"
    neuro_signs = _has_any_flag(a, {"stiff_neck", "severe_headache", "confusion", "seizure"})
    prolonged_high_fever_child = (
        a.get("ageGroup") in {"infant_3_12m", "child_1_12y"}
        and a.get("durationDays", 0) >= 5
        and a.get("severity", 0) >= 7
    )
    return high_temp or very_young_infant or neuro_signs or prolonged_high_fever_child


CONDITION_RED_RULES = {
    "fever": _fever_red,
    "headache": lambda a: _has_any_flag(
        a, {"worst_headache_of_life", "stroke_symptoms", "stiff_neck", "vision_loss", "head_injury_before_onset"}
    ),
    "cough_cold": lambda a: _has_any_flag(
        a, {"breathing_difficulty", "blue_lips_or_face", "coughing_blood", "chest_pain"}
    )
    or (a.get("ageGroup") == "infant_0_3m" and a.get("severity", 0) >= 5),
    "stomach_pain": lambda a: _has_any_flag(
        a, {"severe_bleeding", "vomiting_blood", "black_tarry_stool", "rigid_abdomen"}
    )
    or (a.get("severity", 0) >= 8 and a.get("durationDays", 99) <= 1)
    or a.get("ageGroup") == "pregnant",
    "vomiting": lambda a: _has_any_flag(a, {"vomiting_blood", "signs_severe_dehydration", "unresponsive"})
    or a.get("ageGroup") == "infant_0_3m"
    or (a.get("durationDays", 0) >= 2 and a.get("severity", 0) >= 7),
    "diarrhea": lambda a: _has_any_flag(a, {"blood_in_stool", "signs_severe_dehydration"})
    or (a.get("ageGroup") in {"infant_0_3m", "infant_3_12m"} and a.get("severity", 0) >= 6),
    "skin_issue": lambda a: _has_any_flag(
        a, {"severe_allergic_reaction", "rapidly_spreading_rash", "non_blanching_rash"}
    ),
    "menstrual": lambda a: _has_any_flag(
        a, {"soaking_pad_hourly", "severe_bleeding", "fainting", "pregnancy_with_severe_pain"}
    ),
    "stress_anxiety": lambda a: _has_any_flag(
        a, {"suicidal_intent", "self_harm_intent", "plan_or_means_for_self_harm", "psychosis_signs"}
    ),
    "allergy": lambda a: _has_any_flag(a, {"severe_allergic_reaction", "throat_tightness", "swelling_face_lips"}),
    "minor_injury": lambda a: _has_any_flag(
        a, {"severe_bleeding", "suspected_fracture_deformity", "head_injury_with_confusion", "unresponsive"}
    ),
}

CONDITION_YELLOW_RULES = {
    "fever": lambda a: a.get("durationDays", 0) >= 3 or a.get("severity", 0) >= 5 or bool(a.get("chronicConditions")),
    "headache": lambda a: a.get("durationDays", 0) >= 3 or a.get("severity", 0) >= 6,
    "cough_cold": lambda a: a.get("durationDays", 0) >= 7 or a.get("severity", 0) >= 6,
    "stomach_pain": lambda a: a.get("durationDays", 0) >= 2 or a.get("severity", 0) >= 5,
    "vomiting": lambda a: a.get("durationDays", 0) >= 1 or a.get("severity", 0) >= 5,
    "diarrhea": lambda a: a.get("durationDays", 0) >= 2 or a.get("severity", 0) >= 5,
    "skin_issue": lambda a: a.get("durationDays", 0) >= 5 or a.get("severity", 0) >= 5,
    "menstrual": lambda a: a.get("severity", 0) >= 6,
    "stress_anxiety": lambda a: a.get("durationDays", 0) >= 14 or a.get("severity", 0) >= 6,
    "allergy": lambda a: a.get("severity", 0) >= 5,
    "minor_injury": lambda a: a.get("severity", 0) >= 5,
}

DISCLAIMER = "This is not a final medical diagnosis. In an emergency, contact emergency services immediately."


def evaluate_triage(answers: dict[str, Any]) -> dict[str, Any]:
    reasons: list[str] = []

    if _has_any_flag(answers, UNIVERSAL_RED_FLAGS):
        reasons.append("Universal emergency red flag present")
        return _finalize(TriageLevel.RED, reasons)

    condition = answers.get("condition")
    red_check = CONDITION_RED_RULES.get(condition)
    if red_check and red_check(answers):
        reasons.append(f"Condition-specific red flag for '{condition}'")
        return _finalize(TriageLevel.RED, reasons)

    yellow_check = CONDITION_YELLOW_RULES.get(condition)
    if yellow_check and yellow_check(answers):
        reasons.append(f"Condition-specific consult threshold met for '{condition}'")
        return _finalize(TriageLevel.YELLOW, reasons)

    reasons.append("No red or yellow triggers matched; safe self-care guidance applies")
    return _finalize(TriageLevel.GREEN, reasons)


def _finalize(level: TriageLevel, reasons: list[str]) -> dict[str, Any]:
    return {"level": level.value, "reasons": reasons, "disclaimer": DISCLAIMER}
