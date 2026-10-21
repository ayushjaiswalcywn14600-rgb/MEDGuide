# Emergency Red Flags — Source of Truth

This document is the human-readable source of truth for MEDGUIDE's rule-based
emergency detection. Any change here must be mirrored in:

- `backend/triage-engine/rules.js`
- `ai-service/safety-red-flag-rules/rules.py`

Rule-based checks always run **before** any AI/ML model call. A RED verdict
short-circuits everything else and routes the user straight to the SOS screen.

## Universal red flags (any condition flow)

- Severe breathing difficulty / cannot speak in full sentences
- Unconsciousness or unresponsiveness
- Chest pain
- Stroke-like symptoms (facial droop, slurred speech, one-sided weakness)
- Severe or uncontrolled bleeding
- Suicidal or self-harm intent
- Seizure
- Signs of severe allergic reaction / anaphylaxis (throat tightness, whole-body swelling)
- Blue-tinged lips or face
- Non-blanching rash (doesn't fade when pressed)

## Fever flow — condition-specific red flags

1. **Fever + breathing difficulty** (fast/labored breathing, chest pain, bluish lips/nails)
2. **Fever + neurological signs** (stiff neck, severe headache, confusion, seizure, unresponsiveness)
3. **Fever + non-blanching rash, uncontrolled bleeding, or an infant under 3 months with any fever**

Additional fever-specific triggers:
- Temperature ≥ 40°C (104°F) at any age
- Any fever at all in an infant younger than 3 months
- Fever lasting 5+ days at severity ≥7 in infants (3–12 months) or children (1–12 years)

## Other condition flows (summary — see rules.js/rules.py for full logic)

| Condition | Red flag triggers |
|---|---|
| Headache | Worst headache of life, stroke symptoms, stiff neck, vision loss, head injury before onset |
| Cough/cold | Breathing difficulty, blue lips/face, coughing blood, chest pain, unwell infant <3 months |
| Stomach pain | Severe bleeding, vomiting blood, black/tarry stool, rigid abdomen, severe pain <1 day, pregnancy |
| Vomiting | Vomiting blood, severe dehydration signs, unresponsive, infant <3 months, prolonged + severe |
| Diarrhea | Blood in stool, severe dehydration signs, young infant with high severity |
| Skin issue | Severe allergic reaction, rapidly spreading or non-blanching rash |
| Menstrual | Soaking a pad hourly, severe bleeding, fainting, severe pain in pregnancy |
| Stress/anxiety | Suicidal/self-harm intent or plan, psychosis signs |
| Allergy | Severe allergic reaction, throat tightness, facial/lip swelling |
| Minor injury | Severe bleeding, suspected fracture/deformity, head injury with confusion, unresponsive |

## Escalation rule for AI

The AI symptom-classification model may only **escalate** a triage level
(Green → Yellow, Yellow → Red, Green → Red). It can never downgrade a
rule-based verdict. See `reconcileWithAiSuggestion()` in `rules.js`.

## Mandatory disclaimer

Every triage result, regardless of level, must display:

> "This is not a final medical diagnosis. In an emergency, contact emergency
> services immediately."
