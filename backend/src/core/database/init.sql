-- PostgreSQL 16 Initial Schema with Bitemporal History, Triggers, Indexes & RLS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch";

-- Departments
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    district VARCHAR(100) NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Roles
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '[]'::jsonb
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    department_id UUID REFERENCES departments(id),
    district VARCHAR(100),
    totp_secret VARCHAR(100),
    totp_enabled BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true,
    failed_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions (Refresh token rotation with reuse detection)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    device_info VARCHAR(255),
    ip_address VARCHAR(50),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bitemporal Persons
CREATE TABLE IF NOT EXISTS persons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_uid VARCHAR(64) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(20) NOT NULL,
    phone_encrypted TEXT,
    email_encrypted TEXT,
    address_line TEXT NOT NULL,
    district VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(20) NOT NULL,
    photo_phash VARCHAR(64),
    exif_data JSONB,
    status VARCHAR(30) DEFAULT 'ALIVE',
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59Z',
    recorded_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_to TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59Z',
    is_current BOOLEAN DEFAULT true
);

-- Person Identifiers (Masked + Encrypted + HMAC Hash for cross-dept queries)
CREATE TABLE IF NOT EXISTS identifiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_uid VARCHAR(64) NOT NULL,
    id_type VARCHAR(50) NOT NULL,
    id_value_masked VARCHAR(50) NOT NULL,
    id_value_encrypted TEXT NOT NULL,
    id_hash_hmac VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bitemporal Properties (Unique Property UID independent of Households)
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_uid VARCHAR(64) NOT NULL,
    property_type VARCHAR(50) NOT NULL,
    normalized_address TEXT NOT NULL,
    district VARCHAR(100) NOT NULL,
    pincode VARCHAR(20) NOT NULL,
    geo_lat NUMERIC(10, 6),
    geo_lng NUMERIC(10, 6),
    area_sqft NUMERIC(10, 2),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59Z',
    recorded_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_to TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59Z',
    is_current BOOLEAN DEFAULT true
);

-- Bitemporal Households
CREATE TABLE IF NOT EXISTS households (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_uid VARCHAR(64) NOT NULL,
    property_uid VARCHAR(64) NOT NULL,
    head_person_uid VARCHAR(64) NOT NULL,
    income_category VARCHAR(20) NOT NULL DEFAULT 'APL', -- BPL, APL, OTHER
    annual_income_encrypted TEXT,
    district VARCHAR(100) NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59Z',
    recorded_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_to TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59Z',
    is_current BOOLEAN DEFAULT true
);

-- Household Memberships (Effective-dated)
CREATE TABLE IF NOT EXISTS household_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_uid VARCHAR(64) NOT NULL,
    person_uid VARCHAR(64) NOT NULL,
    role_in_household VARCHAR(50) DEFAULT 'MEMBER',
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59Z',
    recorded_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_to TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59Z',
    is_current BOOLEAN DEFAULT true
);

-- Family Relationships
CREATE TABLE IF NOT EXISTS relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_uid_1 VARCHAR(64) NOT NULL,
    person_uid_2 VARCHAR(64) NOT NULL,
    relationship_type VARCHAR(50) NOT NULL, -- PARENT, CHILD, SPOUSE, SIBLING
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59Z',
    recorded_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_to TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59Z',
    is_current BOOLEAN DEFAULT true
);

-- Income Records History
CREATE TABLE IF NOT EXISTS income_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_uid VARCHAR(64) NOT NULL,
    household_uid VARCHAR(64),
    income_amount_encrypted TEXT NOT NULL,
    category VARCHAR(20) NOT NULL, -- BPL, APL, OTHER
    source VARCHAR(100),
    verification_doc_id UUID,
    verified BOOLEAN DEFAULT false,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59Z',
    recorded_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_to TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59Z',
    is_current BOOLEAN DEFAULT true
);

