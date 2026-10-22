/**
 * Realistic Indian mock dataset for MEDGUIDE seed data.
 * All data is non-personal and intended for development and testing.
 */

const SEED_USERS = [
  {
    id: "a0000000-0000-0000-0000-000000000001",
    phone: "+919999999999",
    full_name: "Super Admin",
    preferred_language: "en",
    role: "super_admin",
  },
  {
    id: "a0000000-0000-0000-0000-000000000002",
    phone: "+919876543210",
    full_name: "Dr. Rajesh Sharma",
    preferred_language: "hi",
    role: "doctor",
  },
  {
    id: "a0000000-0000-0000-0000-000000000003",
    phone: "+919876543211",
    full_name: "Dr. Priya Iyer",
    preferred_language: "en",
    role: "doctor",
  },
  {
    id: "a0000000-0000-0000-0000-000000000004",
    phone: "+919876543212",
    full_name: "Dr. Sameer Khan",
    preferred_language: "en",
    role: "doctor",
  },
  {
    id: "a0000000-0000-0000-0000-000000000005",
    phone: "+919123456780",
    full_name: "Aarav Patel",
    preferred_language: "en",
    role: "patient",
  },
];

const SEED_CLINICS = [
  {
    id: "b0000000-0000-0000-0000-000000000001",
    name: "Apollo Care Clinic Indirapuram",
    abdm_hfr_id: "IN-UP-GZB-001245",
    verified: true,
    address: "Plot 14, Ahinsa Khand 2, Indirapuram, Ghaziabad, UP 201014",
    latitude: 28.6369,
    longitude: 77.3698,
    operating_hours: { open: "08:00", close: "21:00", days: "Mon-Sat" },
    accessibility_features: { wheelchair: true, ramp: true, elevator: true },
    has_pharmacy: true,
  },
  {
    id: "b0000000-0000-0000-0000-000000000002",
    name: "Max MedCentre Lajpat Nagar",
    abdm_hfr_id: "IN-DL-SE-008912",
    verified: true,
    address: "Ring Road, Lajpat Nagar IV, New Delhi 110024",
    latitude: 28.5683,
    longitude: 77.2433,
    operating_hours: { open: "08:00", close: "20:00", days: "Mon-Sun" },
    accessibility_features: { wheelchair: true, ramp: true, elevator: true, parking: true },
    has_pharmacy: true,
  },
  {
    id: "b0000000-0000-0000-0000-000000000003",
    name: "Fortis Community Health Centre",
    abdm_hfr_id: "IN-KA-BLR-004521",
    verified: true,
    address: "ITPB Main Road, Whitefield, Bengaluru, Karnataka 560066",
    latitude: 12.9833,
    longitude: 77.75,
    operating_hours: { open: "09:00", close: "21:00", days: "Mon-Sat" },
    accessibility_features: { wheelchair: true, ramp: true },
    has_pharmacy: true,
  },
  {
    id: "b0000000-0000-0000-0000-000000000004",
    name: "Aarogyam Urban Primary Health Centre",
    abdm_hfr_id: "IN-MH-MUM-003310",
    verified: false,
    address: "S.V. Road, Andheri West, Mumbai, Maharashtra 400058",
    latitude: 19.1197,
    longitude: 72.8468,
    operating_hours: { open: "09:00", close: "18:00", days: "Mon-Fri" },
    accessibility_features: { wheelchair: false, ramp: true },
    has_pharmacy: false,
  },
];

const SEED_DOCTORS = [
  {
    id: "c0000000-0000-0000-0000-000000000001",
    user_id: "a0000000-0000-0000-0000-000000000002",
    clinic_id: "b0000000-0000-0000-0000-000000000001",
    registration_number: "MCI-2015-08492",
    specialty: "General Physician",
    languages: ["en", "hi"],
    consultation_fee: 500.0,
    verified: true,
    rating: 4.8,
  },
  {
    id: "c0000000-0000-0000-0000-000000000002",
    user_id: "a0000000-0000-0000-0000-000000000003",
    clinic_id: "b0000000-0000-0000-0000-000000000002",
    registration_number: "DMC-2018-12940",
    specialty: "Pediatrics",
    languages: ["en", "hi", "ta"],
    consultation_fee: 650.0,
    verified: true,
    rating: 4.9,
  },
  {
    id: "c0000000-0000-0000-0000-000000000003",
    user_id: "a0000000-0000-0000-0000-000000000004",
    clinic_id: "b0000000-0000-0000-0000-000000000004",
    registration_number: "KMC-2022-99124",
    specialty: "Dermatology",
    languages: ["en", "ur"],
    consultation_fee: 400.0,
    verified: false,
    rating: 4.2,
  },
];

