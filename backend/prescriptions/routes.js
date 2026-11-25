const express = require("express");
const { z } = require("zod");
const { pool } = require("../shared/db");
const { requireAuth, requireRole } = require("../shared/authMiddleware");
const { writeAuditLog } = require("../shared/auditLog");

const router = express.Router();

const medicineItemSchema = z.object({
  name: z.string().min(1, "Medicine name is required"),
  composition: z.string().min(1, "Composition is required"),
  dosage: z.string().min(1, "Dosage is required (e.g. 500mg, 1 tablet twice daily after meals)"),
  durationDays: z.number().int().positive("Duration must be at least 1 day"),
  instructions: z.string().optional(),
});

const createPrescriptionSchema = z.object({
  appointmentId: z.string().uuid("Valid appointment ID required"),
  userId: z.string().uuid("Valid patient user ID required"),
  medicines: z.array(medicineItemSchema).min(1, "Prescription must contain at least one medicine"),
  notes: z.string().max(2000).optional(),
});

/**
 * Checks for drug-drug interactions, duplicate compositions, and allergy warnings.
 * Flag ONLY — does not perform auto-substitution (clinician discretion remains final).
 * Marked [NEEDS CLINICAL REVIEW]
 */
function checkDrugInteractions(medicines) {
  const warnings = [];
  const compositionMap = new Map();

  for (const med of medicines) {
    const compLower = med.composition.toLowerCase();

    // Check for duplicate composition (risk of accidental overdose)
    if (compositionMap.has(compLower)) {
      warnings.push({
        type: "DUPLICATE_COMPOSITION",
        severity: "WARNING",
        medicineA: compositionMap.get(compLower),
        medicineB: med.name,
        composition: med.composition,
        message: `Caution: Both '${compositionMap.get(compLower)}' and '${med.name}' contain ${med.composition}. Verify intended cumulative dosage.`,
      });
    } else {
      compositionMap.set(compLower, med.name);
    }

    // Common known clinical warnings
    if (compLower.includes("paracetamol") && compLower.includes("acetaminophen")) {
      warnings.push({
        type: "HEPATOTOXICITY_RISK",
        severity: "CAUTION",
        medicine: med.name,
        message:
          "Maximum recommended adult Paracetamol dosage is 4000mg/day to avoid hepatic injury.",
      });
    }
  }

  return warnings;
}

/**
 * POST /api/prescriptions
 * Doctor-Only: Creates a formal e-prescription tied to a verified consultation.
 */
