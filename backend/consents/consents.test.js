const request = require("supertest");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://localhost:5432/medguide_test";
process.env.JWT_SECRET = "super_secure_jwt_secret_key_at_least_32_chars_long";

const app = require("../server");
const { pool } = require("../shared/db");
const { requireConsent } = require("../shared/consentGate");

describe("Consent Module (DPDP Act 2023 Compliance)", () => {
  const userId = "u1111111-1111-1111-1111-111111111111";
  const userToken = jwt.sign(
    { id: userId, phone: "+919876543210", role: "patient" },
    process.env.JWT_SECRET
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("GET /api/consents/policy-text returns versioned purpose descriptions", async () => {
    const res = await request(app).get("/api/consents/policy-text");
    expect(res.status).toBe(200);
    expect(res.body.version).toBeDefined();
    expect(res.body.purposes.symptom_analysis).toBeDefined();
    expect(res.body.purposes.symptom_analysis.en).toBeDefined();
    expect(res.body.purposes.symptom_analysis.hi).toBeDefined();
  });

  test("POST /api/consents grants consent and writes audit log", async () => {
    const mockConsent = {
      id: "c1111111-1111-1111-1111-111111111111",
      user_id: userId,
      purpose: "symptom_analysis",
      granted: true,
      version: "2024.1-dpdp",
    };

    jest.spyOn(pool, "query").mockImplementation(async (sql) => {
      if (sql.includes("INSERT INTO consents")) {
        return { rows: [mockConsent] };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .post("/api/consents")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        purpose: "symptom_analysis",
        granted: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.consent.granted).toBe(true);
    expect(res.body.consent.purpose).toBe("symptom_analysis");
  });

  test("POST /api/consents/withdraw revokes consent and writes audit log", async () => {
    const mockRevoked = {
      id: "c1111111-1111-1111-1111-111111111111",
      user_id: userId,
      purpose: "symptom_analysis",
      granted: false,
    };

    jest.spyOn(pool, "query").mockImplementation(async (sql) => {
      if (sql.includes("INSERT INTO consents")) {
        return { rows: [mockRevoked] };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .post("/api/consents/withdraw")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        purpose: "symptom_analysis",
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/withdrawn/i);
    expect(res.body.consent.granted).toBe(false);
  });

  test("requireConsent gate middleware blocks unconsented access with 403", async () => {
    const req = { user: { id: userId, role: "patient" } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    // Simulate no consent record
    jest.spyOn(pool, "query").mockResolvedValue({ rows: [] });

    const gate = requireConsent("symptom_analysis");
    await gate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "CONSENT_REQUIRED",
        requiresConsent: true,
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("requireConsent gate allows access when consent is granted", async () => {
    const req = { user: { id: userId, role: "patient" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    jest.spyOn(pool, "query").mockResolvedValue({ rows: [{ granted: true }] });

    const gate = requireConsent("symptom_analysis");
    await gate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
