const request = require("supertest");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://localhost:5432/medguide_test";
process.env.JWT_SECRET = "super_secure_jwt_secret_key_at_least_32_chars_long";

const app = require("../server");
const { pool } = require("../shared/db");

describe("Family Profiles Module (Owner Scoped CRUD & IDOR Protection)", () => {
  const userAId = "11111111-1111-1111-1111-111111111111";
  const userBId = "22222222-2222-2222-2222-222222222222";

  const tokenUserA = jwt.sign(
    { id: userAId, phone: "+919876543210", role: "patient" },
    process.env.JWT_SECRET
  );

  const tokenUserB = jwt.sign(
    { id: userBId, phone: "+919123456789", role: "patient" },
    process.env.JWT_SECRET
  );

  const profileA = {
    id: "f0000000-0000-0000-0000-000000000001",
    managed_by_user_id: userAId,
    full_name: "Aarav Sharma",
    relationship: "child",
    age_group: "child_1_12y",
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("User A can create a family profile", async () => {
    jest.spyOn(pool, "query").mockImplementation(async (sql, params) => {
      if (sql.includes("INSERT INTO family_profiles")) {
        return {
          rows: [
            {
              id: profileA.id,
              full_name: params[1],
              relationship: params[2],
              age_group: params[3],
              created_at: profileA.created_at,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .post("/api/family-profiles")
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({
        fullName: "Aarav Sharma",
        relationship: "child",
        ageGroup: "child_1_12y",
      });

    expect(res.status).toBe(201);
    expect(res.body.familyProfile.full_name).toBe("Aarav Sharma");
    expect(res.body.familyProfile.relationship).toBe("child");
  });

  test("User A can list their own family profiles", async () => {
    jest.spyOn(pool, "query").mockImplementation(async (sql, params) => {
      if (sql.includes("WHERE managed_by_user_id = $1")) {
        if (params[0] === userAId) return { rows: [profileA] };
        return { rows: [] };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .get("/api/family-profiles")
      .set("Authorization", `Bearer ${tokenUserA}`);

    expect(res.status).toBe(200);
    expect(res.body.familyProfiles.length).toBe(1);
    expect(res.body.familyProfiles[0].id).toBe(profileA.id);
  });

  test("IDOR PROTECTION: User B CANNOT read User A's family profile (returns 404)", async () => {
    jest.spyOn(pool, "query").mockImplementation(async (sql, params) => {
      // Query filters strictly by: WHERE id = $1 AND managed_by_user_id = $2
      const [profileId, managedBy] = params;
      if (profileId === profileA.id && managedBy === userAId) {
        return { rows: [profileA] };
      }
      return { rows: [] }; // User B does not own profileA
    });

    const res = await request(app)
      .get(`/api/family-profiles/${profileA.id}`)
      .set("Authorization", `Bearer ${tokenUserB}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found or access denied/i);
  });

  test("IDOR PROTECTION: User B CANNOT update or delete User A's family profile", async () => {
    jest.spyOn(pool, "query").mockResolvedValue({ rows: [] }); // No rows matched User B's ownership

    const updateRes = await request(app)
      .patch(`/api/family-profiles/${profileA.id}`)
      .set("Authorization", `Bearer ${tokenUserB}`)
      .send({ fullName: "Malicious Edit" });

    expect(updateRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/family-profiles/${profileA.id}`)
      .set("Authorization", `Bearer ${tokenUserB}`);

    expect(deleteRes.status).toBe(404);
  });
});
