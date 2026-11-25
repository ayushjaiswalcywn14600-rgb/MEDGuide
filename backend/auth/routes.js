const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { pool } = require("../shared/db");
const { getRedisClient } = require("../shared/redis");
const { getSmsProvider } = require("../providers/sms");
const { writeAuditLog } = require("../shared/auditLog");
const { requireAuth } = require("../shared/authMiddleware");
const { env } = require("../shared/env");

const router = express.Router();

const phoneRegex = /^\+?[1-9]\d{9,14}$/;
const phoneSchema = z.object({
  phone: z
    .string()
    .regex(
      phoneRegex,
      "Must be a valid 10-15 digit phone number (e.g. +919876543210 or 9876543210)"
    ),
});

const verifySchema = z.object({
  phone: z.string(),
  otp: z.string().length(6, "OTP must be 6 digits"),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

function formatPhone(phone) {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * POST /api/auth/otp/request
 * Generates 6-digit cryptographic OTP, checks cooldown, persists in Redis (5 min TTL),
 * and dispatches via pluggable SMS provider.
 */
router.post("/otp/request", async (req, res, next) => {
  try {
    const parsed = phoneSchema.parse(req.body);
    const phone = formatPhone(parsed.phone);
    const ip = req.ip || req.connection.remoteAddress || "unknown_ip";

    const redis = getRedisClient();

    // 1. Resend Cooldown Check (60 seconds)
    const cooldownKey = `otp_cooldown:${phone}`;
    const inCooldown = await redis.get(cooldownKey);
    if (inCooldown) {
      return res.status(429).json({
        error: "Please wait 60 seconds before requesting another OTP",
        retryAfterSeconds: 60,
      });
    }

    // 2. Hourly Per-Phone Rate Limit (Max 5 requests per hour)
    const rateKey = `otp_rate:${phone}`;
    const requestCount = await redis.incr(rateKey);
    if (requestCount === 1) {
      await redis.expire(rateKey, 3600);
    } else if (requestCount > 5) {
      return res.status(429).json({
        error: "Hourly OTP request limit exceeded for this number. Please try again later.",
      });
    }

    // 3. Cryptographic OTP Generation (6 digits: 100000 - 999999)
    const otp = String(crypto.randomInt(100000, 1000000));

    // 4. Persist OTP with 5-minute TTL (300 seconds)
    const otpKey = `otp:${phone}`;
    await redis.set(otpKey, otp, "EX", 300);

    // Set 60-second resend cooldown
    await redis.set(cooldownKey, "1", "EX", 60);

    // Reset failed verification attempt counter for this OTP
    await redis.del(`otp_attempts:${phone}`);

    // 5. Send via pluggable SMS Provider
    const smsProvider = getSmsProvider();
    await smsProvider.sendOtp(phone, otp);

    return res.json({
      message: "OTP sent successfully",
      expiresInSeconds: 300,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/otp/verify
 * Validates OTP against Redis, enforces max 5 failed attempts,
 * creates or fetches user in Postgres, generates rotating refresh token + JWT.
 */
router.post("/otp/verify", async (req, res, next) => {
  try {
    const { phone: rawPhone, otp } = verifySchema.parse(req.body);
    const phone = formatPhone(rawPhone);

    const redis = getRedisClient();
    const otpKey = `otp:${phone}`;
    const attemptsKey = `otp_attempts:${phone}`;

    // 1. Check max failed attempts (Max 5)
    const attempts = await redis.incr(attemptsKey);
    if (attempts > 5) {
      await redis.del(otpKey);
      return res.status(429).json({
        error: "Maximum verification attempts exceeded. Please request a new OTP.",
      });
    }

    // 2. Retrieve active OTP
    const storedOtp = await redis.get(otpKey);
    if (!storedOtp) {
      return res.status(401).json({ error: "OTP has expired or was not requested" });
    }

    // Constant-time comparison to prevent timing attacks
    const otpMatches = crypto.timingSafeEqual(Buffer.from(storedOtp), Buffer.from(otp));
    if (!otpMatches) {
      const remaining = 5 - attempts;
      return res.status(401).json({
        error: `Invalid OTP. ${remaining} attempt(s) remaining.`,
        remainingAttempts: Math.max(0, remaining),
      });
    }

    // 3. OTP verified successfully — clear from Redis
    await redis.del(otpKey);
    await redis.del(attemptsKey);
    await redis.del(`otp_cooldown:${phone}`);

    // 4. PostgreSQL User Lookup or Creation
    let user;
    let isNewUser = false;

    const existingResult = await pool.query("SELECT * FROM users WHERE phone = $1", [phone]);

    if (existingResult.rows.length > 0) {
      user = existingResult.rows[0];
    } else {
      isNewUser = true;
      const insertResult = await pool.query(
        `INSERT INTO users (phone, role, preferred_language, caregiver_mode)
         VALUES ($1, 'patient', 'en', FALSE)
         RETURNING *`,
        [phone]
      );
      user = insertResult.rows[0];
    }

    // 5. Generate Rotating Refresh Token and Hash in DB
    const refreshToken = crypto.randomBytes(40).toString("hex");
    const hashedRefreshToken = hashToken(refreshToken);

    await pool.query("UPDATE users SET refresh_token_hash = $1, updated_at = NOW() WHERE id = $2", [
      hashedRefreshToken,
      user.id,
    ]);

    // 6. Sign Access Token JWT
    const accessToken = jwt.sign(
      {
        id: user.id,
        phone: user.phone,
        role: user.role,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN || "7d" }
    );

    // 7. Audit Log Login
    await writeAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: isNewUser ? "USER_SIGNUP" : "USER_LOGIN",
      targetType: "user",
      targetId: user.id,
      metadata: { phone, isNewUser },
    });

    return res.json({
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        phone: user.phone,
        fullName: user.full_name,
        role: user.role,
        preferredLanguage: user.preferred_language,
        caregiverMode: user.caregiver_mode,
      },
      isNewUser,
      requiresConsentSetup: isNewUser,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/token/refresh
 * Validates rotating refresh token against DB hash, rotates it, and issues new JWT.
 */
router.post("/token/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    const incomingHash = hashToken(refreshToken);

    const userResult = await pool.query("SELECT * FROM users WHERE refresh_token_hash = $1", [
      incomingHash,
    ]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: "Invalid or revoked refresh token" });
    }

    const user = userResult.rows[0];

    // Rotate refresh token
    const newRefreshToken = crypto.randomBytes(40).toString("hex");
    const newHashed = hashToken(newRefreshToken);

    await pool.query("UPDATE users SET refresh_token_hash = $1, updated_at = NOW() WHERE id = $2", [
      newHashed,
      user.id,
    ]);

    const newAccessToken = jwt.sign(
      { id: user.id, phone: user.phone, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN || "7d" }
    );

    return res.json({
      token: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout
 * Revokes current refresh token and logs out the user.
 */
router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await pool.query("UPDATE users SET refresh_token_hash = NULL WHERE id = $1", [req.user.id]);

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "USER_LOGOUT",
      targetType: "user",
      targetId: req.user.id,
    });

    return res.json({ message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
