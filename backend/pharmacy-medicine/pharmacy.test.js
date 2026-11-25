const request = require("supertest");
const express = require("express");
const pharmacyRouter = require("./routes");
const { pool } = require("../shared/db");

const app = express();
app.use(express.json());
app.use("/api/pharmacy", pharmacyRouter);

describe("Phase 5: Pharmacy & Medicine Engine", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("GET /api/pharmacy/search", () => {
    it("returns 400 when query parameter is missing", async () => {
      const res = await request(app).get("/api/pharmacy/search");
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Search query is required");
    });

    it("searches medicines by name or composition with nearby stock", async () => {
      jest.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [
          {
            id: "m1",
            brand_name: "Dolo 650",
            composition: "Paracetamol",
            strength: "650mg",
            substitution_caution_class: null,
            price: 30.5,
            in_stock: true,
            clinic_id: "c1",
            clinic_name: "Apollo Clinic",
          },
        ],
      });

      const res = await request(app).get("/api/pharmacy/search?query=dolo");
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].brand_name).toBe("Dolo 650");
      expect(res.body.mandatoryNotice).toBeDefined();
    });
  });

  describe("GET /api/pharmacy/alternatives/:medicineId", () => {
    it("returns generic alternatives and flags narrow-therapeutic / caution classes", async () => {
      jest
        .spyOn(pool, "query")
        .mockResolvedValueOnce({
          rows: [
            {
              id: "m1",
              brand_name: "Brand Digoxin",
              composition: "Digoxin",
              strength: "0.25mg",
              substitution_caution_class: "narrow_therapeutic_index",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "m2",
              brand_name: "Generic Digoxin",
              composition: "Digoxin",
              strength: "0.25mg",
              substitution_caution_class: "narrow_therapeutic_index",
              lowest_price: 15.0,
              available_nearby: true,
            },
          ],
        });

      const res = await request(app).get("/api/pharmacy/alternatives/m1");
      expect(res.status).toBe(200);
      expect(res.body.isSensitiveClass).toBe(true);
      expect(res.body.advice).toContain("CRITICAL CAUTION");
      expect(res.body.alternatives).toHaveLength(1);
    });
  });

  describe("POST /api/pharmacy/savings-calculator", () => {
    it("calculates savings and includes mandatory non-substitution caution note", async () => {
      const res = await request(app).post("/api/pharmacy/savings-calculator").send({
        brandMedicinePrice: 120.0,
        alternativeMedicinePrice: 40.0,
      });

      expect(res.status).toBe(200);
      expect(res.body.savings).toBe(80.0);
      expect(res.body.savingsPercent).toBe(66.7);
      expect(res.body.note).toContain("A pharmacist or doctor must confirm any substitution");
      expect(res.body.safetyDisclaimer).toContain(
        "never switch medications without physician or pharmacist approval"
      );
    });
  });
});
