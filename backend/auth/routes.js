const express = require("express");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { writeAuditLog } = require("../shared/auditLog");

const router = express.Router();

// In-memory OTP store placeholder — use Redis with TTL in production.
const otpStore = new Map();

const phoneSchema = z.object({ phone: z.string().min(10).max(15) });
const verifySchema = z.object({ phone: z.string(), otp: z.string().length(6) });

/**
 * POST /api/auth/otp/request
 * Sends a 6-digit OTP via SMS provider (configured through OTP_PROVIDER_API_KEY).
 */
router.post("/otp/request", async (req, res, next) => {
  try {
    const { phone } = phoneSchema.parse(req.body);
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

    // TODO: integrate real SMS provider here.
    console.log(`[DEV ONLY] OTP for ${phone}: ${otp}`);

    res.json({ message: "OTP sent" });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/otp/verify
 * Verifies OTP, creates/looks up the user, returns a JWT.
 * Consent screen must be shown by the client immediately after first signup,
 * before any symptom data is collected.
 */
router.post("/otp/verify", async (req, res, next) => {
  try {
    const { phone, otp } = verifySchema.parse(req.body);
    const record = otpStore.get(phone);

    if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
      return res.status(401).json({ error: "Invalid or expired OTP" });
    }
    otpStore.delete(phone);

    // TODO: replace with real DB lookup/creation in `users` table.
    const user = { id: `user_${phone}`, phone, role: "patient", isNewUser: true };

    const token = jwt.sign(
      { id: user.id, phone: user.phone, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    await writeAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: "LOGIN_SUCCESS",
      targetType: "user",
      targetId: user.id,
    });

    res.json({ token, user, requiresConsentSetup: user.isNewUser });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