-- Life Events (BIRTH, MARRIAGE, HOUSEHOLD_SEPARATION, MERGE, DEATH, ADDRESS_CHANGE)
CREATE TABLE IF NOT EXISTS life_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_uid VARCHAR(64) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_payload JSONB NOT NULL,
    effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_integration VARCHAR(100) DEFAULT 'MANUAL',
    is_compensated BOOLEAN DEFAULT false,
    compensating_event_id UUID,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Family QR Cards
CREATE TABLE IF NOT EXISTS family_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_uid VARCHAR(64) NOT NULL,
    card_token VARCHAR(255) UNIQUE NOT NULL,
    signed_snapshot_jwt TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, REVOKED
    issued_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Welfare Schemes
CREATE TABLE IF NOT EXISTS schemes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    department_id UUID REFERENCES departments(id),
    grant_unit VARCHAR(20) NOT NULL, -- INDIVIDUAL, HOUSEHOLD, PROPERTY
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheme Versions (Immutable DSL)
CREATE TABLE IF NOT EXISTS scheme_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scheme_id UUID REFERENCES schemes(id),
    version_number INT NOT NULL,
    rules_dsl JSONB NOT NULL,
    benefit_amount NUMERIC(12, 2) NOT NULL,
    cooldown_days INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (scheme_id, version_number)
);

-- Scheme Bundles
CREATE TABLE IF NOT EXISTS scheme_bundles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    scheme_ids JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Applications
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_number VARCHAR(50) UNIQUE NOT NULL,
    applicant_person_uid VARCHAR(64) NOT NULL,
    household_uid VARCHAR(64),
    property_uid VARCHAR(64),
    scheme_id UUID REFERENCES schemes(id),
    scheme_version_id UUID REFERENCES scheme_versions(id),
    grant_unit VARCHAR(20) NOT NULL,
    status VARCHAR(30) DEFAULT 'SUBMITTED', -- SUBMITTED, UNDER_VERIFICATION, FLAGGED, APPROVED, REJECTED, DISBURSED, WITHDRAWN, APPEALED
    evaluation_snapshot JSONB NOT NULL,
    risk_score VARCHAR(10) DEFAULT 'LOW', -- LOW, MEDIUM, HIGH
    risk_explanation JSONB DEFAULT '{}'::jsonb,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Application Events
CREATE TABLE IF NOT EXISTS application_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES applications(id),
    from_status VARCHAR(30),
    to_status VARCHAR(30) NOT NULL,
    actor_user_id UUID,
    reason TEXT NOT NULL,
    note_en TEXT NOT NULL,
    note_hi TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Benefit Ledger (Source of truth for grant disbursement)
CREATE TABLE IF NOT EXISTS benefit_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES applications(id),
    scheme_id UUID REFERENCES schemes(id),
    person_uid VARCHAR(64) NOT NULL,
    household_uid VARCHAR(64),
    property_uid VARCHAR(64),
    grant_unit VARCHAR(20) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    disbursed_at TIMESTAMPTZ DEFAULT NOW(),
    transaction_ref VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'SUCCESS', -- SUCCESS, PENDING, RECONCILED, FAILED
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Reviews (Four-eyes approval)
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES applications(id),
    officer_user_id UUID REFERENCES users(id),
    step VARCHAR(30) NOT NULL, -- PRIMARY_REVIEW, SECOND_EYES, SUPERVISOR_OVERRIDE
    decision VARCHAR(20) NOT NULL, -- APPROVE, REJECT, FLAG
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appeals
CREATE TABLE IF NOT EXISTS appeals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES applications(id),
    appellant_person_uid VARCHAR(64) NOT NULL,
    grounds TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'SUBMITTED', -- SUBMITTED, UNDER_REVIEW, UPHELD, OVERTURNED
    original_officer_id UUID REFERENCES users(id),
    reviewing_officer_id UUID REFERENCES users(id),
    decision_reason TEXT,
    filed_at TIMESTAMPTZ DEFAULT NOW(),
    decided_at TIMESTAMPTZ
);

