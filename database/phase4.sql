-- ==============================================================================
-- COLLEGE BUS MANAGEMENT PLATFORM - PHASE 4 DATABASE MIGRATION
-- Target Environment: PostgreSQL / Supabase
-- Run in Supabase SQL Editor AFTER phase1.sql, phase2.sql, and phase3.sql
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. ADMINISTRATIVE AUDIT TRAIL TABLE
-- Records significant institutional actions (staff approvals, bus edits, student assignments)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    action            VARCHAR(50)  NOT NULL,
    performed_by      UUID         NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    performed_by_name VARCHAR(100) NULL,
    entity_type       VARCHAR(50)  NOT NULL,
    entity_id         VARCHAR(100) NULL,
    details           JSONB        NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 3. COMPOSITE PERFORMANCE INDEXES
-- Accelerates date-range reporting, aggregation, and live fleet monitoring queries
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_att_date_bus          ON public.daily_attendance(attendance_date, bus_id);
CREATE INDEX IF NOT EXISTS idx_att_date_status       ON public.daily_attendance(attendance_date, status);
CREATE INDEX IF NOT EXISTS idx_standing_date_bus     ON public.daily_standing_log(log_date, bus_id);
CREATE INDEX IF NOT EXISTS idx_standing_date_reason  ON public.daily_standing_log(log_date, standing_reason);
CREATE INDEX IF NOT EXISTS idx_bus_assign_date_bus   ON public.daily_bus_assignments(assignment_date, bus_id);
CREATE INDEX IF NOT EXISTS idx_bus_assign_date_staff ON public.daily_bus_assignments(assignment_date, staff_id);
CREATE INDEX IF NOT EXISTS idx_bus_assign_status     ON public.daily_bus_assignments(status);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity     ON public.audit_logs(entity_type, entity_id);

-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS) FOR AUDIT LOGS
-- ==============================================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_admin_all ON public.audit_logs;
CREATE POLICY audit_logs_admin_all
    ON public.audit_logs FOR ALL
    TO authenticated
    USING      (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- ==============================================================================
-- 5. SERVICE ROLE & AUTHENTICATED GRANTS
-- Backend Node.js uses service_role key to log audit events securely
-- ==============================================================================
GRANT ALL ON public.audit_logs TO service_role;
GRANT SELECT ON public.audit_logs TO authenticated;

-- ==============================================================================
-- 6. RELOAD SCHEMA CACHE
-- Signals Supabase PostgREST to immediately refresh its schema cache
-- ==============================================================================
NOTIFY pgrst, 'reload schema';
