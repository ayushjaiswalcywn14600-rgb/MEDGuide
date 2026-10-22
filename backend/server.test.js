const request = require("supertest");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://localhost:5432/medguide_test";
process.env.JWT_SECRET = "a_very_long_secure_secret_key_with_at_least_32_characters";

const app = require("./server");

describe("Core Server Endpoints", () => {
  test("GET /health returns 200 with service info", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("medguide-backend");
  });

  test("GET /api/nonexistent returns 404 Not Found", async () => {
    const res = await request(app).get("/api/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Endpoint not found");
  });
});
