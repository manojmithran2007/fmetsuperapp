-- ==============================================================================
-- COLLEGE BUS MANAGEMENT PLATFORM - PHASE 5 DATABASE MIGRATION
-- Direct Entry for Standing / Non-Seated Students
-- Run in Supabase SQL Editor AFTER phase1.sql, phase2.sql, phase3.sql, phase4.sql
-- ==============================================================================

-- 1. Allow student_id to be NULL for directly entered standing students
ALTER TABLE public.daily_standing_log
    ALTER COLUMN student_id DROP NOT NULL;

-- 2. Add student_name and student_roll columns to store directly entered student info
ALTER TABLE public.daily_standing_log
    ADD COLUMN IF NOT EXISTS student_name VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS student_roll VARCHAR(100) NULL;

-- 3. Add performance index on student_roll for fast duplicate lookups
CREATE INDEX IF NOT EXISTS idx_standing_student_roll ON public.daily_standing_log(student_roll);

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
