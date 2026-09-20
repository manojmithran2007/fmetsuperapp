-- ==============================================================================
-- COLLEGE BUS MANAGEMENT PLATFORM - PHASE 1 DATABASE MIGRATION
-- Target Environment: PostgreSQL / Supabase
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TABLES DEFINITION

-- ------------------------------------------------------------------------------
-- Table: admin_profiles
-- Represents the single system administrator profile.
-- Strictly tied to auth.users via UUID primary key.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- Table: staff_profiles
-- Represents bus incharge / staff profiles.
-- Stores approval lifecycle: 'pending', 'approved', 'rejected'.
-- Strictly tied to auth.users via UUID primary key.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(20) NOT NULL DEFAULT 'staff' CHECK (role = 'staff'),
    approval_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    approved_at TIMESTAMPTZ NULL,
    approved_by UUID NULL REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_approved_consistency CHECK (
        (approval_status = 'approved' AND approved_at IS NOT NULL) OR
        (approval_status != 'approved')
    )
);

-- 3. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_admin_profiles_email ON public.admin_profiles(email);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_email ON public.staff_profiles(email);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_status ON public.staff_profiles(approval_status);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_active ON public.staff_profiles(is_active);

-- 4. AUTOMATED TIMESTAMP MANAGEMENT
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

DROP TRIGGER IF EXISTS tr_admin_profiles_updated_at ON public.admin_profiles;
CREATE TRIGGER tr_admin_profiles_updated_at
    BEFORE UPDATE ON public.admin_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_staff_profiles_updated_at ON public.staff_profiles;
CREATE TRIGGER tr_staff_profiles_updated_at
    BEFORE UPDATE ON public.staff_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 5. SECURITY HELPER FUNCTIONS (SECURITY DEFINER with strict search_path)

-- Helper: Check if user is an active administrator
CREATE OR REPLACE FUNCTION public.is_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_profiles
        WHERE id = check_user_id
          AND is_active = true
    );
$$;

-- Helper: Check if user is an approved and active staff member
CREATE OR REPLACE FUNCTION public.is_approved_staff(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.staff_profiles
        WHERE id = check_user_id
          AND approval_status = 'approved'
          AND is_active = true
    );
$$;

-- Helper: Retrieve current role ('admin', 'staff', or 'none')
CREATE OR REPLACE FUNCTION public.get_user_role(check_user_id UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = check_user_id AND is_active = true) THEN 'admin'
        WHEN EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = check_user_id AND is_active = true) THEN 'staff'
        ELSE 'none'
    END;
$$;

-- 6. TRIGGER TO PREVENT STAFF PRIVILEGE ESCALATION
-- Ensures staff cannot approve themselves or alter their security-sensitive fields.
--
-- BYPASS LOGIC:
--   - auth.role() = 'service_role'  → Backend Node.js using SUPABASE_SERVICE_ROLE_KEY
--     (auth.role() is Supabase's built-in function; reliably returns 'service_role'
--      for service-role connections from the JS SDK, where auth.uid() is NULL and
--      the request.jwt.claim.role GUC is not set by the JS SDK connection path)
--   - public.is_admin(auth.uid())   → Admin authenticated via normal JWT (future use)
--   - current_user IN (...)         → Direct superuser DB connections
CREATE OR REPLACE FUNCTION public.guard_staff_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_is_service_role BOOLEAN;
BEGIN
    -- Check if caller is an authenticated admin (JWT-based, for RLS-level callers)
    v_is_admin := public.is_admin(auth.uid());

    -- auth.role() is set by Supabase from the JWT 'role' claim.
    -- Returns 'service_role' when the backend uses SUPABASE_SERVICE_ROLE_KEY.
    -- This is the reliable bypass for backend API calls (auth.uid() is NULL for service role).
    v_is_service_role := (auth.role() = 'service_role');

    -- Allow modification only for: backend service role, active admin, or DB superuser
    IF NOT (
        v_is_service_role
        OR v_is_admin
        OR current_user IN ('postgres', 'service_role', 'supabase_admin')
    ) THEN
        IF NEW.role != OLD.role THEN
            RAISE EXCEPTION 'Unauthorized: Cannot modify role.';
        END IF;
        IF NEW.approval_status != OLD.approval_status THEN
            RAISE EXCEPTION 'Unauthorized: Cannot modify approval status.';
        END IF;
        IF NEW.is_active != OLD.is_active THEN
            RAISE EXCEPTION 'Unauthorized: Cannot modify account active status.';
        END IF;
        IF NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
            RAISE EXCEPTION 'Unauthorized: Cannot modify approval timestamp.';
        END IF;
        IF NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
            RAISE EXCEPTION 'Unauthorized: Cannot modify approving authority.';
        END IF;
    END IF;

    -- If approved, auto-populate approved_at and approved_by if not provided
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        IF NEW.approved_at IS NULL THEN
            NEW.approved_at := NOW();
        END IF;
        -- approved_by is set explicitly by the backend controller (req.profile.id).
        -- Only auto-fill from auth.uid() if not already set and caller is an RLS-level admin.
        IF NEW.approved_by IS NULL AND auth.uid() IS NOT NULL AND v_is_admin THEN
            NEW.approved_by := auth.uid();
        END IF;
    END IF;

    -- If rejected, always reset approval metadata fields
    IF NEW.approval_status = 'rejected' THEN
        NEW.approved_at := NULL;
        NEW.approved_by := NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_staff_privilege_escalation_guard ON public.staff_profiles;
CREATE TRIGGER tr_staff_privilege_escalation_guard
    BEFORE UPDATE ON public.staff_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_staff_privilege_escalation();

-- 7. ROW LEVEL SECURITY (RLS) POLICIES

-- Enable RLS on both profile tables
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Policies on admin_profiles
-- ------------------------------------------------------------------------------
-- Admins can view their own profile
DROP POLICY IF EXISTS admin_profiles_select_own ON public.admin_profiles;
CREATE POLICY admin_profiles_select_own
    ON public.admin_profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Admins can update their own profile details
DROP POLICY IF EXISTS admin_profiles_update_own ON public.admin_profiles;
CREATE POLICY admin_profiles_update_own
    ON public.admin_profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------------------------
-- Policies on staff_profiles
-- ------------------------------------------------------------------------------
-- Admins have full read access to all staff profiles
DROP POLICY IF EXISTS staff_profiles_admin_select ON public.staff_profiles;
CREATE POLICY staff_profiles_admin_select
    ON public.staff_profiles
    FOR SELECT
    TO authenticated
    USING (public.is_admin(auth.uid()));

-- Admins have full update access (approving/rejecting staff, updating records)
DROP POLICY IF EXISTS staff_profiles_admin_update ON public.staff_profiles;
CREATE POLICY staff_profiles_admin_update
    ON public.staff_profiles
    FOR UPDATE
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- Staff members can read their own profile (whether pending, approved, or rejected)
DROP POLICY IF EXISTS staff_profiles_select_own ON public.staff_profiles;
CREATE POLICY staff_profiles_select_own
    ON public.staff_profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Staff members can update their own non-security profile fields (e.g. name)
DROP POLICY IF EXISTS staff_profiles_update_own ON public.staff_profiles;
CREATE POLICY staff_profiles_update_own
    ON public.staff_profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Service Role Key (Backend API) bypasses RLS automatically by Supabase design.
-- Explicit grants:
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, UPDATE ON public.admin_profiles TO authenticated;
GRANT SELECT, UPDATE ON public.staff_profiles TO authenticated;