-- Documents & Wallet
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_uid VARCHAR(64) NOT NULL,
    doc_type VARCHAR(50) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    storage_key VARCHAR(255) NOT NULL,
    checksum_sha256 VARCHAR(64) NOT NULL,
    is_encrypted BOOLEAN DEFAULT true,
    iv_hex VARCHAR(32),
    verification_status VARCHAR(20) DEFAULT 'PENDING',
    malware_scanned BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document Versions
CREATE TABLE IF NOT EXISTS document_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id),
    version_number INT NOT NULL,
    storage_key VARCHAR(255) NOT NULL,
    checksum_sha256 VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hash-Chained Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sequence_number BIGSERIAL NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    actor_id VARCHAR(100) NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    prev_hash VARCHAR(64) NOT NULL,
    current_hash VARCHAR(64) NOT NULL,
    client_ip VARCHAR(50),
    user_agent TEXT,
    details JSONB DEFAULT '{}'::jsonb
);

-- Audit Checkpoints (Ed25519 signed Merkle roots)
CREATE TABLE IF NOT EXISTS audit_checkpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    epoch BIGINT NOT NULL,
    root_hash VARCHAR(64) NOT NULL,
    start_sequence BIGINT NOT NULL,
    end_sequence BIGINT NOT NULL,
    signature_ed25519 TEXT NOT NULL,
    public_key_pem TEXT NOT NULL,
    checkpoint_timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Access Log (Who accessed citizen data)
CREATE TABLE IF NOT EXISTS access_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_uid VARCHAR(64) NOT NULL,
    accessor_user_id VARCHAR(100) NOT NULL,
    accessor_role VARCHAR(50) NOT NULL,
    purpose TEXT NOT NULL,
    department_id VARCHAR(100),
    accessed_fields JSONB NOT NULL,
    accessed_at TIMESTAMPTZ DEFAULT NOW(),
    is_break_glass BOOLEAN DEFAULT false,
    break_glass_reason TEXT
);

-- Consents (Purpose-bound, revocable)
CREATE TABLE IF NOT EXISTS consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_uid VARCHAR(64) NOT NULL,
    department_id VARCHAR(100) NOT NULL,
    purpose VARCHAR(100) NOT NULL,
    permitted_fields JSONB NOT NULL,
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_to TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMPTZ
);

-- Correction Requests (Right to rectification)
CREATE TABLE IF NOT EXISTS correction_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_uid VARCHAR(64) NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    requested_value TEXT NOT NULL,
    evidence_document_id UUID,
    status VARCHAR(30) DEFAULT 'SUBMITTED',
    reviewed_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Outbox (Guaranteed delivery pattern)
CREATE TABLE IF NOT EXISTS outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PUBLISHED, FAILED
    retry_count INT DEFAULT 0,
    scheduled_for TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_person_uid VARCHAR(64) NOT NULL,
    channel VARCHAR(20) NOT NULL, -- SMS, WHATSAPP, EMAIL
    template_key VARCHAR(100) NOT NULL,
    lang VARCHAR(10) DEFAULT 'EN',
    message_body TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'QUEUED',
    provider_ref VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

-- Risk Signals
CREATE TABLE IF NOT EXISTS risk_signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES applications(id),
    signal_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    score_contribution NUMERIC(5, 2) NOT NULL,
    evidence JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Entity Resolution Clusters
CREATE TABLE IF NOT EXISTS entity_clusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cluster_uid VARCHAR(64) UNIQUE NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_ids JSONB NOT NULL,
    confidence_score NUMERIC(5, 2) NOT NULL,
    resolution_reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Policy Simulations (What-if)
CREATE TABLE IF NOT EXISTS simulations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    proposed_rule_change JSONB NOT NULL,
    total_evaluated INT DEFAULT 0,
    newly_eligible_count INT DEFAULT 0,
    newly_ineligible_count INT DEFAULT 0,
    estimated_cost_delta NUMERIC(14, 2) DEFAULT 0,
    affected_districts JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SLA Timers
