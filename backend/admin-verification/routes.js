const express = require("express");
const { requireAuth, requireRole } = require("../shared/authMiddleware");
const { writeAuditLog } = require("../shared/auditLog");

const router = express.Router();

// Module: admin-verification
// Responsibility: doctor/clinic KYC review queue, audit log viewer
// NOTE: This is a scaffold. Replace in-memory/placeholder logic with real
// Postgres queries (see backend/shared/db.js) and proper validation (zod)
// before production use.

router.get("/", requireAuth, async (req, res) => {
  res.json({ module: "admin-verification", message: "List endpoint placeholder — implement query against Postgres." });
});

router.get("/:id", requireAuth, async (req, res) => {
  res.json({ module: "admin-verification", id: req.params.id, message: "Detail endpoint placeholder." });
});

router.post("/", requireAuth, async (req, res) => {
  // TODO: validate req.body with zod, insert into DB
  await writeAuditLog({
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "ADMIN_VERIFICATION_CREATE",
    targetType: "admin-verification",
    targetId: null,
    metadata: {},
  });
  res.status(201).json({ module: "admin-verification", message: "Create endpoint placeholder." });
});

router.put("/:id", requireAuth, async (req, res) => {
  await writeAuditLog({
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "ADMIN_VERIFICATION_UPDATE",
    targetType: "admin-verification",
    targetId: req.params.id,
    metadata: {},
  });
  res.json({ module: "admin-verification", id: req.params.id, message: "Update endpoint placeholder." });
});

router.delete("/:id", requireAuth, async (req, res) => {
  await writeAuditLog({
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "ADMIN_VERIFICATION_DELETE",
    targetType: "admin-verification",
    targetId: req.params.id,
    metadata: {},
  });
  res.json({ module: "admin-verification", id: req.params.id, message: "Delete endpoint placeholder." });
});

module.exports = router;
