const request = require("supertest");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://localhost:5432/medguide_test";
process.env.JWT_SECRET = "super_secure_jwt_secret_key_at_least_32_chars_long";

const app = require("../server");
const { pool } = require("../shared/db");

describe("Directory, Appointments & Clinical Consultation", () => {
  const patientId = "11111111-1111-1111-1111-111111111111";
  const doctorUserId = "22222222-2222-2222-2222-222222222222";
  const doctorId = "c0000000-0000-0000-0000-000000000001";

  const patientToken = jwt.sign(
    { id: patientId, phone: "+919876543210", role: "patient" },
    process.env.JWT_SECRET
  );

  const doctorToken = jwt.sign(
    { id: doctorUserId, phone: "+919876543211", role: "doctor" },
    process.env.JWT_SECRET
  );

  const futureSlot = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Directory Endpoints", () => {
    test("GET /api/directory/doctors lists verified doctors", async () => {
      jest.spyOn(pool, "query").mockResolvedValue({
        rows: [
          {
            id: doctorId,
            doctor_name: "Dr. Rajesh Sharma",
            specialty: "General Physician",
            consultation_fee: 500,
            verified: true,
          },
        ],
      });

      const res = await request(app).get("/api/directory/doctors?specialty=General");
      expect(res.status).toBe(200);
      expect(res.body.doctors.length).toBe(1);
      expect(res.body.doctors[0].doctor_name).toBe("Dr. Rajesh Sharma");
    });
  });

  describe("Appointment Booking & Double-Booking Protection", () => {
    test("POST /api/appointments/book successfully books a slot", async () => {
      const mockAppt = {
        id: "a1111111-1111-1111-1111-111111111111",
        user_id: patientId,
        doctor_id: doctorId,
        scheduled_at: futureSlot,
        status: "booked",
      };

      const mockClient = {
        query: jest.fn().mockImplementation(async (sql) => {
          if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
          if (sql.includes("SELECT id, verified, user_id FROM doctors")) {
            return { rows: [{ id: doctorId, verified: true, user_id: doctorUserId }] };
          }
          if (sql.includes("SELECT id FROM appointments")) {
            return { rows: [] }; // No conflict
          }
          if (sql.includes("INSERT INTO appointments")) {
            return { rows: [mockAppt] };
          }
          return { rows: [] };
        }),
        release: jest.fn(),
      };

      jest.spyOn(pool, "connect").mockResolvedValue(mockClient);

      const res = await request(app)
        .post("/api/appointments/book")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          scheduledAt: futureSlot,
          mode: "online",
        });

      expect(res.status).toBe(201);
      expect(res.body.appointment.id).toBe(mockAppt.id);
    });

    test("DOUBLE-BOOKING PREVENTION: returns 409 Conflict if slot is already booked", async () => {
      const mockClient = {
        query: jest.fn().mockImplementation(async (sql) => {
          if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
          if (sql.includes("SELECT id, verified, user_id FROM doctors")) {
            return { rows: [{ id: doctorId, verified: true, user_id: doctorUserId }] };
          }
          if (sql.includes("SELECT id FROM appointments")) {
            return { rows: [{ id: "existing_conflict" }] }; // Slot conflict!
          }
          return { rows: [] };
        }),
        release: jest.fn(),
      };

      jest.spyOn(pool, "connect").mockResolvedValue(mockClient);

      const res = await request(app)
        .post("/api/appointments/book")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          scheduledAt: futureSlot,
          mode: "online",
        });

      expect(res.status).toBe(409);
      expect(res.body.conflict).toBe(true);
      expect(res.body.error).toMatch(/already booked/i);
    });
  });

  describe("Video Consultation & Safety", () => {
    test("POST /api/video-consultation/session generates credentials without storing media", async () => {
      const mockAppt = {
        id: "a1111111-1111-1111-1111-111111111111",
        user_id: patientId,
        doctor_id: doctorId,
        doctor_user_id: doctorUserId,
        scheduled_at: new Date().toISOString(),
        status: "booked",
        patient_name: "Aarav Patel",
        doctor_name: "Dr. Rajesh Sharma",
      };

      jest.spyOn(pool, "query").mockResolvedValue({ rows: [mockAppt] });

      const res = await request(app)
        .post("/api/video-consultation/session")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          appointmentId: mockAppt.id,
          consentGranted: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.channelName).toBe(`consultation_${mockAppt.id}`);
      expect(res.body.privacyDisclaimer).toMatch(/never stored or recorded/i);
    });
  });

  describe("Prescriptions (Doctor-Only & Safety Hooks)", () => {
    test("Patient CANNOT create prescription (returns 403 Forbidden)", async () => {
      const res = await request(app)
        .post("/api/prescriptions")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          appointmentId: "a1111111-1111-1111-1111-111111111111",
          userId: patientId,
          medicines: [
            { name: "Dolo 650", composition: "Paracetamol", dosage: "650mg", durationDays: 3 },
          ],
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Insufficient permissions");
    });

    test("Doctor creates prescription and receives duplicate composition warning", async () => {
      const mockDoctor = { id: doctorId, registration_number: "MCI-2015-08492", verified: true };
      const mockPrescription = {
        id: "a1111111-1111-1111-1111-111111111111",
        appointment_id: "a1111111-1111-1111-1111-111111111111",
        doctor_id: doctorId,
        user_id: patientId,
        notes: "Rest and hydration",
      };

      jest.spyOn(pool, "query").mockImplementation(async (sql) => {
        if (sql.includes("SELECT id, registration_number, verified FROM doctors")) {
          return { rows: [mockDoctor] };
        }
        if (sql.includes("SELECT id, user_id, doctor_id FROM appointments")) {
          return { rows: [{ id: mockPrescription.appointment_id }] };
        }
        if (sql.includes("INSERT INTO prescriptions")) {
          return { rows: [mockPrescription] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post("/api/prescriptions")
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({
          appointmentId: mockPrescription.appointment_id,
          userId: patientId,
          medicines: [
            {
              name: "Dolo 650",
              composition: "Paracetamol",
              dosage: "1 tab twice daily",
              durationDays: 3,
            },
            {
              name: "Calpol 650",
              composition: "Paracetamol",
              dosage: "1 tab as needed",
              durationDays: 3,
            },
          ],
          notes: "Take after food",
        });

      expect(res.status).toBe(201);
      expect(res.body.prescription.id).toBe(mockPrescription.id);
      expect(res.body.interactionWarnings.length).toBeGreaterThan(0);
      expect(res.body.interactionWarnings[0].type).toBe("DUPLICATE_COMPOSITION");
    });
  });
});
