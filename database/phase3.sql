-- ==============================================================================
-- COLLEGE BUS MANAGEMENT PLATFORM - PHASE 3 DATABASE MIGRATION
-- Target Environment: PostgreSQL / Supabase
-- Run in Supabase SQL Editor AFTER phase1.sql and phase2.sql
-- ==============================================================================

-- 1. EXTENSIONS & FUNCTIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ==============================================================================
-- 2. DAILY BUS ASSIGNMENTS TABLE
-- Records daily bus claiming / duty by staff.
-- Enforces: ONE bus + ONE date = ONE active daily assignment.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.daily_bus_assignments (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_date   DATE         NOT NULL DEFAULT CURRENT_DATE,
    bus_id            UUID         NOT NULL REFERENCES public.buses(id) ON DELETE RESTRICT,
    staff_id          UUID         NOT NULL REFERENCES public.staff_profiles(id) ON DELETE RESTRICT,
    start_time        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at      TIMESTAMPTZ  NULL,
    status            VARCHAR(20)  NOT NULL DEFAULT 'in_service' CHECK (status IN ('in_service', 'completed')),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_daily_bus_assignment UNIQUE (bus_id, assignment_date)
);

-- ==============================================================================
-- 3. DAILY ATTENDANCE TABLE
-- Records daily morning/evening attendance for students permanently assigned to a bus.
-- Enforces: ONE student + ONE date = ONE attendance record.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.daily_attendance (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
    bus_id               UUID        NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
    student_id           UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    daily_assignment_id  UUID        NULL REFERENCES public.daily_bus_assignments(id) ON DELETE SET NULL,
    status               VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent')),
    recorded_by          UUID        NOT NULL REFERENCES public.staff_profiles(id) ON DELETE RESTRICT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_daily_attendance UNIQUE (attendance_date, student_id)
);

-- ==============================================================================
-- 4. DAILY STANDING LOG (Add daily_assignment_id FK if table exists)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.daily_standing_log (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    log_date            DATE        NOT NULL DEFAULT CURRENT_DATE,
    bus_id              UUID        NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
    student_id          UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    daily_assignment_id UUID        NULL REFERENCES public.daily_bus_assignments(id) ON DELETE SET NULL,
    standing_reason     VARCHAR(50) NOT NULL,
    recorded_by         UUID        NULL REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_standing_date_student UNIQUE (log_date, student_id),
    CONSTRAINT chk_standing_reason CHECK (
        standing_reason IN ('temporary', 'missed_regular_bus', 'route_change', 'no_capacity')
    )
);

-- Add daily_assignment_id column if daily_standing_log already existed from Phase 2
ALTER TABLE public.daily_standing_log
    ADD COLUMN IF NOT EXISTS daily_assignment_id UUID NULL REFERENCES public.daily_bus_assignments(id) ON DELETE SET NULL;

-- ==============================================================================
-- 5. PERFORMANCE INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_daily_bus_assignment_date  ON public.daily_bus_assignments(assignment_date);
CREATE INDEX IF NOT EXISTS idx_daily_bus_assignment_bus   ON public.daily_bus_assignments(bus_id);
CREATE INDEX IF NOT EXISTS idx_daily_bus_assignment_staff ON public.daily_bus_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_daily_bus_assignment_stat  ON public.daily_bus_assignments(status);

