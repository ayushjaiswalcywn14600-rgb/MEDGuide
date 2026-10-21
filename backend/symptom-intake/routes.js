const express = require("express");
const { requireAuth, requireRole } = require("../shared/authMiddleware");
const { writeAuditLog } = require("../shared/auditLog");

const router = express.Router();

// Module: symptom-intake
// Responsibility: free-text + guided questionnaire submission, file/voice/image upload handoff to ai-service
// NOTE: This is a scaffold. Replace in-memory/placeholder logic with real
// Postgres queries (see backend/shared/db.js) and proper validation (zod)
// before production use.

router.get("/", requireAuth, async (req, res) => {
  res.json({ module: "symptom-intake", message: "List endpoint placeholder — implement query against Postgres." });
});

router.get("/:id", requireAuth, async (req, res) => {
  res.json({ module: "symptom-intake", id: req.params.id, message: "Detail endpoint placeholder." });
});

router.post("/", requireAuth, async (req, res) => {
  // TODO: validate req.body with zod, insert into DB
  await writeAuditLog({
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "SYMPTOM_INTAKE_CREATE",
    targetType: "symptom-intake",
    targetId: null,
    metadata: {},
  });
  res.status(201).json({ module: "symptom-intake", message: "Create endpoint placeholder." });
});

router.put("/:id", requireAuth, async (req, res) => {
  await writeAuditLog({
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "SYMPTOM_INTAKE_UPDATE",
    targetType: "symptom-intake",
    targetId: req.params.id,
    metadata: {},
  });
  res.json({ module: "symptom-intake", id: req.params.id, message: "Update endpoint placeholder." });
});

router.delete("/:id", requireAuth, async (req, res) => {
  await writeAuditLog({
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "SYMPTOM_INTAKE_DELETE",
    targetType: "symptom-intake",
    targetId: req.params.id,
    metadata: {},
  });
  res.json({ module: "symptom-intake", id: req.params.id, message: "Delete endpoint placeholder." });
});

module.exports = router;
