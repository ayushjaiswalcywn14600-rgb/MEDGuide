const express = require("express");
const { requireAuth, requireRole } = require("../shared/authMiddleware");
const { writeAuditLog } = require("../shared/auditLog");

const router = express.Router();

// Module: reviews-testimonials
// Responsibility: moderated patient reviews with verified-patient badge
// NOTE: This is a scaffold. Replace in-memory/placeholder logic with real
// Postgres queries (see backend/shared/db.js) and proper validation (zod)
// before production use.

router.get("/", requireAuth, async (req, res) => {
  res.json({ module: "reviews-testimonials", message: "List endpoint placeholder — implement query against Postgres." });
});

router.get("/:id", requireAuth, async (req, res) => {
  res.json({ module: "reviews-testimonials", id: req.params.id, message: "Detail endpoint placeholder." });
});

router.post("/", requireAuth, async (req, res) => {
  // TODO: validate req.body with zod, insert into DB
  await writeAuditLog({
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "REVIEWS_TESTIMONIALS_CREATE",
    targetType: "reviews-testimonials",
    targetId: null,
    metadata: {},
  });
  res.status(201).json({ module: "reviews-testimonials", message: "Create endpoint placeholder." });
});

router.put("/:id", requireAuth, async (req, res) => {
  await writeAuditLog({
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "REVIEWS_TESTIMONIALS_UPDATE",
    targetType: "reviews-testimonials",
    targetId: req.params.id,
    metadata: {},
  });
  res.json({ module: "reviews-testimonials", id: req.params.id, message: "Update endpoint placeholder." });
});

router.delete("/:id", requireAuth, async (req, res) => {
  await writeAuditLog({
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "REVIEWS_TESTIMONIALS_DELETE",
    targetType: "reviews-testimonials",
    targetId: req.params.id,
    metadata: {},
  });
  res.json({ module: "reviews-testimonials", id: req.params.id, message: "Delete endpoint placeholder." });
});

module.exports = router;
