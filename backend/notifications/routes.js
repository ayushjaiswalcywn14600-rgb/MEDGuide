const express = require("express");
const { requireAuth, requireRole } = require("../shared/authMiddleware");
const { writeAuditLog } = require("../shared/auditLog");

const router = express.Router();

// Module: notifications
// Responsibility: FCM push, SMS, and in-app notification dispatch
// NOTE: This is a scaffold. Replace in-memory/placeholder logic with real
// Postgres queries (see backend/shared/db.js) and proper validation (zod)
// before production use.

router.get("/", requireAuth, async (req, res) => {
  res.json({ module: "notifications", message: "List endpoint placeholder — implement query against Postgres." });
});

router.get("/:id", requireAuth, async (req, res) => {
  res.json({ module: "notifications", id: req.params.id, message: "Detail endpoint placeholder." });
});

router.post("/", requireAuth, async (req, res) => {
  // TODO: validate req.body with zod, insert into DB
  await writeAuditLog({
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "NOTIFICATIONS_CREATE",
    targetType: "notifications",
    targetId: null,
    metadata: {},
  });
  res.status(201).json({ module: "notifications", message: "Create endpoint placeholder." });
});

router.put("/:id", requireAuth, async (req, res) => {
  await writeAuditLog({
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "NOTIFICATIONS_UPDATE",
    targetType: "notifications",
    targetId: req.params.id,
    metadata: {},
  });
  res.json({ module: "notifications", id: req.params.id, message: "Update endpoint placeholder." });
});

router.delete("/:id", requireAuth, async (req, res) => {
  await writeAuditLog({
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "NOTIFICATIONS_DELETE",
    targetType: "notifications",
    targetId: req.params.id,
    metadata: {},
  });
  res.json({ module: "notifications", id: req.params.id, message: "Delete endpoint placeholder." });
});

module.exports = router;
