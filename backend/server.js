require("dotenv").config();
const { env } = require("./shared/env");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { ZodError } = require("zod");

const authRoutes = require("./auth/routes");
const userRoutes = require("./users/routes");
const familyRoutes = require("./family-profiles/routes");
const symptomIntakeRoutes = require("./symptom-intake/routes");
const triageRoutes = require("./triage-engine/routes");
const directoryRoutes = require("./doctor-clinic-directory/routes");
const appointmentRoutes = require("./appointments/routes");
const videoRoutes = require("./video-consultation/routes");
const prescriptionRoutes = require("./prescriptions/routes");
const pharmacyRoutes = require("./pharmacy-medicine/routes");
const healthRecordRoutes = require("./health-records/routes");
const emergencyRoutes = require("./emergency-sos/routes");
const reviewRoutes = require("./reviews-testimonials/routes");
const notificationRoutes = require("./notifications/routes");
const adminVerificationRoutes = require("./admin-verification/routes");

const app = express();

// Security headers with helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration with allowlist
const allowedOrigins = env.CORS_ORIGINS.split(",").map((o) => o.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === "development") {
        return callback(null, true);
      }
      return callback(new Error("CORS policy violation: origin not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-API-Key"],
  })
);

// Standard JSON request body size limit (1MB for normal requests)
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

// Standard global rate limiter
const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP, please try again after 15 minutes." },
});
app.use("/api/", standardLimiter);

// Auth rate limiter (stricter: max 20 requests per 15 minutes to prevent OTP brute forcing)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again after 15 minutes." },
});
app.use("/api/auth/otp", authLimiter);

// Health check endpoint
app.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    service: "medguide-backend",
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  })
);

// Mount API route groups
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/family-profiles", familyRoutes);
app.use("/api/symptom-intake", symptomIntakeRoutes);
app.use("/api/triage", triageRoutes);
app.use("/api/directory", directoryRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/video-consultation", videoRoutes);
app.use("/api/prescriptions", prescriptionRoutes);
app.use("/api/pharmacy", pharmacyRoutes);
app.use("/api/health-records", healthRecordRoutes);
app.use("/api/emergency-sos", emergencyRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin/verification", adminVerificationRoutes);

// 404 handler
app.use((req, res) => res.status(404).json({ error: "Endpoint not found" }));

// Centralized error handler — never leaks stack traces in production
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  const isProd = env.NODE_ENV === "production";

  return res.status(statusCode).json({
    error:
      isProd && statusCode === 500
        ? "Internal server error"
        : err.message || "Internal server error",
    ...(isProd ? {} : { stack: err.stack }),
  });
});

const PORT = env.PORT || 4000;
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () =>
    console.log(`MEDGUIDE backend listening on port ${PORT} [${env.NODE_ENV}]`)
  );
}

module.exports = app;
