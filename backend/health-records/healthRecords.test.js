const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const healthRecordRouter = require("./routes");
const { pool } = require("../shared/db");
const { env } = require("../shared/env");

const app = express();
app.use(express.json());
app.use("/api/health-records", healthRecordRouter);

const testUser = { id: "11111111-1111-1111-1111-111111111111", role: "patient" };
const token = jwt.sign(testUser, env.JWT_SECRET);

describe("Phase 5: Health Records Module", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("POST /api/health-records/upload", () => {
    it("rejects unauthorized upload", async () => {
      const res = await request(app).post("/api/health-records/upload");
      expect(res.status).toBe(401);
    });

    it("uploads and encrypts valid PDF record with audit log", async () => {
      const fakePdfBuffer = Buffer.from("%PDF-1.4 Mock PDF content for test");

      jest.spyOn(pool, "query").mockImplementation((sql) => {
        if (typeof sql === "string" && sql.includes("INSERT INTO health_records")) {
          return Promise.resolve({
            rows: [
              {
                id: "record-123",
                user_id: testUser.id,
                record_type: "lab_report",
                file_ref: "storage://mock_test.pdf",
                metadata: { originalName: "report.pdf" },
                created_at: new Date().toISOString(),
              },
            ],
          });
        }
        if (typeof sql === "string" && sql.includes("INSERT INTO audit_logs")) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post("/api/health-records/upload")
        .set("Authorization", `Bearer ${token}`)
        .attach("file", fakePdfBuffer, "report.pdf")
        .field("recordType", "lab_report")
        .field("title", "Blood Test Report");

      expect(res.status).toBe(201);
      expect(res.body.record.recordType).toBe("lab_report");
      expect(res.body.record.metadata.encryption.algorithm).toBe("AES-256-CBC");
    });
  });

  describe("GET /api/health-records/timeline", () => {
    it("returns unified chronological patient timeline", async () => {
      jest.spyOn(pool, "query").mockImplementation((sql) => {
        if (typeof sql === "string" && sql.includes("FROM health_records")) {
          return Promise.resolve({
            rows: [
              {
                id: "r1",
                record_type: "lab_report",
                file_ref: "storage://test.pdf",
                metadata: { title: "CBC Lab Report" },
                created_at: "2026-10-01T10:00:00Z",
              },
            ],
          });
        }
        if (typeof sql === "string" && sql.includes("FROM symptom_sessions")) {
          return Promise.resolve({
            rows: [
              {
                id: "s1",
                condition: "fever",
                triage_level: "GREEN",
                reasons: ["Mild fever"],
                created_at: "2026-10-02T10:00:00Z",
              },
            ],
          });
        }
        if (typeof sql === "string" && sql.includes("FROM prescriptions")) {
          return Promise.resolve({
            rows: [
              {
                id: "p1",
                medicines: [{ brandName: "Paracetamol" }],
                doctor_name: "Dr. Sharma",
                specialty: "General Physician",
                created_at: "2026-10-03T10:00:00Z",
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get("/api/health-records/timeline")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.timeline).toHaveLength(3);
      // Ensure sorted newest first
      expect(res.body.timeline[0].type).toBe("PRESCRIPTION");
      expect(res.body.timeline[1].type).toBe("SYMPTOM_ASSESSMENT");
      expect(res.body.timeline[2].type).toBe("HEALTH_RECORD");
    });
  });

  describe("POST /api/health-records/:id/share", () => {
    it("generates expiring share link for owned record", async () => {
      jest.spyOn(pool, "query").mockImplementation((sql) => {
        if (typeof sql === "string" && sql.includes("SELECT id FROM health_records")) {
          return Promise.resolve({ rows: [{ id: "r1" }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post("/api/health-records/r1/share")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.shareUrl).toContain("/records/shared/");
      expect(res.body.expiresAt).toBeDefined();
    });
  });
});
