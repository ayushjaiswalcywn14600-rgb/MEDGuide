require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { pool } = require("../shared/db");
const {
  SEED_USERS,
  SEED_CLINICS,
  SEED_DOCTORS,
  SEED_MEDICINES,
  SEED_PHARMACY_STOCK,
} = require("./seedData");

async function runSeed() {
  console.log("🌱 Seeding MEDGUIDE database...");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Users
    for (const u of SEED_USERS) {
      await client.query(
        `INSERT INTO users (id, phone, full_name, preferred_language, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           phone = EXCLUDED.phone,
           full_name = EXCLUDED.full_name,
           preferred_language = EXCLUDED.preferred_language,
           role = EXCLUDED.role;`,
        [u.id, u.phone, u.full_name, u.preferred_language, u.role]
      );
    }
    console.log(`✓ Seeded ${SEED_USERS.length} users`);

    // 2. Clinics
    for (const c of SEED_CLINICS) {
      await client.query(
        `INSERT INTO clinics (id, name, abdm_hfr_id, verified, address, latitude, longitude, operating_hours, accessibility_features, has_pharmacy)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           abdm_hfr_id = EXCLUDED.abdm_hfr_id,
           verified = EXCLUDED.verified,
           address = EXCLUDED.address,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           operating_hours = EXCLUDED.operating_hours,
           accessibility_features = EXCLUDED.accessibility_features,
           has_pharmacy = EXCLUDED.has_pharmacy;`,
        [
          c.id,
          c.name,
          c.abdm_hfr_id,
          c.verified,
          c.address,
          c.latitude,
          c.longitude,
          JSON.stringify(c.operating_hours),
          JSON.stringify(c.accessibility_features),
          c.has_pharmacy,
        ]
      );
    }
    console.log(`✓ Seeded ${SEED_CLINICS.length} clinics`);

    // 3. Doctors
    for (const d of SEED_DOCTORS) {
      await client.query(
        `INSERT INTO doctors (id, user_id, clinic_id, registration_number, specialty, languages, consultation_fee, verified, rating)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           clinic_id = EXCLUDED.clinic_id,
           registration_number = EXCLUDED.registration_number,
           specialty = EXCLUDED.specialty,
           languages = EXCLUDED.languages,
           consultation_fee = EXCLUDED.consultation_fee,
           verified = EXCLUDED.verified,
           rating = EXCLUDED.rating;`,
        [
          d.id,
          d.user_id,
          d.clinic_id,
          d.registration_number,
          d.specialty,
          JSON.stringify(d.languages),
          d.consultation_fee,
          d.verified,
          d.rating,
        ]
      );
    }
    console.log(`✓ Seeded ${SEED_DOCTORS.length} doctors`);

    // 4. Medicines
    for (const m of SEED_MEDICINES) {
      await client.query(
        `INSERT INTO medicines (id, brand_name, composition, strength, substitution_caution_class)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           brand_name = EXCLUDED.brand_name,
           composition = EXCLUDED.composition,
           strength = EXCLUDED.strength,
           substitution_caution_class = EXCLUDED.substitution_caution_class;`,
        [m.id, m.brand_name, m.composition, m.strength, m.substitution_caution_class]
      );
    }
    console.log(`✓ Seeded ${SEED_MEDICINES.length} medicines`);

    // 5. Pharmacy stock
    for (const s of SEED_PHARMACY_STOCK) {
      await client.query(
        `INSERT INTO pharmacy_stock (id, clinic_id, medicine_id, price, in_stock)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           clinic_id = EXCLUDED.clinic_id,
           medicine_id = EXCLUDED.medicine_id,
           price = EXCLUDED.price,
           in_stock = EXCLUDED.in_stock;`,
        [s.id, s.clinic_id, s.medicine_id, s.price, s.in_stock]
      );
    }
    console.log(`✓ Seeded ${SEED_PHARMACY_STOCK.length} pharmacy stock items`);

    await client.query("COMMIT");
    console.log("✅ Seed completed successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Seed failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runSeed();
}

module.exports = { runSeed };
