# MEDGUIDE API — Overview

Base URL (dev): `http://localhost:4000/api`
AI service base URL (dev): `http://localhost:8001`

All authenticated routes require `Authorization: Bearer <JWT>`, issued by
`POST /api/auth/otp/verify`.

## Route groups

| Prefix | Module | Notes |
|---|---|---|
| `/auth` | auth | OTP request/verify, no auth required to call |
| `/users` | users | Profile CRUD |
| `/family-profiles` | family-profiles | Manage linked family members |
| `/symptom-intake` | symptom-intake | Free-text + guided questionnaire submission |
| `/triage` | triage-engine | `POST /evaluate` — rule-based Green/Yellow/Red |
| `/directory` | doctor-clinic-directory | Search verified doctors/clinics |
| `/appointments` | appointments | Booking, reschedule, cancel |
| `/video-consultation` | video-consultation | Session tokens, consent gate |
| `/prescriptions` | prescriptions | Doctor-issued e-prescriptions |
| `/pharmacy` | pharmacy-medicine | Medicine search, alternatives, `/savings-calculator` |
| `/health-records` | health-records | Timeline, uploads, export/delete |
| `/emergency-sos` | emergency-sos | `/trigger`, `/:eventId/confirm`, `/:eventId/cancel`, `/nearby-help` |
| `/reviews` | reviews-testimonials | Moderated patient reviews |
| `/notifications` | notifications | Push/SMS/in-app dispatch |
| `/admin/verification` | admin-verification | Doctor/clinic KYC review (admin only) |

## Key safety-critical endpoints

### `POST /api/triage/evaluate`
Runs the rule-based engine (`backend/triage-engine/rules.js`) synchronously.
A RED result returns immediately with `redirectTo: "/emergency-sos"` and skips
any AI call.

### `POST /api/emergency-sos/trigger`
Creates a pending SOS event. Requires explicit confirmation via
`POST /:eventId/confirm` unless `triggeredFrom: "red_triage"`, in which case
dispatch is automatic because the rule engine already confirmed urgency.

### `POST /api/pharmacy/savings-calculator`
`{ brandMedicinePrice, alternativeMedicinePrice } -> { savings, savingsPercent }`
Always paired with a substitution-caution note; never presented as a
standalone "just switch" recommendation.

## AI service endpoints (internal, called by backend only)

- `POST /triage/rule-check` — Python mirror of the JS rule engine
- `POST /symptom-classification/suggest` — only reachable for non-RED cases;
  can only escalate the triage level, never downgrade it

Full OpenAPI schema for the AI service is auto-generated at
`http://localhost:8001/docs` once the service is running.