const SEED_MEDICINES = [
  {
    id: "d0000000-0000-0000-0000-000000000001",
    brand_name: "Dolo 650",
    composition: "Paracetamol",
    strength: "650mg",
    substitution_caution_class: null,
  },
  {
    id: "d0000000-0000-0000-0000-000000000002",
    brand_name: "Calpol 650",
    composition: "Paracetamol",
    strength: "650mg",
    substitution_caution_class: null,
  },
  {
    id: "d0000000-0000-0000-0000-000000000003",
    brand_name: "Generic Paracetamol PMBI",
    composition: "Paracetamol",
    strength: "650mg",
    substitution_caution_class: null,
  },
  {
    id: "d0000000-0000-0000-0000-000000000004",
    brand_name: "Augmentin 625 Duo",
    composition: "Amoxicillin and Clavulanic Acid",
    strength: "500mg+125mg",
    substitution_caution_class: "combination_drugs",
  },
  {
    id: "d0000000-0000-0000-0000-000000000005",
    brand_name: "Moxikind-CV 625",
    composition: "Amoxicillin and Clavulanic Acid",
    strength: "500mg+125mg",
    substitution_caution_class: "combination_drugs",
  },
  {
    id: "d0000000-0000-0000-0000-000000000006",
    brand_name: "Pan 40",
    composition: "Pantoprazole",
    strength: "40mg",
    substitution_caution_class: null,
  },
  {
    id: "d0000000-0000-0000-0000-000000000007",
    brand_name: "Pantocid 40",
    composition: "Pantoprazole",
    strength: "40mg",
    substitution_caution_class: null,
  },
  {
    id: "d0000000-0000-0000-0000-000000000008",
    brand_name: "Asthalin Inhaler",
    composition: "Salbutamol",
    strength: "100mcg",
    substitution_caution_class: "inhalers",
  },
  {
    id: "d0000000-0000-0000-0000-000000000009",
    brand_name: "Lantus Solostar",
    composition: "Insulin Glargine",
    strength: "100IU/ml",
    substitution_caution_class: "insulin",
  },
  {
    id: "d0000000-0000-0000-0000-000000000010",
    brand_name: "Eltroxin 50",
    composition: "Thyroxine Sodium",
    strength: "50mcg",
    substitution_caution_class: "narrow_therapeutic_index",
  },
];

const SEED_PHARMACY_STOCK = [
  {
    id: "e0000000-0000-0000-0000-000000000001",
    clinic_id: "b0000000-0000-0000-0000-000000000001",
    medicine_id: "d0000000-0000-0000-0000-000000000001",
    price: 32.5,
    in_stock: true,
  },
  {
    id: "e0000000-0000-0000-0000-000000000002",
    clinic_id: "b0000000-0000-0000-0000-000000000001",
    medicine_id: "d0000000-0000-0000-0000-000000000003",
    price: 9.8,
    in_stock: true,
  },
  {
    id: "e0000000-0000-0000-0000-000000000003",
    clinic_id: "b0000000-0000-0000-0000-000000000002",
    medicine_id: "d0000000-0000-0000-0000-000000000004",
    price: 205.0,
    in_stock: true,
  },
  {
    id: "e0000000-0000-0000-0000-000000000004",
    clinic_id: "b0000000-0000-0000-0000-000000000002",
    medicine_id: "d0000000-0000-0000-0000-000000000005",
    price: 135.0,
    in_stock: true,
  },
  {
    id: "e0000000-0000-0000-0000-000000000005",
    clinic_id: "b0000000-0000-0000-0000-000000000003",
    medicine_id: "d0000000-0000-0000-0000-000000000006",
    price: 155.0,
    in_stock: true,
  },
];

module.exports = {
  SEED_USERS,
  SEED_CLINICS,
  SEED_DOCTORS,
  SEED_MEDICINES,
  SEED_PHARMACY_STOCK,
};
