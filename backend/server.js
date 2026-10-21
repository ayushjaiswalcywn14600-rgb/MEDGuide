require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

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

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Generous global limit; emergency-sos has its own stricter/looser policy internally.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/health", (_req, res) => res.json({ status: "ok", service: "medguide-backend" }));

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

// 404 + centralized error handler
app.use((req, res) => res.status(404).json({ error: "Not found" }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`MEDGUIDE backend listening on :${PORT}`));

module.exports = app;