CREATE TABLE IF NOT EXISTS sla_timers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES applications(id),
    stage VARCHAR(50) NOT NULL,
    deadline_at TIMESTAMPTZ NOT NULL,
    escalated BOOLEAN DEFAULT false,
    escalated_to_user_id UUID REFERENCES users(id),
    escalated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Case Summaries
CREATE TABLE IF NOT EXISTS case_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES applications(id),
    summary_text_en TEXT NOT NULL,
    summary_text_hi TEXT NOT NULL,
    key_factors JSONB NOT NULL,
    generated_by VARCHAR(20) DEFAULT 'TEMPLATE', -- AI, TEMPLATE
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Triggers to PREVENT HARD DELETES (Bitemporal and Audit immutability)
CREATE OR REPLACE FUNCTION prevent_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Hard deletes forbidden on table %. Records must be bitemporally closed.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_no_delete_persons ON persons;
CREATE TRIGGER trg_no_delete_persons BEFORE DELETE ON persons FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();

DROP TRIGGER IF EXISTS trg_no_delete_properties ON properties;
CREATE TRIGGER trg_no_delete_properties BEFORE DELETE ON properties FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();

DROP TRIGGER IF EXISTS trg_no_delete_households ON households;
CREATE TRIGGER trg_no_delete_households BEFORE DELETE ON households FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();

DROP TRIGGER IF EXISTS trg_no_delete_benefit_ledger ON benefit_ledger;
CREATE TRIGGER trg_no_delete_benefit_ledger BEFORE DELETE ON benefit_ledger FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();

DROP TRIGGER IF EXISTS trg_no_delete_audit_log ON audit_log;
CREATE TRIGGER trg_no_delete_audit_log BEFORE DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();

-- Row Level Security (RLS) setup
ALTER TABLE persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Dynamic RLS policies for application scoped roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'person_district_isolation_policy') THEN
        CREATE POLICY person_district_isolation_policy ON persons
        FOR ALL
        USING (
            current_setting('app.current_user_role', true) IN ('SYSTEM_ADMIN', 'AUDITOR')
            OR current_setting('app.current_user_district', true) IS NULL
            OR current_setting('app.current_user_district', true) = ''
            OR district = current_setting('app.current_user_district', true)
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'applications_district_isolation_policy') THEN
        CREATE POLICY applications_district_isolation_policy ON applications
        FOR ALL
        USING (
            current_setting('app.current_user_role', true) IN ('SYSTEM_ADMIN', 'AUDITOR')
            OR current_setting('app.current_user_district', true) IS NULL
            OR current_setting('app.current_user_district', true) = ''
            OR EXISTS (
                SELECT 1 FROM persons p 
                WHERE p.person_uid = applications.applicant_person_uid 
                AND p.district = current_setting('app.current_user_district', true)
            )
        );
    END IF;
END $$;

-- Indexes on primary lookup paths
CREATE INDEX IF NOT EXISTS idx_persons_uid ON persons(person_uid);
CREATE INDEX IF NOT EXISTS idx_persons_current ON persons(person_uid, is_current);
CREATE INDEX IF NOT EXISTS idx_persons_district ON persons(district);
CREATE INDEX IF NOT EXISTS idx_properties_uid ON properties(property_uid);
CREATE INDEX IF NOT EXISTS idx_households_uid ON households(household_uid);
CREATE INDEX IF NOT EXISTS idx_memberships_household ON household_memberships(household_uid);
CREATE INDEX IF NOT EXISTS idx_memberships_person ON household_memberships(person_uid);
CREATE INDEX IF NOT EXISTS idx_relationships_pair ON relationships(person_uid_1, person_uid_2);
CREATE INDEX IF NOT EXISTS idx_applications_num ON applications(application_number);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_benefit_ledger_person ON benefit_ledger(person_uid);
CREATE INDEX IF NOT EXISTS idx_benefit_ledger_household ON benefit_ledger(household_uid);
CREATE INDEX IF NOT EXISTS idx_benefit_ledger_property ON benefit_ledger(property_uid);
CREATE INDEX IF NOT EXISTS idx_audit_log_seq ON audit_log(sequence_number);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status);
