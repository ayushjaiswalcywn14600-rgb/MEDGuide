const express = require("express");
const { v4: uuid } = require("uuid");
const { requireAuth } = require("../shared/authMiddleware");
const { writeAuditLog } = require("../shared/auditLog");

const router = express.Router();

// In-memory placeholder; replace with a Postgres table (sos_events) in production.
const activeSosEvents = new Map();

/**
 * POST /api/emergency-sos/trigger
 * Body: { latitude, longitude, triggeredFrom: "home_button" | "lock_screen_widget" | "red_triage" }
 * Creates a pending SOS event. Does NOT dispatch anything yet — the client
 * shows an "I am safe / Confirm SOS" screen first to reduce accidental triggers,
 * UNLESS triggeredFrom === "red_triage", in which case dispatch is immediate
 * because a rule-based red-flag triage already confirmed urgency.
 */
router.post("/trigger", requireAuth, async (req, res, next) => {
  try {
    const { latitude, longitude, triggeredFrom = "home_button" } = req.body;
    const eventId = uuid();
    const autoConfirmed = triggeredFrom === "red_triage";

    activeSosEvents.set(eventId, {
      id: eventId,
      userId: req.user.id,
      latitude,
      longitude,
      triggeredFrom,
      status: autoConfirmed ? "dispatched" : "pending_confirmation",
      createdAt: new Date().toISOString(),
    });

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "SOS_TRIGGERED",
      targetType: "sos_event",
      targetId: eventId,
      metadata: { triggeredFrom, autoConfirmed },
    });

    if (autoConfirmed) {
      await dispatchEmergencyServices(eventId);
    }

    res.status(201).json({
      eventId,
      status: activeSosEvents.get(eventId).status,
      requiresConfirmation: !autoConfirmed,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/emergency-sos/:eventId/confirm
 * User taps "Confirm SOS" -> actually dispatches ambulance/police/contacts.
 */
router.post("/:eventId/confirm", requireAuth, async (req, res, next) => {
  try {
    const event = activeSosEvents.get(req.params.eventId);
    if (!event || event.userId !== req.user.id) return res.status(404).json({ error: "SOS event not found" });

    await dispatchEmergencyServices(event.id);
    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "SOS_CONFIRMED",
      targetType: "sos_event",
      targetId: event.id,
    });

    res.json({ eventId: event.id, status: "dispatched" });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/emergency-sos/:eventId/cancel
 * User taps "I am safe / Cancel SOS" before confirmation.
 */
router.post("/:eventId/cancel", requireAuth, async (req, res, next) => {
  try {
    const event = activeSosEvents.get(req.params.eventId);
    if (!event || event.userId !== req.user.id) return res.status(404).json({ error: "SOS event not found" });
    if (event.status === "dispatched") {
      return res.status(409).json({ error: "Already dispatched; call emergency services directly to stand down." });
    }

    event.status = "cancelled";
    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "SOS_CANCELLED",
      targetType: "sos_event",
      targetId: event.id,
    });

    res.json({ eventId: event.id, status: "cancelled" });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/emergency-sos/nearby-help?lat=..&lng=..
 * Returns nearest ER, ambulance dispatch contact, and blood bank using
 * Google Maps + ABDM HFR lookups (stubbed here).
 */
router.get("/nearby-help", requireAuth, async (req, res, next) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: "lat and lng are required" });

    // TODO: replace with real Google Maps Places + ABDM Health Facility Registry calls.
    res.json({
      nearestER: { name: "TODO: query ABDM HFR", distanceKm: null },
      ambulanceNumber: process.env.NATIONAL_EMERGENCY_NUMBER || "112",
      nearestBloodBank: { name: "TODO: query ABDM HFR", distanceKm: null },
    });
  } catch (err) {
    next(err);
  }
});

async function dispatchEmergencyServices(eventId) {
  const event = activeSosEvents.get(eventId);
  if (!event) return;
  event.status = "dispatched";
  event.dispatchedAt = new Date().toISOString();
  // TODO: integrate ambulance dispatch API, SMS/FCM to emergency contacts, live location share link.
  console.log(`[SOS] Dispatch pipeline triggered for event ${eventId}`);
}

module.exports = router;
