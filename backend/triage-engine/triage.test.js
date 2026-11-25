const request = require("supertest");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://localhost:5432/medguide_test";
process.env.JWT_SECRET = "super_secure_jwt_secret_key_at_least_32_chars_long";

const app = require("../server");
const { pool } = require("../shared/db");

describe("Triage Engine & Safety Guardrails", () => {
  const userId = "u1111111-1111-1111-1111-111111111111";
  const userToken = jwt.sign(
    { id: userId, phone: "+919876543210", role: "patient" },
    process.env.JWT_SECRET
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Rule-Based Red Flag Evaluations", () => {
    test("Universal Red Flag: breathing_difficulty triggers immediate RED + 112/108", async () => {
      jest.spyOn(pool, "query").mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post("/api/triage/evaluate")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          condition: "cough_cold",
          ageGroup: "adult_18_59y",
          durationDays: 1,
          severity: 5,
          flags: ["breathing_difficulty"],
        });

      expect(res.status).toBe(200);
      expect(res.body.level).toBe("RED");
      expect(res.body.redirectTo).toBe("/emergency-sos");
      expect(res.body.emergencyContacts.nationalEmergency).toBe("112");
      expect(res.body.emergencyContacts.ambulance).toBe("108");
    });

    test("Fever Red Flag: High fever (>=40C) triggers immediate RED", async () => {
      jest.spyOn(pool, "query").mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post("/api/triage/evaluate")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          condition: "fever",
          ageGroup: "adult_18_59y",
          durationDays: 1,
          severity: 8,
          temperatureC: 40.5,
          flags: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.level).toBe("RED");
      expect(res.body.redirectTo).toBe("/emergency-sos");
    });

    test("Fever Red Flag: Any fever in infant < 3 months triggers immediate RED", async () => {
      jest.spyOn(pool, "query").mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post("/api/triage/evaluate")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          condition: "fever",
          ageGroup: "infant_0_3m",
          durationDays: 1,
          severity: 3,
          temperatureC: 38.0,
          flags: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.level).toBe("RED");
    });

    test("Self-Harm / Suicidal Intent: triggers RED + Tele-MANAS helpline (14416 / 1-800-891-4416)", async () => {
      jest.spyOn(pool, "query").mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post("/api/triage/evaluate")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          condition: "stress_anxiety",
          ageGroup: "adult_18_59y",
          durationDays: 5,
          severity: 9,
          flags: ["suicidal_intent"],
        });

      expect(res.status).toBe(200);
      expect(res.body.level).toBe("RED");
      expect(res.body.mentalHealthHelpline).toBeDefined();
      expect(res.body.mentalHealthHelpline.helpline).toBe("14416");
      expect(res.body.mentalHealthHelpline.tollFree).toBe("1-800-891-4416");
      expect(res.body.redirectTo).toBe("/emergency-sos");
    });

    test("Condition Yellow Threshold: Fever lasting 3+ days triggers YELLOW", async () => {
      jest.spyOn(pool, "query").mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post("/api/triage/evaluate")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          condition: "fever",
          ageGroup: "adult_18_59y",
          durationDays: 3,
          severity: 4,
          flags: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.level).toBe("YELLOW");
      expect(res.body.redirectTo).toBeUndefined();
    });

    test("Normal mild symptoms trigger GREEN guidance", async () => {
      jest.spyOn(pool, "query").mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post("/api/triage/evaluate")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          condition: "headache",
          ageGroup: "adult_18_59y",
          durationDays: 1,
          severity: 3,
          flags: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.level).toBe("GREEN");
    });
  });

  describe("NON-NEGOTIABLE SAFETY: AI Can Never Downgrade Rule Verdict", () => {
    test("POST /api/triage/reconcile escalates GREEN -> YELLOW", async () => {
      jest.spyOn(pool, "query").mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post("/api/triage/reconcile")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          ruleResult: { level: "GREEN", reasons: ["Mild symptoms"] },
          aiSuggestedLevel: "YELLOW",
        });

      expect(res.status).toBe(200);
      expect(res.body.level).toBe("YELLOW");
      expect(res.body.escalatedByAi).toBe(true);
    });

    test("POST /api/triage/reconcile escalates YELLOW -> RED", async () => {
      jest.spyOn(pool, "query").mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post("/api/triage/reconcile")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          ruleResult: { level: "YELLOW", reasons: ["Moderate fever"] },
          aiSuggestedLevel: "RED",
        });

      expect(res.status).toBe(200);
      expect(res.body.level).toBe("RED");
      expect(res.body.escalatedByAi).toBe(true);
      expect(res.body.redirectTo).toBe("/emergency-sos");
    });

    test("SAFETY RULE: AI CANNOT downgrade RED -> GREEN (Must stay RED)", async () => {
      jest.spyOn(pool, "query").mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post("/api/triage/reconcile")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          ruleResult: { level: "RED", reasons: ["Chest pain"] },
          aiSuggestedLevel: "GREEN",
        });

      expect(res.status).toBe(200);
      expect(res.body.level).toBe("RED"); // MUST STAY RED
      expect(res.body.escalatedByAi).toBe(false);
      expect(res.body.redirectTo).toBe("/emergency-sos");
    });

    test("SAFETY RULE: AI CANNOT downgrade YELLOW -> GREEN (Must stay YELLOW)", async () => {
      jest.spyOn(pool, "query").mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post("/api/triage/reconcile")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          ruleResult: { level: "YELLOW", reasons: ["Fever for 4 days"] },
          aiSuggestedLevel: "GREEN",
        });

      expect(res.status).toBe(200);
      expect(res.body.level).toBe("YELLOW"); // MUST STAY YELLOW
      expect(res.body.escalatedByAi).toBe(false);
    });

    test("Validation: rejects untrusted body format with 400", async () => {
      const res = await request(app)
        .post("/api/triage/reconcile")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          ruleResult: "invalid_format",
          aiSuggestedLevel: "INVALID_LEVEL",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed");
    });
  });
});
