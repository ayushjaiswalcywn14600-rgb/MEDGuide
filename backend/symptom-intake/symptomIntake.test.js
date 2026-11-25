const request = require("supertest");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://localhost:5432/medguide_test";
process.env.JWT_SECRET = "super_secure_jwt_secret_key_at_least_32_chars_long";

const app = require("../server");
const { pool } = require("../shared/db");

describe("Symptom Intake Module", () => {
  const userId = "u1111111-1111-1111-1111-111111111111";
  const userToken = jwt.sign(
    { id: userId, phone: "+919876543210", role: "patient" },
    process.env.JWT_SECRET
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("GET /api/symptom-intake/questionnaires returns all 11 conditions", async () => {
    const res = await request(app).get("/api/symptom-intake/questionnaires");
    expect(res.status).toBe(200);
    expect(res.body.supportedConditions.length).toBe(11);
    expect(res.body.questionnaires.fever).toBeDefined();
    expect(res.body.questionnaires.stress_anxiety).toBeDefined();
  });

  test("GET /api/symptom-intake/questionnaires/fever returns fever question bank", async () => {
    const res = await request(app).get("/api/symptom-intake/questionnaires/fever");
    expect(res.status).toBe(200);
    expect(res.body.condition).toBe("fever");
    expect(res.body.questions.length).toBeGreaterThanOrEqual(4);
  });

  test("POST /api/symptom-intake/sessions BLOCKS when consent is missing (403)", async () => {
    jest.spyOn(pool, "query").mockImplementation(async (sql) => {
      if (sql.includes("FROM consents")) return { rows: [] }; // No consent
      return { rows: [] };
    });

    const res = await request(app)
      .post("/api/symptom-intake/sessions")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        condition: "fever",
        answers: { durationDays: 2, severity: 4 },
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CONSENT_REQUIRED");
  });

  test("POST /api/symptom-intake/sessions succeeds when consent is granted", async () => {
    const mockSession = {
      id: "s1111111-1111-1111-1111-111111111111",
      user_id: userId,
      condition: "fever",
      input_mode: "guided_form",
    };

    jest.spyOn(pool, "query").mockImplementation(async (sql) => {
      if (sql.includes("FROM consents")) return { rows: [{ granted: true }] };
      if (sql.includes("INSERT INTO symptom_sessions")) return { rows: [mockSession] };
      return { rows: [] };
    });

    const res = await request(app)
      .post("/api/symptom-intake/sessions")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        condition: "fever",
        answers: { durationDays: 2, severity: 4 },
      });

    expect(res.status).toBe(201);
    expect(res.body.session.id).toBe(mockSession.id);
  });

  test("POST /api/symptom-intake/free-text maps natural language to condition questionnaire", async () => {
    jest.spyOn(pool, "query").mockImplementation(async (sql) => {
      if (sql.includes("FROM consents")) return { rows: [{ granted: true }] };
      if (sql.includes("INSERT INTO symptom_sessions")) {
        return {
          rows: [
            {
              id: "s2222222-2222-2222-2222-222222222222",
              user_id: userId,
              condition: "headache",
              input_mode: "text",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .post("/api/symptom-intake/free-text")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        description: "I have a terrible throbbing headache since morning",
      });

    expect(res.status).toBe(201);
    expect(res.body.suggestedCondition).toBe("headache");
    expect(res.body.suggestedQuestionnaire).toBeDefined();
  });
});
