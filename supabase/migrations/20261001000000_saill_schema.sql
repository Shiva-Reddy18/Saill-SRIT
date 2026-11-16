-- ==============================================================================
-- SAILL - SRIT AI Language Laboratory (R26 Curriculum)
-- Complete Supabase Schema Definition
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. USERS & PROFILES TABLE (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'student', -- 'student' | 'faculty' | 'faculty_incharge' | 'admin' | 'administrator'
  full_name TEXT NOT NULL,
  employee_id TEXT,
  mobile TEXT,
  department TEXT,
  designation TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  status TEXT DEFAULT 'active', -- 'pending' | 'active' | 'rejected'
  rejection_reason TEXT,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON public.users(employee_id);

-- 2. ACADEMIC HIERARCHY TABLES
CREATE TABLE IF NOT EXISTS public.academic_programmes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.academic_departments (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.academic_branches (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  programme_id TEXT,
  department_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.academic_years (
  id TEXT PRIMARY KEY,
  year_number INT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.academic_semesters (
  id TEXT PRIMARY KEY,
  semester_number INT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  year_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.academic_sections (
  id TEXT PRIMARY KEY,
  section_name TEXT NOT NULL,
  branch_id TEXT,
  semester_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. BATCHES TABLE
CREATE TABLE IF NOT EXISTS public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  branch_id TEXT,
  semester_id TEXT,
  section_id TEXT,
  assigned_faculty_incharge_id TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_batches_faculty ON public.batches(assigned_faculty_incharge_id);

-- 4. STUDENTS TABLE
CREATE TABLE IF NOT EXISTS public.students (
  roll_no TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  branch TEXT NOT NULL,
  department TEXT NOT NULL,
  year INT NOT NULL,
  semester INT NOT NULL,
  section TEXT NOT NULL,
  batch_id TEXT,
  assigned_faculty_id TEXT,
  assigned_faculty_name TEXT,
  attendance_pct NUMERIC(5,2) DEFAULT 0,
  rubric_score NUMERIC(5,2) DEFAULT 0,
  internal_marks NUMERIC(5,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE' | 'PENDING' | 'REJECTED' | 'CORRECTION_REQUIRED'
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_students_email ON public.students(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_students_batch ON public.students(batch_id);
CREATE INDEX IF NOT EXISTS idx_students_branch_section ON public.students(branch, section);
CREATE INDEX IF NOT EXISTS idx_students_faculty ON public.students(assigned_faculty_id);

-- 5. STUDENT PROFILES (Relational mapping)
CREATE TABLE IF NOT EXISTS public.student_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  roll_number TEXT NOT NULL UNIQUE,
  batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_student_profiles_roll ON public.student_profiles(UPPER(roll_number));
CREATE INDEX IF NOT EXISTS idx_student_profiles_batch ON public.student_profiles(batch_id);

-- 6. FACULTY ASSIGNMENTS
CREATE TABLE IF NOT EXISTS public.faculty_assignments (
  id TEXT PRIMARY KEY,
  faculty_id TEXT NOT NULL,
  faculty_name TEXT NOT NULL,
  faculty_department TEXT,
  faculty_email TEXT,
  academic_year INT NOT NULL,
  semester INT NOT NULL,
  programme TEXT NOT NULL,
  branch TEXT NOT NULL,
  section TEXT NOT NULL,
  batch_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_faculty_assignments_faculty ON public.faculty_assignments(faculty_id);
CREATE INDEX IF NOT EXISTS idx_faculty_assignments_section ON public.faculty_assignments(branch, section);

-- 7. STUDENT MODULE PROGRESS
CREATE TABLE IF NOT EXISTS public.student_module_progress (
  id TEXT PRIMARY KEY,
  roll_no TEXT NOT NULL,
  module_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS', -- 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'COMPLETED'
  time_spent INT NOT NULL DEFAULT 0,
  score NUMERIC(5,2),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(roll_no, module_id)
);

CREATE INDEX IF NOT EXISTS idx_student_progress_roll ON public.student_module_progress(roll_no);
CREATE INDEX IF NOT EXISTS idx_student_progress_module ON public.student_module_progress(module_id);

-- 8. FACULTY MODULE EVALUATIONS
CREATE TABLE IF NOT EXISTS public.faculty_module_evaluations (
  id TEXT PRIMARY KEY,
  student_roll_no TEXT NOT NULL,
  student_name TEXT NOT NULL,
  module_id TEXT NOT NULL,
  module_title TEXT NOT NULL,
  batch_id TEXT,
  batch_name TEXT,
  faculty_user_id TEXT,
  faculty_id TEXT NOT NULL,
  faculty_name TEXT NOT NULL,
  faculty_department TEXT,
  score NUMERIC(5,2) NOT NULL,
  remarks TEXT,
  evaluated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_roll_no, module_id)
);

CREATE INDEX IF NOT EXISTS idx_faculty_eval_student ON public.faculty_module_evaluations(student_roll_no);
CREATE INDEX IF NOT EXISTS idx_faculty_eval_faculty ON public.faculty_module_evaluations(faculty_id);
CREATE INDEX IF NOT EXISTS idx_faculty_eval_module ON public.faculty_module_evaluations(module_id);
CREATE INDEX IF NOT EXISTS idx_faculty_eval_batch ON public.faculty_module_evaluations(batch_id);

-- 9. UNIVERSAL APP DATA (Flexible document collections store)
CREATE TABLE IF NOT EXISTS public.app_data (
  collection_name TEXT NOT NULL,
  item_id TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (collection_name, item_id)
);

CREATE INDEX IF NOT EXISTS idx_app_data_collection ON public.app_data(collection_name);

-- 10. SYSTEM SETTINGS
CREATE TABLE IF NOT EXISTS public.system_settings (
  id TEXT PRIMARY KEY DEFAULT 'institution_settings',
  settings JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 11. RECORDINGS
CREATE TABLE IF NOT EXISTS public.recordings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  roll_no TEXT NOT NULL,
  module_id TEXT NOT NULL,
  target_word TEXT,
  audio_url TEXT,
  file_path TEXT,
  score NUMERIC(5,2),
  grade TEXT,
  duration INT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recordings_roll ON public.recordings(roll_no);

-- 12. PORTFOLIOS
CREATE TABLE IF NOT EXISTS public.portfolios (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  roll_no TEXT NOT NULL,
  module_id TEXT,
  item_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  file_url TEXT,
  score NUMERIC(5,2),
  faculty_feedback TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_portfolios_roll ON public.portfolios(roll_no);

-- ==============================================================================
-- HELPER FUNCTIONS & TRIGGERS
-- ==============================================================================

-- Secure RPC function to resolve a username, roll number, or employee ID to an email for Supabase Auth
CREATE OR REPLACE FUNCTION public.resolve_login_identifier(identifier_input TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_id TEXT;
  found_email TEXT;
  found_role TEXT;
BEGIN
  clean_id := TRIM(identifier_input);
  IF clean_id IS NULL OR clean_id = '' THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- 1. Check if input is already an email
  IF clean_id LIKE '%@%' THEN
    RETURN jsonb_build_object('found', true, 'email', LOWER(clean_id));
  END IF;

  -- 2. Check public.users for username, employee_id, or email
  SELECT email, role INTO found_email, found_role
  FROM public.users
  WHERE LOWER(username) = LOWER(clean_id)
     OR LOWER(employee_id) = LOWER(clean_id)
     OR LOWER(email) = LOWER(clean_id)
  LIMIT 1;

  IF found_email IS NOT NULL THEN
    RETURN jsonb_build_object('found', true, 'email', LOWER(found_email), 'role', found_role);
  END IF;

  -- 3. Check public.students for roll_no
  SELECT email INTO found_email
  FROM public.students
  WHERE UPPER(roll_no) = UPPER(clean_id)
  LIMIT 1;

  IF found_email IS NOT NULL THEN
    RETURN jsonb_build_object('found', true, 'email', LOWER(found_email), 'role', 'student');
  END IF;

  -- 4. Fallback: format standard institutional email
  RETURN jsonb_build_object('found', true, 'email', LOWER(clean_id) || '@srit.ac.in', 'role', 'unknown');
END;
$$;

-- Trigger to sync auth.users inserts into public.users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_role TEXT;
  user_full_name TEXT;
  user_username TEXT;
  user_emp_id TEXT;
  user_roll_no TEXT;
  user_dept TEXT;
BEGIN
  assigned_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');
  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  user_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  user_emp_id := NEW.raw_user_meta_data->>'employee_id';
  user_roll_no := NEW.raw_user_meta_data->>'roll_no';
  user_dept := NEW.raw_user_meta_data->>'department';

  INSERT INTO public.users (
    id, email, username, role, full_name, employee_id, department, is_active, status, created_at, updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    user_username,
    LOWER(assigned_role),
    user_full_name,
    user_emp_id,
    user_dept,
    TRUE,
    'active',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
