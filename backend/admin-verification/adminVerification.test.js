const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const { ZodError } = require("zod");
const adminVerificationRouter = require("./routes");
const reviewsRouter = require("../reviews-testimonials/routes");
const notificationsRouter = require("../notifications/routes");
const trackingRouter = require("../daily-health-tracking/routes");
const { pool } = require("../shared/db");
const { env } = require("../shared/env");

const app = express();
app.use(express.json());
app.use("/api/admin/verification", adminVerificationRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/tracking", trackingRouter);

app.use((err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.issues });
  }
  res.status(err.status || 500).json({ error: err.message });
});

const adminUser = { id: "99999999-9999-9999-9999-999999999999", role: "super_admin" };
const adminToken = jwt.sign(adminUser, env.JWT_SECRET);

const patientUser = { id: "11111111-1111-1111-1111-111111111111", role: "patient" };
const patientToken = jwt.sign(patientUser, env.JWT_SECRET);

describe("Phase 5: Admin Verification, Reviews, Notifications & Tracking", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Admin KYC Verification (/api/admin/verification)", () => {
    it("denies access to non-admin users", async () => {
      const res = await request(app)
        .get("/api/admin/verification/doctors")
        .set("Authorization", `Bearer ${patientToken}`);
      expect(res.status).toBe(403);
    });

    it("lists doctors in pending verification queue for super_admin", async () => {
      jest.spyOn(pool, "query").mockImplementation((sql) => {
        if (typeof sql === "string" && sql.includes("SELECT d.*")) {
          return Promise.resolve({
            rows: [
              {
                id: "d1",
                full_name: "Dr. Ananya Rao",
                license_number: "MCI-12345",
                verification_status: "pending",
              },
            ],
          });
        }
        if (typeof sql === "string" && sql.includes("SELECT COUNT(*) FROM doctors")) {
          return Promise.resolve({ rows: [{ count: "1" }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get("/api/admin/verification/doctors?status=pending")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.doctors).toHaveLength(1);
      expect(res.body.doctors[0].verification_status).toBe("pending");
    });

    it("approves doctor KYC and writes audit log", async () => {
      jest.spyOn(pool, "query").mockImplementation((sql) => {
        if (typeof sql === "string" && sql.includes("SELECT * FROM doctors WHERE id")) {
          return Promise.resolve({
            rows: [{ id: "d1", full_name: "Dr. Ananya Rao", license_number: "MCI-12345" }],
          });
        }
        if (typeof sql === "string" && sql.includes("UPDATE doctors")) {
          return Promise.resolve({
            rows: [{ id: "d1", verification_status: "verified" }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .patch("/api/admin/verification/doctors/d1")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "verified" });

      expect(res.status).toBe(200);
      expect(res.body.doctor.verification_status).toBe("verified");
    });

    it("requires reason when rejecting doctor KYC", async () => {
      const res = await request(app)
        .patch("/api/admin/verification/doctors/d1")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "rejected" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed");
    });

    it("retrieves filterable audit logs", async () => {
      jest.spyOn(pool, "query").mockImplementation((sql) => {
        if (typeof sql === "string" && sql.includes("FROM audit_logs")) {
          return Promise.resolve({
            rows: [
              {
                id: "l1",
                action: "DOCTOR_VERIFIED",
                actor_role: "super_admin",
                created_at: new Date().toISOString(),
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get("/api/admin/verification/audit-logs?action=DOCTOR")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(1);
      expect(res.body.logs[0].action).toBe("DOCTOR_VERIFIED");
    });
  });

  describe("Reviews & Testimonials (/api/reviews)", () => {
    it("submits review with verified_patient flag when appointment is completed", async () => {
      jest.spyOn(pool, "query").mockImplementation((sql) => {
        if (typeof sql === "string" && sql.includes("SELECT id FROM appointments")) {
          return Promise.resolve({ rows: [{ id: "apt-1" }] }); // completed appointment exists
        }
        if (typeof sql === "string" && sql.includes("INSERT INTO reviews")) {
          return Promise.resolve({
            rows: [
              {
                id: "rev-1",
                user_id: patientUser.id,
                doctor_id: "22222222-2222-2222-2222-222222222222",
                rating: 5,
                body: "Excellent care and attention.",
                verified_patient: true,
                moderation_status: "pending",
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post("/api/reviews")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId: "22222222-2222-2222-2222-222222222222",
          rating: 5,
          body: "Excellent care and attention.",
        });

      expect(res.status).toBe(201);
      expect(res.body.review.verified_patient).toBe(true);
      expect(res.body.review.moderation_status).toBe("pending");
    });

    it("public doctor review endpoint only returns approved reviews", async () => {
      jest.spyOn(pool, "query").mockImplementation((sql) => {
        if (typeof sql === "string" && sql.includes("SELECT r.id, r.rating")) {
          return Promise.resolve({
            rows: [
              {
                id: "rev-1",
                rating: 5,
                body: "Great doctor!",
                verified_patient: true,
                reviewer_name: "Ayush",
              },
            ],
          });
        }
        if (typeof sql === "string" && sql.includes("ROUND(AVG(rating)")) {
          return Promise.resolve({
            rows: [{ total_reviews: "1", average_rating: "5.0" }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app).get(
        "/api/reviews/doctor/22222222-2222-2222-2222-222222222222"
      );
      expect(res.status).toBe(200);
      expect(res.body.averageRating).toBe(5.0);
      expect(res.body.reviews).toHaveLength(1);
    });
  });

  describe("Notifications (/api/notifications)", () => {
    it("fetches unread in-app notifications", async () => {
      jest.spyOn(pool, "query").mockImplementation((sql) => {
        if (typeof sql === "string" && sql.includes("FROM notifications WHERE user_id")) {
          return Promise.resolve({
            rows: [
              {
                id: "notif-1",
                title: "Appointment Reminder",
                body: "Your appointment is tomorrow at 10 AM.",
                read: false,
              },
            ],
          });
        }
        if (typeof sql === "string" && sql.includes("FILTER (WHERE read = FALSE)")) {
          return Promise.resolve({
            rows: [{ unread_count: "1", total_count: "1" }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get("/api/notifications?unreadOnly=true")
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.unreadCount).toBe(1);
      expect(res.body.notifications).toHaveLength(1);
    });

    it("updates user notification preferences", async () => {
      jest.spyOn(pool, "query").mockImplementation((sql) => {
        if (typeof sql === "string" && sql.includes("INSERT INTO notification_preferences")) {
          return Promise.resolve({
            rows: [
              {
                sms_enabled: false,
                push_enabled: true,
                email_enabled: true,
                appointment_reminders: true,
                health_alerts: true,
                marketing: false,
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .patch("/api/notifications/preferences")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ smsEnabled: false, emailEnabled: true });

      expect(res.status).toBe(200);
      expect(res.body.preferences.smsEnabled).toBe(false);
      expect(res.body.preferences.emailEnabled).toBe(true);
    });
  });

  describe("Daily Health Tracking (/api/tracking)", () => {
    it("upserts daily vitals", async () => {
      jest.spyOn(pool, "query").mockImplementation((sql) => {
        if (typeof sql === "string" && sql.includes("INSERT INTO daily_health_tracking")) {
          return Promise.resolve({
            rows: [
              {
                user_id: patientUser.id,
                tracked_date: "2026-10-22",
                water_ml: 2500,
                sleep_hours: "7.5",
                steps: 8000,
                bp_systolic: 120,
                bp_diastolic: 80,
                mood: "good",
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post("/api/tracking")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          trackedDate: "2026-10-22",
          waterMl: 2500,
          sleepHours: 7.5,
          steps: 8000,
          bpSystolic: 120,
          bpDiastolic: 80,
          mood: "good",
        });

      expect(res.status).toBe(200);
      expect(res.body.entry.water_ml).toBe(2500);
      expect(res.body.entry.mood).toBe("good");
    });
  });
});
