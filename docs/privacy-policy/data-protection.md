# Data Protection & Consent — DPDP Act 2023 Alignment

MEDGUIDE processes sensitive personal health data and must comply with
India's Digital Personal Data Protection (DPDP) Act, 2023, which requires
consent to be **clear, specific, informed, and revocable**.
(Reference: https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf)

## Consent design principles

- Consent is requested **per purpose**, not as one blanket checkbox —
  e.g. separately for "analyze my symptoms," "use my history for future
  recommendations," and "send me marketing messages."
- Consent language is in the user's selected language, in plain terms —
  no legal jargon buried in a long scroll.
- Every consent event (grant or withdrawal) is timestamped, versioned against
  the exact policy text shown, and written to `audit_logs` — see
  `backend/shared/auditLog.js` and the `consents` table in `schema.sql`.
- Withdrawing consent is as easy as granting it — a visible toggle in
  Settings, not a support-ticket process.
- Past history is used for personalized recommendations **only** after
  explicit, separate opt-in — never bundled into general app usage consent.

## User rights implemented in-product

| Right | Where |
|---|---|
| View my data | Health Records / Health Timeline screen |
| Download my data | Export button on Health Records (JSON/PDF) |
| Correct my data | Edit flows on profile, family profiles, and self-reported entries |
| Delete my data | Delete button per record + full account deletion in Settings |
| Withdraw consent | Consent toggles in Settings → Privacy |

## Encryption

- **In transit:** TLS 1.2+ for all client-server and service-to-service traffic.
- **At rest:** AES-256 encryption for the database and file storage (S3/Cloudinary).
  Encryption is only meaningful if actually enabled and key-managed correctly —
  verify KMS configuration before claiming "256-bit encryption" in marketing copy.

## Data minimization

- Raw uploaded files (images, voice notes, videos) are stored in object storage,
  referenced by pointer (`raw_input_ref` / `file_ref`) in the database — not
  duplicated across tables.
- AI service calls receive only the data needed for the specific task
  (e.g. translation doesn't need medical history).

## Audit logging

The following actions are always logged to the append-only `audit_logs` table:
doctor verification decisions, health record access/export/deletion,
prescription creation/modification, SOS trigger/cancel, and consent changes.
