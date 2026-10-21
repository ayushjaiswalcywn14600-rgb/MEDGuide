-- MEDGUIDE core schema (PostgreSQL)
-- This is a starting point, not a full migration history. Use a migration
-- tool (e.g. node-pg-migrate, Prisma, or Knex) to evolve this in production.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(15) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    preferred_language VARCHAR(10) DEFAULT 'en',
    role VARCHAR(20) NOT NULL DEFAULT 'patient', -- patient | doctor | clinic_admin | pharmacist | super_admin
    caregiver_mode BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE family_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    managed_by_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    relationship VARCHAR(50),
    age_group VARCHAR(30),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Explicit, revocable consent records — DPDP Act compliance backbone.
CREATE TABLE consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(100) NOT NULL, -- e.g. 'symptom_analysis', 'history_based_recommendations', 'marketing'
    granted BOOLEAN NOT NULL,
    granted_at TIMESTAMPTZ,
    withdrawn_at TIMESTAMPTZ,
    version VARCHAR(20) NOT NULL -- privacy policy / consent copy version shown to the user
);

CREATE TABLE symptom_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    family_profile_id UUID REFERENCES family_profiles(id),
    condition VARCHAR(50),
    input_mode VARCHAR(20), -- text | voice | image | video | guided_form
    raw_input_ref TEXT, -- pointer to S3/Cloudinary object, not the raw file itself
    detected_language VARCHAR(10),
    answers JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE triage_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symptom_session_id UUID REFERENCES symptom_sessions(id),
    level VARCHAR(10) NOT NULL, -- GREEN | YELLOW | RED
    reasons JSONB,
    escalated_by_ai BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE clinics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    abdm_hfr_id VARCHAR(100) UNIQUE, -- ABDM Health Facility Registry ID
    verified BOOLEAN DEFAULT FALSE,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    operating_hours JSONB,
    accessibility_features JSONB,
    has_pharmacy BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE doctors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    clinic_id UUID REFERENCES clinics(id),
    registration_number VARCHAR(100) NOT NULL,
    specialty VARCHAR(100),
    languages JSONB,
    consultation_fee NUMERIC(10, 2),
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    rating NUMERIC(3, 2)
);

CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    doctor_id UUID REFERENCES doctors(id),
    mode VARCHAR(10), -- online | offline
    scheduled_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'booked', -- booked | completed | cancelled | no_show
    cancellation_policy TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE prescriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID REFERENCES appointments(id),
    doctor_id UUID REFERENCES doctors(id),
    user_id UUID REFERENCES users(id),
    medicines JSONB, -- [{ name, composition, dosage, durationDays }]
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE medicines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_name VARCHAR(255) NOT NULL,
    composition VARCHAR(255) NOT NULL,
    strength VARCHAR(50),
    substitution_caution_class VARCHAR(50) -- modified_release | combination_drugs | insulin | inhalers | narrow_therapeutic_index | NULL
);

CREATE TABLE pharmacy_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id),
    medicine_id UUID REFERENCES medicines(id),
    price NUMERIC(10, 2),
    in_stock BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE health_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    family_profile_id UUID REFERENCES family_profiles(id),
    record_type VARCHAR(30), -- symptom | diagnosis | prescription | lab_report | vaccination | allergy | chronic_condition
    file_ref TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE daily_health_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    tracked_date DATE NOT NULL,
    sleep_hours NUMERIC(4, 1),
    water_ml INTEGER,
    steps INTEGER,
    bp_systolic INTEGER,
    bp_diastolic INTEGER,
    blood_sugar NUMERIC(5, 1),
    temperature_c NUMERIC(4, 1),
    mood VARCHAR(30),
    weight_kg NUMERIC(5, 1),
    pain_score INTEGER,
    UNIQUE (user_id, tracked_date)
);

CREATE TABLE sos_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    triggered_from VARCHAR(30), -- home_button | lock_screen_widget | red_triage
    status VARCHAR(20) DEFAULT 'pending_confirmation', -- pending_confirmation | dispatched | cancelled
    dispatched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    doctor_id UUID REFERENCES doctors(id),
    clinic_id UUID REFERENCES clinics(id),
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    body TEXT,
    verified_patient BOOLEAN DEFAULT FALSE,
    moderation_status VARCHAR(20) DEFAULT 'pending', -- pending | approved | rejected
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Append-only audit trail (see backend/shared/auditLog.js).
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID,
    actor_role VARCHAR(20),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_symptom_sessions_user ON symptom_sessions(user_id);
CREATE INDEX idx_triage_results_session ON triage_results(symptom_session_id);
CREATE INDEX idx_appointments_user ON appointments(user_id);
CREATE INDEX idx_health_records_user ON health_records(user_id);
CREATE INDEX idx_audit_logs_target ON audit_logs(target_type, target_id);
