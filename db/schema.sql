-- Education automation — canonical PostgreSQL schema.
-- Matches docs/architecture.md "Canonical data". Run this BEFORE any ingestion.
-- Idempotent: safe to re-run.
--
-- Ownership:
--   students, subjects, attendance_records, test_results, bookings, oauth_tokens -> backend
--   notification_events                                                          -> voice teammate
-- Ingestion/voice code must use exactly these column names (see docs/progress/2026-10-08-backend.md).

BEGIN;

-- ---------------------------------------------------------------------------
-- students
-- One row per student, scoped to a professor by professor_email.
-- email is stored normalized (lowercase) and unique.
-- phone is admin-only and must never be returned to a student session.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
    id              SERIAL PRIMARY KEY,
    name            TEXT        NOT NULL,
    roll_no         TEXT        NOT NULL,
    email           TEXT        NOT NULL,
    phone           TEXT,
    professor_email TEXT        NOT NULL,
    active          BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT students_email_lowercase CHECK (email = lower(email)),
    CONSTRAINT students_professor_email_lowercase CHECK (professor_email = lower(professor_email)),
    CONSTRAINT students_roll_no_unique UNIQUE (roll_no),
    CONSTRAINT students_email_unique UNIQUE (email)
);

-- Idempotent upgrade for databases created before the ingestion integration.
ALTER TABLE students ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS students_professor_email_idx ON students (professor_email);

-- ---------------------------------------------------------------------------
-- subjects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subjects (
    id              SERIAL PRIMARY KEY,
    name            TEXT        NOT NULL,
    code            TEXT        NOT NULL,
    professor_email TEXT        NOT NULL,
    department      TEXT,
    threshold       INTEGER     NOT NULL DEFAULT 85,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT subjects_code_unique UNIQUE (professor_email, code),
    CONSTRAINT subjects_threshold_range CHECK (threshold >= 1 AND threshold <= 99)
);

-- Idempotent upgrade for databases created before the ingestion integration.
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS threshold INTEGER NOT NULL DEFAULT 85;

CREATE INDEX IF NOT EXISTS subjects_professor_email_idx ON subjects (professor_email);

-- ---------------------------------------------------------------------------
-- import_batches (ingestion)
-- Staged, single-use previews created by the import endpoints. The normalized
-- payload and validation report are stored as JSONB; the original workbook
-- binary is never persisted. A batch expires 30 minutes after creation and can
-- be confirmed exactly once.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_batches (
    id                SERIAL PRIMARY KEY,
    professor_email   TEXT        NOT NULL,
    subject_id        INTEGER     REFERENCES subjects (id) ON DELETE SET NULL,
    type              TEXT        NOT NULL,
    filename          TEXT        NOT NULL,
    checksum          TEXT        NOT NULL,
    status            TEXT        NOT NULL DEFAULT 'pending',
    parsed_payload    JSONB       NOT NULL,
    validation_report JSONB       NOT NULL,
    expires_at        TIMESTAMPTZ NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at      TIMESTAMPTZ,
    CONSTRAINT import_batches_type_valid CHECK (type IN ('roster', 'attendance', 'marks')),
    CONSTRAINT import_batches_status_valid CHECK (status IN ('pending', 'processing', 'confirmed', 'expired')),
    CONSTRAINT import_batches_professor_email_lowercase CHECK (professor_email = lower(professor_email))
);

CREATE INDEX IF NOT EXISTS import_batches_professor_status_idx
    ON import_batches (professor_email, status);

-- ---------------------------------------------------------------------------
-- attendance_records
-- Unique per (student, subject, class_date) so re-import updates instead of
-- double counting.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_records (
    id          SERIAL PRIMARY KEY,
    student_id  INTEGER     NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    subject_id  INTEGER     NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    class_date  DATE        NOT NULL,
    present     BOOLEAN     NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT attendance_records_unique UNIQUE (student_id, subject_id, class_date)
);

CREATE INDEX IF NOT EXISTS attendance_records_subject_idx ON attendance_records (subject_id);

-- ---------------------------------------------------------------------------
-- test_results
-- Percentages are computed (score / max_score * 100), not stored.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS test_results (
    id          SERIAL PRIMARY KEY,
    student_id  INTEGER      NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    subject_id  INTEGER      NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    test_name   TEXT         NOT NULL,
    test_date   DATE         NOT NULL,
    score       NUMERIC(6,2) NOT NULL,
    max_score   NUMERIC(6,2) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT test_results_max_score_positive CHECK (max_score > 0),
    CONSTRAINT test_results_score_non_negative CHECK (score >= 0),
    CONSTRAINT test_results_unique UNIQUE (student_id, subject_id, test_name, test_date)
);

CREATE INDEX IF NOT EXISTS test_results_subject_idx ON test_results (subject_id);

-- ---------------------------------------------------------------------------
-- bookings
-- Overlapping reservations are prevented in application code inside a
-- transaction guarded by pg_advisory_xact_lock(hashtext(professor_email)).
-- google_event_id is set once the event exists on the professor's calendar.
-- status: pending -> confirmed | failed | cancelled
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
    id              SERIAL PRIMARY KEY,
    student_id      INTEGER     NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    subject_id      INTEGER     NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    professor_email TEXT        NOT NULL,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    google_event_id TEXT,
    status          TEXT        NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT bookings_status_valid CHECK (status IN ('pending', 'confirmed', 'cancelled', 'failed')),
    CONSTRAINT bookings_time_order CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS bookings_professor_time_idx
    ON bookings (professor_email, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS bookings_student_idx ON bookings (student_id);

-- ---------------------------------------------------------------------------
-- oauth_tokens (backend)
-- Encrypted refresh token storage for the single professor calendar account.
-- The ciphertext is AES-256-GCM (see lib/tokens.ts); the key is derived from
-- TOKEN_ENCRYPTION_KEY, falling back to NEXTAUTH_SECRET.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id                      SERIAL PRIMARY KEY,
    email                   TEXT        NOT NULL,
    provider                TEXT        NOT NULL DEFAULT 'google',
    refresh_token_encrypted TEXT        NOT NULL,
    scope                   TEXT,
    token_type              TEXT,
    expires_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT oauth_tokens_email_lowercase CHECK (email = lower(email)),
    CONSTRAINT oauth_tokens_unique UNIQUE (email, provider)
);

-- ---------------------------------------------------------------------------
-- notification_events (voice teammate)
-- Idempotency key per student/subject/risk transition.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_events (
    id              SERIAL PRIMARY KEY,
    student_id      INTEGER     NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    subject_id      INTEGER     NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    idempotency_key TEXT        NOT NULL,
    risk_level      TEXT        NOT NULL,
    provider        TEXT        NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at         TIMESTAMPTZ,
    CONSTRAINT notification_events_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS notification_events_student_idx
    ON notification_events (student_id, subject_id);

COMMIT;
