-- ==============================================================================
-- COLLEGE BUS MANAGEMENT PLATFORM - PHASE 2 DATABASE MIGRATION
-- Target Environment: PostgreSQL / Supabase
-- Run in Supabase SQL Editor.
-- ==============================================================================

-- Ensure UUID extensions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Ensure handle_updated_at function exists
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
-- 1. BUSES TABLE
-- Represents physical buses in the transit fleet.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.buses (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    bus_number        VARCHAR(20)  NOT NULL,
    route_name        VARCHAR(255) NOT NULL,
    seating_capacity  INTEGER      NOT NULL,
    is_active         BOOLEAN      NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_buses_bus_number UNIQUE (bus_number),
    CONSTRAINT chk_buses_capacity  CHECK  (seating_capacity > 0)
);

-- ==============================================================================
-- 2. STUDENTS TABLE
-- Represents students assigned to buses. Bus/seat assignment is optional.
-- Seat uniqueness per bus is enforced; NULLs are treated as distinct by
-- PostgreSQL UNIQUE constraints, so multiple unassigned students are allowed.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.students (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name    VARCHAR(100) NOT NULL,
    roll_number  VARCHAR(50)  NOT NULL,
    bus_id       UUID         NULL REFERENCES public.buses(id) ON DELETE SET NULL,
    seat_number  INTEGER      NULL,
    is_active    BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_students_roll_number    UNIQUE  (roll_number),
    CONSTRAINT uq_students_bus_seat       UNIQUE  (bus_id, seat_number),
    CONSTRAINT chk_students_seat_positive CHECK   (seat_number IS NULL OR seat_number > 0),
    CONSTRAINT chk_students_seat_requires_bus CHECK (seat_number IS NULL OR bus_id IS NOT NULL)
);

-- ==============================================================================
-- 3. DAILY STANDING LOG (Phase 3 foundation — no UI built yet)
-- Records daily standing-student events per bus. Each student may only appear
-- once per calendar date.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.daily_standing_log (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    log_date        DATE        NOT NULL,
    bus_id          UUID        NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
    student_id      UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    standing_reason VARCHAR(50) NOT NULL,
    recorded_by     UUID        NULL REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_standing_date_student UNIQUE (log_date, student_id),
    CONSTRAINT chk_standing_reason CHECK (
        standing_reason IN ('temporary', 'missed_regular_bus', 'route_change', 'no_capacity')
    )
);

-- ==============================================================================
-- 4. PERFORMANCE INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_buses_bus_number     ON public.buses(bus_number);
CREATE INDEX IF NOT EXISTS idx_buses_is_active      ON public.buses(is_active);

CREATE INDEX IF NOT EXISTS idx_students_roll_number ON public.students(roll_number);
CREATE INDEX IF NOT EXISTS idx_students_bus_id      ON public.students(bus_id);
CREATE INDEX IF NOT EXISTS idx_students_is_active   ON public.students(is_active);

CREATE INDEX IF NOT EXISTS idx_standing_log_date    ON public.daily_standing_log(log_date);
CREATE INDEX IF NOT EXISTS idx_standing_log_bus     ON public.daily_standing_log(bus_id);
CREATE INDEX IF NOT EXISTS idx_standing_log_student ON public.daily_standing_log(student_id);

-- ==============================================================================
-- 5. AUTOMATED UPDATED_AT TRIGGERS (reuse handle_updated_at() from Phase 1)
-- ==============================================================================
DROP TRIGGER IF EXISTS tr_buses_updated_at ON public.buses;
CREATE TRIGGER tr_buses_updated_at
    BEFORE UPDATE ON public.buses
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_students_updated_at ON public.students;
CREATE TRIGGER tr_students_updated_at
    BEFORE UPDATE ON public.students
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.buses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_standing_log ENABLE ROW LEVEL SECURITY;

-- BUSES: admin has full access; approved staff can read
DROP POLICY IF EXISTS buses_admin_all    ON public.buses;
CREATE POLICY buses_admin_all
    ON public.buses FOR ALL
    TO authenticated
    USING      (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS buses_staff_select ON public.buses;
CREATE POLICY buses_staff_select
    ON public.buses FOR SELECT
    TO authenticated
    USING (public.is_approved_staff(auth.uid()));

-- STUDENTS: admin has full access; approved staff can read
DROP POLICY IF EXISTS students_admin_all    ON public.students;
CREATE POLICY students_admin_all
    ON public.students FOR ALL
    TO authenticated
    USING      (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS students_staff_select ON public.students;
CREATE POLICY students_staff_select
    ON public.students FOR SELECT
    TO authenticated
    USING (public.is_approved_staff(auth.uid()));

-- DAILY STANDING LOG: admin full access; approved staff can select (Phase 3 will add insert)
DROP POLICY IF EXISTS standing_log_admin_all    ON public.daily_standing_log;
CREATE POLICY standing_log_admin_all
    ON public.daily_standing_log FOR ALL
    TO authenticated
    USING      (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS standing_log_staff_select ON public.daily_standing_log;
CREATE POLICY standing_log_staff_select
    ON public.daily_standing_log FOR SELECT
    TO authenticated
    USING (public.is_approved_staff(auth.uid()));

-- ==============================================================================
-- 7. SERVICE ROLE GRANTS (backend uses service_role key to bypass RLS)
-- ==============================================================================
GRANT ALL ON public.buses              TO service_role;
GRANT ALL ON public.students           TO service_role;
GRANT ALL ON public.daily_standing_log TO service_role;

GRANT SELECT ON public.buses              TO authenticated;
GRANT SELECT ON public.students           TO authenticated;
GRANT SELECT ON public.daily_standing_log TO authenticated;

-- ==============================================================================
-- 8. RELOAD SCHEMA CACHE
-- Signals Supabase PostgREST to immediately refresh its schema cache.
-- ==============================================================================
NOTIFY pgrst, 'reload schema';

