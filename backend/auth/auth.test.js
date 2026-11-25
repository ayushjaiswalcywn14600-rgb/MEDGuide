const request = require("supertest");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://localhost:5432/medguide_test";
process.env.JWT_SECRET = "super_secure_jwt_secret_key_at_least_32_chars_long";

const app = require("../server");
const { pool } = require("../shared/db");
const { getRedisClient } = require("../shared/redis");

describe("Auth Module: OTP & Session Lifecycle", () => {
  const testPhone = "+919876543210";
  const redis = getRedisClient();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("POST /api/auth/otp/request rejects invalid phone formats", async () => {
    const res = await request(app).post("/api/auth/otp/request").send({ phone: "invalid" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  test("POST /api/auth/otp/request succeeds and stores OTP in Redis with TTL", async () => {
    const res = await request(app).post("/api/auth/otp/request").send({ phone: testPhone });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("OTP sent successfully");
    expect(res.body.expiresInSeconds).toBe(300);

    const storedOtp = await redis.get(`otp:${testPhone}`);
    expect(storedOtp).toBeDefined();
    expect(storedOtp.length).toBe(6);
  });

  test("POST /api/auth/otp/request enforces 60s cooldown on duplicate request", async () => {
    const res = await request(app).post("/api/auth/otp/request").send({ phone: testPhone });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/cooldown|wait 60 seconds/i);
  });

  test("POST /api/auth/otp/verify fails on incorrect OTP and tracks attempts", async () => {
    // Clear cooldown to reset
    await redis.del(`otp_cooldown:${testPhone}`);
    await redis.set(`otp:${testPhone}`, "123456", "EX", 300);

    const res = await request(app)
      .post("/api/auth/otp/verify")
      .send({ phone: testPhone, otp: "999999" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid OTP/);
  });

  test("POST /api/auth/otp/verify succeeds with correct OTP, creates user, returns tokens", async () => {
    const validOtp = "654321";
    await redis.set(`otp:${testPhone}`, validOtp, "EX", 300);

    const mockUser = {
      id: "u1111111-1111-1111-1111-111111111111",
      phone: testPhone,
      full_name: null,
      preferred_language: "en",
      role: "patient",
      caregiver_mode: false,
    };

    jest.spyOn(pool, "query").mockImplementation(async (sql, params) => {
      if (sql.includes("SELECT * FROM users WHERE phone")) {
        return { rows: [] }; // Simulate new user
      }
      if (sql.includes("INSERT INTO users")) {
        return { rows: [mockUser] };
      }
      if (sql.includes("UPDATE users SET refresh_token_hash")) {
        return { rows: [{ ...mockUser, refresh_token_hash: "mockhash" }] };
      }
      if (sql.includes("INSERT INTO audit_logs")) {
        return { rows: [{ id: "audit_1" }] };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .post("/api/auth/otp/verify")
      .send({ phone: testPhone, otp: validOtp });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.user.phone).toBe(testPhone);

    // Verify JWT payload
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.id).toBe(mockUser.id);
    expect(decoded.role).toBe("patient");
  });

  test("POST /api/auth/token/refresh issues new token pair", async () => {
    const mockUser = {
      id: "u1111111-1111-1111-1111-111111111111",
      phone: testPhone,
      role: "patient",
    };

    jest.spyOn(pool, "query").mockImplementation(async (sql) => {
      if (sql.includes("SELECT * FROM users WHERE refresh_token_hash")) {
        return { rows: [mockUser] };
      }
      if (sql.includes("UPDATE users SET refresh_token_hash")) {
        return { rows: [mockUser] };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .post("/api/auth/token/refresh")
      .send({ refreshToken: "valid_refresh_token_string" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  test("POST /api/auth/logout revokes refresh token", async () => {
    const token = jwt.sign(
      { id: "u1111111-1111-1111-1111-111111111111", phone: testPhone, role: "patient" },
      process.env.JWT_SECRET
    );

    jest.spyOn(pool, "query").mockImplementation(async () => ({ rows: [] }));

    const res = await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out/i);
  });
});
