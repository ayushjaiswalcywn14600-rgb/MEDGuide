"""
MEDGUIDE AI microservice.

Every request that involves triage MUST pass through
safety-red-flag-rules.rules.evaluate_triage BEFORE any classification model
runs. If that returns RED, we short-circuit and never touch the ML model —
this keeps emergency responses fast and removes any chance of an ML model
talking someone out of a genuine emergency.

This file wires up route groups; each submodule under ai-service/ owns its
own logic and (eventually) its own model-loading code.
"""

from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
import importlib.util
import os

# Directory names follow the project's kebab-case convention
# (ai-service/safety-red-flag-rules/), which isn't a valid Python identifier,
# so we load rules.py by file path rather than a normal package import.
_rules_path = os.path.join(os.path.dirname(__file__), "safety-red-flag-rules", "rules.py")
_spec = importlib.util.spec_from_file_location("safety_red_flag_rules", _rules_path)
_rules_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_rules_module)
evaluate_triage = _rules_module.evaluate_triage
TriageLevel = _rules_module.TriageLevel

app = FastAPI(title="MEDGUIDE AI Service", version="0.1.0")


def _check_api_key(x_api_key: Optional[str]):
    expected = os.getenv("AI_SERVICE_API_KEY")
    if expected and x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


@app.get("/health")
def health():
    return {"status": "ok", "service": "medguide-ai-service"}


class TriageAnswers(BaseModel):
    condition: str
    ageGroup: str
    durationDays: float
    severity: int
    flags: list[str] = []
    chronicConditions: list[str] = []
    currentMedicines: list[str] = []
    temperatureC: Optional[float] = None


@app.post("/triage/rule-check")
def rule_check(answers: TriageAnswers, x_api_key: Optional[str] = Header(default=None)):
    """
    Mirrors the Node.js rule engine. The Node backend is the primary caller
    of the JS version; this endpoint exists so the AI service can run the
    identical check independently before invoking symptom-classification,
    in case it's called directly (e.g. from a background job or another
    service) without going through the main backend first.
    """
    _check_api_key(x_api_key)
    result = evaluate_triage(answers.model_dump())
    return result


@app.post("/symptom-classification/suggest")
def suggest_triage_level(answers: TriageAnswers, x_api_key: Optional[str] = Header(default=None)):
    """
    Placeholder for the actual ML/LLM-based symptom classifier. Only ever
    called when rule_check() above returns GREEN or YELLOW — never called
    when a red flag is present, and its output can only escalate the level
    that the rule engine already produced (see triage-engine/rules.js
    reconcileWithAiSuggestion).
    """
    _check_api_key(x_api_key)

    rule_result = evaluate_triage(answers.model_dump())
    if rule_result["level"] == TriageLevel.RED.value:
        # Defensive: should never be reached if caller respects the contract,
        # but never let a downstream model call happen on a red case.
        return rule_result

    # TODO: replace with a real model call (e.g. a fine-tuned classifier or
    # a carefully prompted LLM constrained to {"GREEN","YELLOW","RED"} output,
    # never a free-text "diagnosis").
    return {
        **rule_result,
        "aiSuggestedLevel": rule_result["level"],
        "note": "ML classification not yet implemented — returning rule-based level unchanged.",
    }


# Sub-routers for the remaining ai-service capabilities are intentionally
# left as scaffolds. Wire each up with `app.include_router(...)` once built:
#   - language_detection.router   (ai-service/language-detection)
#   - speech_to_text.router       (ai-service/speech-to-text)
#   - translation.router          (ai-service/translation)
#   - image_document_analysis.router (ai-service/image-document-analysis)
#   - symptom_classification.router  (ai-service/symptom-classification)
