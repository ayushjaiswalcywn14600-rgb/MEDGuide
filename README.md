# MEDGUIDE

MEDGUIDE is a **health-navigation and care-access platform** for India — not a diagnostic app.
It safely collects symptoms, runs rule-based (then AI-assisted) triage, connects users to
verified doctors/clinics, manages medicines and health records, and handles emergencies.

> ⚠️ MEDGUIDE never issues a final diagnosis and never lets AI prescribe medicine.
> Every triage path runs through hard-coded rule-based red-flag checks *before* any AI model
> is consulted. In an emergency, users are told to contact emergency services immediately.

## Repo layout

```
medguide/
├── apps/
│   ├── mobile-app/        # React Native (patient-facing)
│   ├── web-app/           # React + Next.js (patient-facing web)
│   └── admin-dashboard/   # React + Next.js (doctor/clinic verification, moderation)
├── backend/                # Node.js/Express REST API, one folder per domain module
│   ├── auth/
│   ├── users/
│   ├── family-profiles/
│   ├── symptom-intake/
│   ├── triage-engine/      # rule-based red/yellow/green logic — see below
│   ├── doctor-clinic-directory/
│   ├── appointments/
│   ├── video-consultation/
│   ├── prescriptions/
│   ├── pharmacy-medicine/
│   ├── health-records/
│   ├── emergency-sos/
│   ├── reviews-testimonials/
│   ├── notifications/
│   └── admin-verification/
├── ai-service/              # Python FastAPI microservice, only called AFTER rule checks pass
│   ├── language-detection/
│   ├── speech-to-text/
│   ├── translation/
│   ├── image-document-analysis/
│   ├── symptom-classification/
│   └── safety-red-flag-rules/
└── docs/
    ├── api-documentation/
    ├── privacy-policy/
    └── emergency-protocols/
```

## Getting started

```bash
# 1. Install root + backend dependencies
npm install

# 2. Copy env template and fill in secrets
cp .env.example .env

# 3. Start backend (Express) in dev mode
cd backend && npm run dev

# 4. Start AI microservice
cd ai-service && pip install -r requirements.txt --break-system-packages
uvicorn main:app --reload --port 8001

# 5. Start web app
cd apps/web-app && npm install && npm run dev
```

Or bring everything up with Docker:

```bash
docker compose up --build
```

## Build order (MVP)

1. Login, multilingual UI, profile, family profile
2. Guided common-symptom forms (`backend/symptom-intake`)
3. Green/Yellow/Red rule-based triage (`backend/triage-engine`)
4. Nearby clinic & doctor directory (`backend/doctor-clinic-directory`)
5. Appointment booking (`backend/appointments`)
6. Health record uploads & timeline (`backend/health-records`)
7. SOS emergency feature (`backend/emergency-sos`)
8. Medicine price comparison (`backend/pharmacy-medicine`)
9. Video consultation (`backend/video-consultation`)
10. AI-based voice, image, and personalized-history features (`ai-service/*`)

## Non-negotiable safety rules

See [`docs/emergency-protocols/red-flags.md`](docs/emergency-protocols/red-flags.md) and
[`backend/triage-engine/rules.js`](backend/triage-engine/rules.js) — these two files are the
source of truth for every hard-stop emergency rule and must be kept in sync with the Python
mirror in `ai-service/safety-red-flag-rules/rules.py`.

- Rule-based red-flag checks run **before** any AI/ML model call, every time.
- AI never outputs a confirmed diagnosis or a prescription — only draft suggestions a licensed
  clinician must approve.
- All health records are encrypted in transit (TLS) and at rest (AES-256); see
  `docs/privacy-policy/data-protection.md`.
- Users can view, export, correct, delete, and withdraw consent for their data at any time
  (DPDP Act, 2023 compliant — consent must be clear, specific, informed, and revocable).
- Every doctor verification, record access, prescription change, SOS trigger, and consent
  change is written to an immutable audit log (`backend/admin-verification/audit-log.js`).
