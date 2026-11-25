const express = require("express");
const { z } = require("zod");
const { pool } = require("../shared/db");
const { requireAuth, requireRole } = require("../shared/authMiddleware");
const { getSmsProvider } = require("../providers/sms");

const router = express.Router();

const preferencesSchema = z.object({
  smsEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  appointmentReminders: z.boolean().optional(),
  healthAlerts: z.boolean().optional(),
  marketing: z.boolean().optional(),
});

const dispatchSchema = z.object({
  userId: z.string().uuid("Invalid user UUID"),
  title: z.string().min(1).max(255),
  body: z.string().min(1),
  type: z
    .enum(["general", "appointment", "prescription", "sos", "triage", "system"])
    .default("general"),
  channel: z.enum(["in_app", "sms", "push"]).default("in_app"),
  metadata: z.record(z.any()).optional().default({}),
});

/**
 * Core helper function for dispatching notifications.
 * Can be exported and called directly from backend modules (appointments, emergency-sos, etc.)
 */
async function dispatchNotification({
  userId,
  title,
  body,
  type = "general",
  channel = "in_app",
  metadata = {},
}) {
  // 1. Fetch user preferences
  const prefResult = await pool.query(`SELECT * FROM notification_preferences WHERE user_id = $1`, [
    userId,
  ]);
  const prefs = prefResult.rows[0] || {
    sms_enabled: true,
    push_enabled: true,
    email_enabled: false,
    appointment_reminders: true,
    health_alerts: true,
    marketing: false,
  };

  // Check category suppression
  if (type === "appointment" && !prefs.appointment_reminders) {
    return { dispatched: false, reason: "appointment_reminders_disabled" };
  }
  if (type === "triage" && !prefs.health_alerts) {
    return { dispatched: false, reason: "health_alerts_disabled" };
  }

  // 2. Dispatch to external channel if requested
  let deliveryStatus = "delivered";
  if (channel === "sms" && prefs.sms_enabled) {
    try {
      const userRes = await pool.query(`SELECT phone FROM users WHERE id = $1`, [userId]);
      if (userRes.rows.length > 0 && userRes.rows[0].phone) {
        const smsProvider = getSmsProvider();
        await smsProvider.sendSms(userRes.rows[0].phone, `${title}: ${body}`);
      }
    } catch (err) {
      console.error("SMS notification dispatch failed:", err.message);
      deliveryStatus = "failed";
    }
  }

  // 3. Always store in-app notification record
  const insertResult = await pool.query(
    `INSERT INTO notifications (user_id, title, body, type, channel, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [userId, title, body, type, channel, deliveryStatus, JSON.stringify(metadata)]
  );

  return { dispatched: true, notification: insertResult.rows[0] };
}

/**
 * GET /api/notifications
 * Lists in-app notifications for authenticated user.
 */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const unreadOnly = req.query.unreadOnly === "true";
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "50", 10)));
    const offset = Math.max(0, parseInt(req.query.offset || "0", 10));

    let query = `SELECT * FROM notifications WHERE user_id = $1`;
    const params = [req.user.id];

    if (unreadOnly) {
      query += ` AND read = FALSE`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    const countResult = await pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE read = FALSE) as unread_count,
         COUNT(*) as total_count
       FROM notifications
       WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({
      unreadCount: parseInt(countResult.rows[0]?.unread_count || "0", 10),
      totalCount: parseInt(countResult.rows[0]?.total_count || "0", 10),
      notifications: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
router.patch("/:id/read", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE notifications
       SET read = TRUE
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ message: "Notification marked as read", notification: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/notifications/read-all
 * Mark all user notifications as read.
 */
router.patch("/read-all", requireAuth, async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE notifications
       SET read = TRUE
       WHERE user_id = $1 AND read = FALSE`,
      [req.user.id]
    );

    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/notifications/preferences
 * Fetch user notification preferences.
 */
router.get("/preferences", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM notification_preferences WHERE user_id = $1`, [
      req.user.id,
    ]);

    if (result.rows.length === 0) {
      return res.json({
        preferences: {
          smsEnabled: true,
          pushEnabled: true,
          emailEnabled: false,
          appointmentReminders: true,
          healthAlerts: true,
          marketing: false,
        },
      });
    }

    const row = result.rows[0];
    res.json({
      preferences: {
        smsEnabled: row.sms_enabled,
        pushEnabled: row.push_enabled,
        emailEnabled: row.email_enabled,
        appointmentReminders: row.appointment_reminders,
        healthAlerts: row.health_alerts,
        marketing: row.marketing,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/notifications/preferences
 * Update user notification preferences.
 */
router.patch("/preferences", requireAuth, async (req, res, next) => {
  try {
    const data = preferencesSchema.parse(req.body);

    const query = `
      INSERT INTO notification_preferences (
        user_id, sms_enabled, push_enabled, email_enabled,
        appointment_reminders, health_alerts, marketing, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        sms_enabled = COALESCE(EXCLUDED.sms_enabled, notification_preferences.sms_enabled),
        push_enabled = COALESCE(EXCLUDED.push_enabled, notification_preferences.push_enabled),
        email_enabled = COALESCE(EXCLUDED.email_enabled, notification_preferences.email_enabled),
        appointment_reminders = COALESCE(EXCLUDED.appointment_reminders, notification_preferences.appointment_reminders),
        health_alerts = COALESCE(EXCLUDED.health_alerts, notification_preferences.health_alerts),
        marketing = COALESCE(EXCLUDED.marketing, notification_preferences.marketing),
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      req.user.id,
      data.smsEnabled !== undefined ? data.smsEnabled : true,
      data.pushEnabled !== undefined ? data.pushEnabled : true,
      data.emailEnabled !== undefined ? data.emailEnabled : false,
      data.appointmentReminders !== undefined ? data.appointmentReminders : true,
      data.healthAlerts !== undefined ? data.healthAlerts : true,
      data.marketing !== undefined ? data.marketing : false,
    ];

    const result = await pool.query(query, values);
    const row = result.rows[0];

    res.json({
      message: "Preferences updated successfully",
      preferences: {
        smsEnabled: row.sms_enabled,
        pushEnabled: row.push_enabled,
        emailEnabled: row.email_enabled,
        appointmentReminders: row.appointment_reminders,
        healthAlerts: row.health_alerts,
        marketing: row.marketing,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notifications/dispatch
 * Internal/Admin endpoint to dispatch a notification.
 */
router.post(
  "/dispatch",
  requireAuth,
  requireRole("super_admin", "clinic_admin", "doctor"),
  async (req, res, next) => {
    try {
      const data = dispatchSchema.parse(req.body);
      const result = await dispatchNotification(data);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
module.exports.dispatchNotification = dispatchNotification;