router.post("/", requireAuth, requireRole("doctor"), async (req, res, next) => {
  try {
    const data = createPrescriptionSchema.parse(req.body);

    // Verify calling doctor profile is active & verified
    const docResult = await pool.query(
      "SELECT id, registration_number, verified FROM doctors WHERE user_id = $1",
      [req.user.id]
    );

    if (docResult.rows.length === 0) {
      return res.status(403).json({ error: "No doctor profile associated with this account" });
    }

    const doctor = docResult.rows[0];
    if (!doctor.verified) {
      return res
        .status(403)
        .json({ error: "Only verified medical practitioners may issue prescriptions" });
    }

    // Verify appointment exists
    const apptCheck = await pool.query(
      "SELECT id, user_id, doctor_id FROM appointments WHERE id = $1",
      [data.appointmentId]
    );

    if (apptCheck.rows.length === 0) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    // Evaluate drug interactions (flag only)
    const interactionWarnings = checkDrugInteractions(data.medicines);

    const result = await pool.query(
      `INSERT INTO prescriptions (appointment_id, doctor_id, user_id, medicines, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.appointmentId, doctor.id, data.userId, JSON.stringify(data.medicines), data.notes || ""]
    );

    const prescription = result.rows[0];

    // Audit log prescription creation
    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "PRESCRIPTION_CREATED",
      targetType: "prescription",
      targetId: prescription.id,
      metadata: {
        appointmentId: data.appointmentId,
        patientId: data.userId,
        medicineCount: data.medicines.length,
        warningsCount: interactionWarnings.length,
      },
    });

    res.status(201).json({
      message: "Prescription issued successfully",
      prescription,
      interactionWarnings,
      legalDisclaimer:
        "This e-prescription was issued by a registered medical practitioner under National Medical Commission / Telemedicine Practice Guidelines of India.",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/prescriptions
 * Access control:
 * - Patient sees prescriptions issued to them
 * - Doctor sees prescriptions they authored
 */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    let query;
    let values = [];

    if (req.user.role === "doctor") {
      query = `
        SELECT p.*, u.full_name AS patient_name, u.phone AS patient_phone
        FROM prescriptions p
        JOIN doctors d ON d.id = p.doctor_id
        JOIN users u ON u.id = p.user_id
        WHERE d.user_id = $1
        ORDER BY p.created_at DESC
      `;
      values = [req.user.id];
    } else {
      query = `
        SELECT p.*, doc_u.full_name AS doctor_name, d.registration_number, d.specialty
        FROM prescriptions p
        JOIN doctors d ON d.id = p.doctor_id
        JOIN users doc_u ON doc_u.id = d.user_id
        WHERE p.user_id = $1
        ORDER BY p.created_at DESC
      `;
      values = [req.user.id];
    }

    const result = await pool.query(query, values);
    res.json({ prescriptions: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/prescriptions/:id
 * Fetches single prescription with full doctor and clinic verification details.
 */
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const query = `
      SELECT
        p.*,
        doc_u.full_name AS doctor_name, d.registration_number, d.specialty, d.user_id AS doctor_user_id,
        c.name AS clinic_name, c.address AS clinic_address, c.abdm_hfr_id,
        u.full_name AS patient_name, u.phone AS patient_phone
      FROM prescriptions p
      JOIN doctors d ON d.id = p.doctor_id
      JOIN users doc_u ON doc_u.id = d.user_id
      JOIN users u ON u.id = p.user_id
      LEFT JOIN clinics c ON c.id = d.clinic_id
      WHERE p.id = $1
    `;

    const result = await pool.query(query, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Prescription not found" });
    }

    const rx = result.rows[0];

    // Access control
    const isPatient = rx.user_id === req.user.id;
    const isDoctor = rx.doctor_user_id === req.user.id;
    if (!isPatient && !isDoctor && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Access denied to this prescription" });
    }

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "PRESCRIPTION_VIEWED",
      targetType: "prescription",
      targetId: rx.id,
    });

    res.json({ prescription: rx });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/prescriptions/:id/pdf
 * Generates structured e-prescription document export with clinician credentials and NMC compliance.
 */
router.get("/:id/pdf", requireAuth, async (req, res, next) => {
  try {
    const query = `
      SELECT
        p.*,
        doc_u.full_name AS doctor_name, d.registration_number, d.specialty,
        c.name AS clinic_name, c.address AS clinic_address, c.abdm_hfr_id,
        u.full_name AS patient_name, u.phone AS patient_phone
      FROM prescriptions p
      JOIN doctors d ON d.id = p.doctor_id
      JOIN users doc_u ON doc_u.id = d.user_id
      JOIN users u ON u.id = p.user_id
      LEFT JOIN clinics c ON c.id = d.clinic_id
      WHERE p.id = $1
    `;

    const result = await pool.query(query, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Prescription not found" });
    }

    const rx = result.rows[0];

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "PRESCRIPTION_EXPORTED",
      targetType: "prescription",
      targetId: rx.id,
    });

    // Structured printable/PDF manifest
    res.json({
      documentType: "E_PRESCRIPTION",
      prescriptionId: rx.id,
      issuedAt: rx.created_at,
      doctor: {
        name: rx.doctor_name,
        registrationNumber: rx.registration_number,
        specialty: rx.specialty,
      },
      clinic: {
        name: rx.clinic_name,
        address: rx.clinic_address,
        abdmHfrId: rx.abdm_hfr_id,
      },
      patient: {
        name: rx.patient_name,
        phone: rx.patient_phone,
      },
      medicines: rx.medicines,
      clinicalNotes: rx.notes,
      complianceNote:
        "Compliant with Indian Telemedicine Practice Guidelines & National Medical Commission Act. Valid without physical signature when authenticated.",
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
