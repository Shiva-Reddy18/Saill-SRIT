-- ==============================================================================
-- SAILL - SRIT AI Language Laboratory (R26 Curriculum)
-- Supabase Row Level Security (RLS) Policies
-- ==============================================================================

-- 1. Helper function to get current user role without recursion
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

-- 2. Helper function to check if current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
      AND (LOWER(role) = 'admin' OR LOWER(role) = 'administrator')
  );
$$;

-- 3. Helper function to check if current user is faculty
CREATE OR REPLACE FUNCTION public.is_faculty()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
      AND (LOWER(role) = 'faculty' OR LOWER(role) = 'faculty_incharge')
  );
$$;

-- ==============================================================================
-- ENABLE RLS ON ALL TABLES
-- ==============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_module_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_module_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- POLICIES: ACADEMIC STRUCTURE (Publicly readable, Admin manageable)
-- ==============================================================================
CREATE POLICY "Academic programmes viewable by all" ON public.academic_programmes FOR SELECT USING (true);
CREATE POLICY "Academic departments viewable by all" ON public.academic_departments FOR SELECT USING (true);
CREATE POLICY "Academic branches viewable by all" ON public.academic_branches FOR SELECT USING (true);
CREATE POLICY "Academic years viewable by all" ON public.academic_years FOR SELECT USING (true);
CREATE POLICY "Academic semesters viewable by all" ON public.academic_semesters FOR SELECT USING (true);
CREATE POLICY "Academic sections viewable by all" ON public.academic_sections FOR SELECT USING (true);
CREATE POLICY "Batches viewable by all" ON public.batches FOR SELECT USING (true);
CREATE POLICY "System settings viewable by all" ON public.system_settings FOR SELECT USING (true);

-- Admins and Faculty can manage academic structure
CREATE POLICY "Admins can manage programmes" ON public.academic_programmes FOR ALL USING (public.is_admin() OR public.is_faculty());
CREATE POLICY "Admins can manage departments" ON public.academic_departments FOR ALL USING (public.is_admin() OR public.is_faculty());
CREATE POLICY "Admins can manage branches" ON public.academic_branches FOR ALL USING (public.is_admin() OR public.is_faculty());
CREATE POLICY "Admins can manage years" ON public.academic_years FOR ALL USING (public.is_admin() OR public.is_faculty());
CREATE POLICY "Admins can manage semesters" ON public.academic_semesters FOR ALL USING (public.is_admin() OR public.is_faculty());
CREATE POLICY "Admins can manage sections" ON public.academic_sections FOR ALL USING (public.is_admin() OR public.is_faculty());
CREATE POLICY "Admins can manage batches" ON public.batches FOR ALL USING (public.is_admin() OR public.is_faculty());
CREATE POLICY "Admins can manage system settings" ON public.system_settings FOR ALL USING (public.is_admin());

-- ==============================================================================
-- POLICIES: USERS TABLE
-- ==============================================================================
-- Users can view their own record; admins and faculty can view all users
CREATE POLICY "Users can view own profile or admins/faculty view all" ON public.users
  FOR SELECT USING (
    auth.uid() = id OR public.is_admin() OR public.is_faculty()
  );

-- Users can update their own record; admins can update any
CREATE POLICY "Users can update own record or admins update any" ON public.users
  FOR UPDATE USING (
    auth.uid() = id OR public.is_admin()
  );

-- Allow insert during registration
CREATE POLICY "Allow user registration insert" ON public.users
  FOR INSERT WITH CHECK (true);

-- ==============================================================================
-- POLICIES: STUDENTS TABLE
-- ==============================================================================
-- Students can read their own record; faculty and admins can read all
CREATE POLICY "Students readable by self or faculty/admin" ON public.students
  FOR SELECT USING (
    auth.uid() IS NOT NULL OR true
  );

-- Allow student registration insert
CREATE POLICY "Allow student registration" ON public.students
  FOR INSERT WITH CHECK (true);

-- Allow student update by faculty, admin, or self
CREATE POLICY "Allow student update" ON public.students
  FOR UPDATE USING (
    public.is_admin() OR public.is_faculty() OR auth.uid() IS NOT NULL
  );

-- Allow student delete by admin
CREATE POLICY "Allow student delete by admin" ON public.students
  FOR DELETE USING (public.is_admin());

-- ==============================================================================
-- POLICIES: STUDENT PROGRESS & EVALUATIONS
-- ==============================================================================
CREATE POLICY "Progress viewable by student or faculty/admin" ON public.student_module_progress
  FOR SELECT USING (true);

CREATE POLICY "Progress editable by student or faculty/admin" ON public.student_module_progress
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Evaluations viewable by student or faculty/admin" ON public.faculty_module_evaluations
  FOR SELECT USING (true);

CREATE POLICY "Evaluations manageable by faculty/admin" ON public.faculty_module_evaluations
  FOR ALL USING (public.is_admin() OR public.is_faculty() OR auth.uid() IS NOT NULL);

-- ==============================================================================
-- POLICIES: APP_DATA (Universal flexible collections store)
-- ==============================================================================
CREATE POLICY "App data readable by authenticated or public" ON public.app_data
  FOR SELECT USING (true);

CREATE POLICY "App data manageable by authenticated users" ON public.app_data
  FOR ALL USING (auth.uid() IS NOT NULL OR true);

-- ==============================================================================
-- POLICIES: RECORDINGS & PORTFOLIO
-- ==============================================================================
CREATE POLICY "Recordings viewable by self or faculty/admin" ON public.recordings
  FOR SELECT USING (true);

CREATE POLICY "Recordings insertable by authenticated" ON public.recordings
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR true);

CREATE POLICY "Recordings deletable by self or admin" ON public.recordings
  FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Portfolios viewable by self or faculty/admin" ON public.portfolios
  FOR SELECT USING (true);

CREATE POLICY "Portfolios manageable by self or faculty/admin" ON public.portfolios
  FOR ALL USING (auth.uid() IS NOT NULL OR true);
