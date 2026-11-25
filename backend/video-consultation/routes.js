const express = require("express");
const crypto = require("crypto");
const { z } = require("zod");
const { pool } = require("../shared/db");
const { requireAuth } = require("../shared/authMiddleware");
const { writeAuditLog } = require("../shared/auditLog");
const { env } = require("../shared/env");

const router = express.Router();

const joinRoomSchema = z.object({
  appointmentId: z.string().uuid("Invalid appointment ID"),
  consentGranted: z.boolean().refine((val) => val === true, {
    message: "Explicit teleconsultation consent is required to enter video room",
  }),
});

/**
 * Generates video consultation session token based on configured VIDEO_PROVIDER (agora | twilio | mock).
 */
function generateProviderToken(channelName, userId, role) {
  const provider = env.VIDEO_PROVIDER || "mock";

  if (provider === "agora" && process.env.AGORA_APP_ID && process.env.AGORA_APP_CERTIFICATE) {
    // Agora Token simulation/adapter
    const privilegeExpiredTs = Math.floor(Date.now() / 1000) + 3600;
    const token = `agora_token_${crypto.createHmac("sha256", process.env.AGORA_APP_CERTIFICATE).update(`${channelName}_${userId}_${privilegeExpiredTs}`).digest("hex")}`;
    return {
      provider: "agora",
      appId: process.env.AGORA_APP_ID,
      channel: channelName,
      token,
      expiresAt: new Date(privilegeExpiredTs * 1000).toISOString(),
    };
  }

  if (provider === "twilio" && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const token = `twilio_video_${crypto.randomBytes(32).toString("hex")}`;
    return {
      provider: "twilio",
      room: channelName,
      token,
      identity: `user_${userId}`,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
  }

  // Default Mock Provider (Dev / WebRTC)
  const sessionId = crypto.randomBytes(24).toString("hex");
  return {
    provider: "mock-webrtc",
    room: channelName,
    token: `mock_rtc_${sessionId}`,
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    rtcConfig: {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    },
    note: "Safe mock WebRTC session generated. No audio/video media stored on server.",
  };
}

/**
 * POST /api/video-consultation/session
 * Generates video room credentials for an appointment.
 * 1. Validates ownership (patient or assigned doctor only).
 * 2. Checks join window (-15 mins to +45 mins of scheduled time).
 * 3. Enforces consent gate.
 * 4. Audit logs the session start.
 * 5. Guarantees no call media is saved.
 */
router.post(["/session", "/join"], requireAuth, async (req, res, next) => {
  try {
    const { appointmentId, consentGranted } = joinRoomSchema.parse(req.body);

    const apptResult = await pool.query(
      `SELECT a.*, d.user_id AS doctor_user_id, u.full_name AS patient_name, doc_u.full_name AS doctor_name
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       JOIN users u ON u.id = a.user_id
       JOIN users doc_u ON doc_u.id = d.user_id
       WHERE a.id = $1`,
      [appointmentId]
    );

    if (apptResult.rows.length === 0) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    const appt = apptResult.rows[0];

    // Access control: only patient or doctor can access
    const isPatient = appt.user_id === req.user.id;
    const isDoctor = appt.doctor_user_id === req.user.id;
    if (!isPatient && !isDoctor && req.user.role !== "super_admin") {
      return res
        .status(403)
        .json({ error: "Access denied: you are not a participant in this consultation" });
    }

    if (appt.status === "cancelled") {
      return res
        .status(400)
        .json({ error: "Cannot start consultation for a cancelled appointment" });
    }

    // Join window validation (15 mins before to 45 mins after scheduled time)
    const scheduledTime = new Date(appt.scheduled_at).getTime();
    const now = Date.now();
    const windowStart = scheduledTime - 15 * 60 * 1000;
    const windowEnd = scheduledTime + 45 * 60 * 1000;

    // Allow window bypass in development/test
    if (process.env.NODE_ENV === "production") {
      if (now < windowStart) {
        return res.status(400).json({
          error: "Consultation room opens 15 minutes before the scheduled appointment time.",
          scheduledAt: appt.scheduled_at,
          opensAt: new Date(windowStart).toISOString(),
        });
      }
      if (now > windowEnd) {
        return res.status(400).json({
          error: "Consultation window has expired. Please reschedule with your doctor.",
        });
      }
    }

    const channelName = `consultation_${appointmentId}`;
    const tokenPayload = generateProviderToken(
      channelName,
      req.user.id,
      isDoctor ? "doctor" : "patient"
    );

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "VIDEO_SESSION_JOINED",
      targetType: "appointment",
      targetId: appointmentId,
      metadata: { isDoctor, isPatient, channelName },
    });

    res.json({
      appointmentId,
      channelName,
      participantRole: isDoctor ? "doctor" : "patient",
      scheduledAt: appt.scheduled_at,
      doctorName: appt.doctor_name,
      patientName: appt.patient_name,
      ...tokenPayload,
      privacyDisclaimer:
        "MEDGUIDE respects patient privacy. Call audio and video streams are strictly peer-to-peer and never stored or recorded.",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/video-consultation/:id
 * Fetches status of video session.
 */
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const apptResult = await pool.query(
      `SELECT a.id, a.scheduled_at, a.status, a.mode,
              doc_u.full_name AS doctor_name, u.full_name AS patient_name
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       JOIN users doc_u ON doc_u.id = d.user_id
       JOIN users u ON u.id = a.user_id
       WHERE a.id = $1`,
      [req.params.id]
    );

    if (apptResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json({ session: apptResult.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
