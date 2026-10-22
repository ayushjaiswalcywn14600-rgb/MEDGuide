exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      phone VARCHAR(15) UNIQUE NOT NULL,
      full_name VARCHAR(255),
      preferred_language VARCHAR(10) DEFAULT 'en',
      role VARCHAR(20) NOT NULL DEFAULT 'patient',
      caregiver_mode BOOLEAN DEFAULT FALSE,
      refresh_token_hash TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS family_profiles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      managed_by_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      full_name VARCHAR(255) NOT NULL,
      relationship VARCHAR(50),
      age_group VARCHAR(30),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS consents (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      purpose VARCHAR(100) NOT NULL,
      granted BOOLEAN NOT NULL,
      granted_at TIMESTAMPTZ,
      withdrawn_at TIMESTAMPTZ,
      version VARCHAR(20) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS symptom_sessions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id),
      family_profile_id UUID REFERENCES family_profiles(id),
      condition VARCHAR(50),
      input_mode VARCHAR(20),
      raw_input_ref TEXT,
      detected_language VARCHAR(10),
      answers JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS triage_results (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      symptom_session_id UUID REFERENCES symptom_sessions(id),
      level VARCHAR(10) NOT NULL,
      reasons JSONB,
      escalated_by_ai BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clinics (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      abdm_hfr_id VARCHAR(100) UNIQUE,
      verified BOOLEAN DEFAULT FALSE,
      address TEXT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      operating_hours JSONB,
      accessibility_features JSONB,
      has_pharmacy BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS doctors (
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

    CREATE TABLE IF NOT EXISTS appointments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id),
      doctor_id UUID REFERENCES doctors(id),
      mode VARCHAR(10),
      scheduled_at TIMESTAMPTZ,
      status VARCHAR(20) DEFAULT 'booked',
      cancellation_policy TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT uq_doctor_slot UNIQUE (doctor_id, scheduled_at)
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      appointment_id UUID REFERENCES appointments(id),
      doctor_id UUID REFERENCES doctors(id),
      user_id UUID REFERENCES users(id),
      medicines JSONB,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS medicines (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      brand_name VARCHAR(255) NOT NULL,
      composition VARCHAR(255) NOT NULL,
      strength VARCHAR(50),
      substitution_caution_class VARCHAR(50)
    );

    CREATE TABLE IF NOT EXISTS pharmacy_stock (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      clinic_id UUID REFERENCES clinics(id),
      medicine_id UUID REFERENCES medicines(id),
      price NUMERIC(10, 2),
      in_stock BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS health_records (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id),
      family_profile_id UUID REFERENCES family_profiles(id),
      record_type VARCHAR(30),
      file_ref TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS daily_health_tracking (
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

    CREATE TABLE IF NOT EXISTS sos_events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id),
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      triggered_from VARCHAR(30),
      status VARCHAR(20) DEFAULT 'pending_confirmation',
      dispatched_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id),
      doctor_id UUID REFERENCES doctors(id),
      clinic_id UUID REFERENCES clinics(id),
      rating INTEGER CHECK (rating BETWEEN 1 AND 5),
      body TEXT,
      verified_patient BOOLEAN DEFAULT FALSE,
      moderation_status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      actor_id UUID,
      actor_role VARCHAR(20),
      action VARCHAR(100) NOT NULL,
      target_type VARCHAR(50),
      target_id UUID,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_symptom_sessions_user ON symptom_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_triage_results_session ON triage_results(symptom_session_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);
    CREATE INDEX IF NOT EXISTS idx_health_records_user ON health_records(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
    CREATE INDEX IF NOT EXISTS idx_sos_events_user ON sos_events(user_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS audit_logs CASCADE;
    DROP TABLE IF EXISTS reviews CASCADE;
    DROP TABLE IF EXISTS sos_events CASCADE;
    DROP TABLE IF EXISTS daily_health_tracking CASCADE;
    DROP TABLE IF EXISTS health_records CASCADE;
    DROP TABLE IF EXISTS pharmacy_stock CASCADE;
    DROP TABLE IF EXISTS medicines CASCADE;
    DROP TABLE IF EXISTS prescriptions CASCADE;
    DROP TABLE IF EXISTS appointments CASCADE;
    DROP TABLE IF EXISTS doctors CASCADE;
    DROP TABLE IF EXISTS clinics CASCADE;
    DROP TABLE IF EXISTS triage_results CASCADE;
    DROP TABLE IF EXISTS symptom_sessions CASCADE;
    DROP TABLE IF EXISTS consents CASCADE;
    DROP TABLE IF EXISTS family_profiles CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
  `);
};