CREATE INDEX IF NOT EXISTS idx_attendance_date       ON public.daily_attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_bus        ON public.daily_attendance(bus_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student    ON public.daily_attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_assignment ON public.daily_attendance(daily_assignment_id);

CREATE INDEX IF NOT EXISTS idx_standing_assignment   ON public.daily_standing_log(daily_assignment_id);

-- ==============================================================================
-- 6. AUTOMATED UPDATED_AT TRIGGERS
-- ==============================================================================
DROP TRIGGER IF EXISTS tr_daily_bus_assignments_updated_at ON public.daily_bus_assignments;
CREATE TRIGGER tr_daily_bus_assignments_updated_at
    BEFORE UPDATE ON public.daily_bus_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_daily_attendance_updated_at ON public.daily_attendance;
CREATE TRIGGER tr_daily_attendance_updated_at
    BEFORE UPDATE ON public.daily_attendance
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.daily_bus_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_attendance      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_standing_log    ENABLE ROW LEVEL SECURITY;

-- DAILY BUS ASSIGNMENTS
DROP POLICY IF EXISTS daily_bus_admin_all ON public.daily_bus_assignments;
CREATE POLICY daily_bus_admin_all
    ON public.daily_bus_assignments FOR ALL
    TO authenticated
    USING      (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS daily_bus_staff_select ON public.daily_bus_assignments;
CREATE POLICY daily_bus_staff_select
    ON public.daily_bus_assignments FOR SELECT
    TO authenticated
    USING (public.is_approved_staff(auth.uid()));

DROP POLICY IF EXISTS daily_bus_staff_insert ON public.daily_bus_assignments;
CREATE POLICY daily_bus_staff_insert
    ON public.daily_bus_assignments FOR INSERT
    TO authenticated
    WITH CHECK (public.is_approved_staff(auth.uid()) AND staff_id = auth.uid());

DROP POLICY IF EXISTS daily_bus_staff_update ON public.daily_bus_assignments;
CREATE POLICY daily_bus_staff_update
    ON public.daily_bus_assignments FOR UPDATE
    TO authenticated
    USING      (public.is_approved_staff(auth.uid()) AND staff_id = auth.uid())
    WITH CHECK (public.is_approved_staff(auth.uid()) AND staff_id = auth.uid());

-- DAILY ATTENDANCE
DROP POLICY IF EXISTS attendance_admin_all ON public.daily_attendance;
CREATE POLICY attendance_admin_all
    ON public.daily_attendance FOR ALL
    TO authenticated
    USING      (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS attendance_staff_select ON public.daily_attendance;
CREATE POLICY attendance_staff_select
    ON public.daily_attendance FOR SELECT
    TO authenticated
    USING (public.is_approved_staff(auth.uid()));

DROP POLICY IF EXISTS attendance_staff_insert ON public.daily_attendance;
CREATE POLICY attendance_staff_insert
    ON public.daily_attendance FOR INSERT
    TO authenticated
    WITH CHECK (public.is_approved_staff(auth.uid()) AND recorded_by = auth.uid());

DROP POLICY IF EXISTS attendance_staff_update ON public.daily_attendance;
CREATE POLICY attendance_staff_update
    ON public.daily_attendance FOR UPDATE
    TO authenticated
    USING      (public.is_approved_staff(auth.uid()))
    WITH CHECK (public.is_approved_staff(auth.uid()));

-- DAILY STANDING LOG (Staff modifications)
DROP POLICY IF EXISTS standing_staff_insert ON public.daily_standing_log;
CREATE POLICY standing_staff_insert
    ON public.daily_standing_log FOR INSERT
    TO authenticated
    WITH CHECK (public.is_approved_staff(auth.uid()));

DROP POLICY IF EXISTS standing_staff_delete ON public.daily_standing_log;
CREATE POLICY standing_staff_delete
    ON public.daily_standing_log FOR DELETE
    TO authenticated
    USING (public.is_approved_staff(auth.uid()));

-- ==============================================================================
-- 8. SERVICE ROLE & AUTHENTICATED GRANTS
-- Backend Node.js uses service_role key to execute queries with administrative authority.
-- ==============================================================================
GRANT ALL ON public.daily_bus_assignments TO service_role;
GRANT ALL ON public.daily_attendance      TO service_role;
GRANT ALL ON public.daily_standing_log    TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.daily_bus_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.daily_attendance      TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.daily_standing_log    TO authenticated;

-- ==============================================================================
-- 9. RELOAD SCHEMA CACHE
-- Signals Supabase PostgREST to immediately refresh its schema cache.
-- ==============================================================================
NOTIFY pgrst, 'reload schema';
