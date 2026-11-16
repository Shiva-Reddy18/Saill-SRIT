-- Registration approval is authoritative in public.users, keyed by auth.users.id.
-- Existing profile tables remain in place; their statuses are synchronized below.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS roll_no TEXT;

ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

UPDATE public.users u
SET roll_no = s.roll_no
FROM public.students s
WHERE u.roll_no IS NULL
  AND LOWER(u.email) = LOWER(s.email)
  AND LOWER(u.role) IN ('student', 'students');

UPDATE public.users u
SET role = CASE
  WHEN LOWER(u.role) IN ('admin', 'administrator', 'bootstrap_admin') THEN 'administrator'
  WHEN LOWER(u.role) IN ('faculty', 'faculty_incharge', 'incharge') THEN 'faculty_incharge'
  ELSE 'student'
END;

UPDATE public.users u
SET status = CASE
  WHEN LOWER(COALESCE(u.status, '')) IN ('pending', 'pending_approval')
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE UPPER(s.roll_no) = UPPER(u.roll_no)
        AND LOWER(COALESCE(s.status, '')) IN ('pending', 'pending_approval', 'correction_required')
    )
    OR EXISTS (
      SELECT 1 FROM public.app_data a
      WHERE a.collection_name = 'faculty'
        AND UPPER(a.item_id) = UPPER(u.employee_id)
        AND LOWER(COALESCE(a.data->>'status', '')) IN ('pending', 'pending_approval')
    )
    THEN 'pending'
  WHEN LOWER(COALESCE(u.status, '')) = 'rejected'
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE UPPER(s.roll_no) = UPPER(u.roll_no)
        AND LOWER(COALESCE(s.status, '')) = 'rejected'
    )
    THEN 'rejected'
  WHEN LOWER(COALESCE(u.status, '')) IN ('disabled', 'inactive')
    OR u.is_active IS NOT TRUE
    THEN 'disabled'
  WHEN LOWER(u.role) = 'administrator'
    AND LOWER(COALESCE(u.status, '')) IN ('active', 'approved')
    THEN 'approved'
  WHEN LOWER(u.role) = 'student'
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE UPPER(s.roll_no) = UPPER(u.roll_no)
        AND LOWER(COALESCE(s.status, '')) IN ('active', 'approved')
    )
    THEN 'approved'
  WHEN LOWER(u.role) = 'faculty_incharge'
    AND EXISTS (
      SELECT 1 FROM public.app_data a
      WHERE a.collection_name = 'faculty'
        AND UPPER(a.item_id) = UPPER(u.employee_id)
        AND LOWER(COALESCE(a.data->>'status', '')) IN ('active', 'approved')
    )
    THEN 'approved'
  ELSE 'pending'
END;

UPDATE public.users
SET is_active = (status = 'approved'),
    updated_at = CURRENT_TIMESTAMP;

UPDATE public.students s
SET status = CASE u.status
  WHEN 'approved' THEN 'approved'
  WHEN 'rejected' THEN 'rejected'
  WHEN 'disabled' THEN 'disabled'
  ELSE 'pending'
END,
updated_at = CURRENT_TIMESTAMP
FROM public.users u
WHERE UPPER(u.roll_no) = UPPER(s.roll_no);

UPDATE public.student_profiles sp
SET status = u.status,
    updated_at = CURRENT_TIMESTAMP
FROM public.users u
WHERE sp.user_id = u.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_roll_no_unique
  ON public.users (UPPER(roll_no))
  WHERE roll_no IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_approved_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND status = 'approved'
      AND is_active IS TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role
  FROM public.users
  WHERE id = auth.uid()
    AND status = 'approved'
    AND is_active IS TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND LOWER(role) IN ('admin', 'administrator')
      AND status = 'approved'
      AND is_active IS TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_faculty()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND LOWER(role) IN ('faculty', 'faculty_incharge')
      AND status = 'approved'
      AND is_active IS TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_student_owner(target_roll_no TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND LOWER(role) = 'student'
      AND status = 'approved'
      AND is_active IS TRUE
      AND UPPER(roll_no) = UPPER(target_roll_no)
  );
$$;

CREATE OR REPLACE FUNCTION public.resolve_login_identifier(identifier_input TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  clean_id TEXT := TRIM(identifier_input);
  found_email TEXT;
  found_role TEXT;
BEGIN
  IF clean_id IS NULL OR clean_id = '' THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF clean_id LIKE '%@%' THEN
    RETURN jsonb_build_object('found', true, 'email', LOWER(clean_id));
  END IF;

  SELECT email, role INTO found_email, found_role
  FROM public.users
  WHERE LOWER(username) = LOWER(clean_id)
     OR LOWER(employee_id) = LOWER(clean_id)
     OR LOWER(roll_no) = LOWER(clean_id)
  LIMIT 1;

  IF found_email IS NOT NULL THEN
    RETURN jsonb_build_object('found', true, 'email', LOWER(found_email), 'role', found_role);
  END IF;

  SELECT email INTO found_email
  FROM public.students
  WHERE UPPER(roll_no) = UPPER(clean_id)
  LIMIT 1;

  IF found_email IS NOT NULL THEN
    RETURN jsonb_build_object('found', true, 'email', LOWER(found_email), 'role', 'student');
  END IF;

  RETURN jsonb_build_object('found', true, 'email', LOWER(clean_id) || '@srit.ac.in', 'role', 'unknown');
END;
$$;

CREATE OR REPLACE FUNCTION public.registration_identifier_exists(
  identifier_input TEXT,
  identifier_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  clean_id TEXT := TRIM(identifier_input);
  clean_type TEXT := LOWER(TRIM(identifier_type));
BEGIN
  IF clean_id IS NULL OR clean_id = '' OR clean_type NOT IN ('email', 'roll_no', 'employee_id') THEN
    RAISE EXCEPTION 'Invalid registration identifier';
  END IF;

  IF clean_type = 'email' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.users WHERE LOWER(email) = LOWER(clean_id)
      UNION ALL
      SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(clean_id)
    );
  ELSIF clean_type = 'roll_no' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.users WHERE UPPER(roll_no) = UPPER(clean_id)
      UNION ALL
      SELECT 1 FROM public.students WHERE UPPER(roll_no) = UPPER(clean_id)
    );
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.users WHERE UPPER(employee_id) = UPPER(clean_id)
    UNION ALL
    SELECT 1 FROM auth.users WHERE UPPER(raw_user_meta_data->>'employee_id') = UPPER(clean_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registration_identifier_exists(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_identifier_exists(TEXT, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  requested_role TEXT;
  assigned_role TEXT;
  user_full_name TEXT;
  user_username TEXT;
  user_emp_id TEXT;
  user_roll_no TEXT;
  user_dept TEXT;
  user_branch TEXT;
  year_value INTEGER;
  semester_value INTEGER;
BEGIN
  requested_role := LOWER(COALESCE(NEW.raw_user_meta_data->>'role', 'student'));
  assigned_role := CASE
    WHEN requested_role = 'faculty' THEN 'faculty'
    WHEN requested_role IN ('faculty_incharge', 'incharge') THEN 'faculty_incharge'
    ELSE 'student'
  END;
  user_full_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    SPLIT_PART(NEW.email, '@', 1)
  );
  user_roll_no := CASE WHEN assigned_role = 'student'
    THEN NULLIF(UPPER(TRIM(NEW.raw_user_meta_data->>'roll_no')), '')
    ELSE NULL END;
  user_emp_id := CASE WHEN assigned_role IN ('faculty', 'faculty_incharge')
    THEN NULLIF(UPPER(TRIM(NEW.raw_user_meta_data->>'employee_id')), '')
    ELSE NULL END;
  user_username := COALESCE(
    NULLIF(LOWER(TRIM(NEW.raw_user_meta_data->>'username')), ''),
    LOWER(user_roll_no),
    LOWER(user_emp_id)
  );
  user_dept := NEW.raw_user_meta_data->>'department';
  user_branch := COALESCE(NEW.raw_user_meta_data->>'branch', user_dept);

  INSERT INTO public.users (
    id, email, username, role, full_name, employee_id, roll_no, mobile,
    department, designation, is_active, status, created_at, updated_at
  ) VALUES (
    NEW.id,
    LOWER(NEW.email),
    user_username,
    assigned_role,
    user_full_name,
    user_emp_id,
    user_roll_no,
    NEW.raw_user_meta_data->>'mobile',
    user_dept,
    NEW.raw_user_meta_data->>'designation',
    FALSE,
    'pending',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

  IF assigned_role = 'student' AND user_roll_no IS NOT NULL THEN
    year_value := CASE
      WHEN UPPER(COALESCE(NEW.raw_user_meta_data->>'year', '')) LIKE '%IV%' THEN 4
      WHEN UPPER(COALESCE(NEW.raw_user_meta_data->>'year', '')) LIKE '%III%' THEN 3
      WHEN UPPER(COALESCE(NEW.raw_user_meta_data->>'year', '')) LIKE '%II%' THEN 2
      WHEN UPPER(COALESCE(NEW.raw_user_meta_data->>'year', '')) LIKE '%I%' THEN 1
      WHEN COALESCE(NEW.raw_user_meta_data->>'year', '') ~ '^[0-9]+' THEN
        SUBSTRING(NEW.raw_user_meta_data->>'year' FROM '^[0-9]+')::INTEGER
      ELSE 1
    END;
    semester_value := CASE
      WHEN UPPER(COALESCE(NEW.raw_user_meta_data->>'semester', '')) LIKE '%VIII%' THEN 8
      WHEN UPPER(COALESCE(NEW.raw_user_meta_data->>'semester', '')) LIKE '%VII%' THEN 7
      WHEN UPPER(COALESCE(NEW.raw_user_meta_data->>'semester', '')) LIKE '%VI%' THEN 6
      WHEN UPPER(COALESCE(NEW.raw_user_meta_data->>'semester', '')) LIKE '%V%' THEN 5
      WHEN UPPER(COALESCE(NEW.raw_user_meta_data->>'semester', '')) LIKE '%IV%' THEN 4
      WHEN UPPER(COALESCE(NEW.raw_user_meta_data->>'semester', '')) LIKE '%III%' THEN 3
      WHEN UPPER(COALESCE(NEW.raw_user_meta_data->>'semester', '')) LIKE '%II%' THEN 2
      WHEN UPPER(COALESCE(NEW.raw_user_meta_data->>'semester', '')) LIKE '%I%' THEN 1
      WHEN COALESCE(NEW.raw_user_meta_data->>'semester', '') ~ '^[0-9]+' THEN
        SUBSTRING(NEW.raw_user_meta_data->>'semester' FROM '^[0-9]+')::INTEGER
      ELSE 1
    END;

    INSERT INTO public.students (
      roll_no, name, email, branch, department, year, semester, section,
      batch_id, status, created_at, updated_at
    ) VALUES (
      user_roll_no,
      user_full_name,
      LOWER(NEW.email),
      COALESCE(user_branch, 'CSE'),
      COALESCE(user_dept, user_branch, 'CSE'),
      year_value,
      semester_value,
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'section', ''), 'A'),
      NULLIF(NEW.raw_user_meta_data->>'batch_id', ''),
      'pending',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE OR REPLACE FUNCTION public.set_registration_status(
  target_user_id UUID,
  target_status TEXT,
  rejection_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_user public.users%ROWTYPE;
  next_status TEXT := LOWER(TRIM(target_status));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an approved administrator may change registration status'
      USING ERRCODE = '42501';
  END IF;
  IF next_status NOT IN ('approved', 'rejected', 'disabled') THEN
    RAISE EXCEPTION 'Invalid registration status';
  END IF;

  SELECT * INTO target_user
  FROM public.users
  WHERE id = target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration account not found';
  END IF;
  IF LOWER(target_user.role) NOT IN ('student', 'faculty', 'faculty_incharge') THEN
    RAISE EXCEPTION 'Administrator accounts cannot be changed through registration approval';
  END IF;

  UPDATE public.users
  SET status = next_status,
      is_active = (next_status = 'approved'),
      approved_at = CASE WHEN next_status = 'approved' THEN CURRENT_TIMESTAMP ELSE NULL END,
      approved_by = CASE WHEN next_status = 'approved' THEN auth.uid()::TEXT ELSE NULL END,
      rejection_reason = CASE WHEN next_status = 'rejected' THEN rejection_reason ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = target_user_id;

  IF target_user.roll_no IS NOT NULL THEN
    UPDATE public.students
    SET status = next_status, updated_at = CURRENT_TIMESTAMP
    WHERE UPPER(roll_no) = UPPER(target_user.roll_no);
    UPDATE public.student_profiles
    SET status = next_status, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = target_user_id;
    UPDATE public.app_data
    SET data = jsonb_set(data, '{status}', TO_JSONB(next_status), TRUE),
        updated_at = CURRENT_TIMESTAMP
    WHERE collection_name IN ('studentProfiles', 'userRegistrations')
      AND (
        UPPER(item_id) = UPPER(target_user.roll_no)
        OR UPPER(COALESCE(data->>'rollNo', data->>'userID', '')) = UPPER(target_user.roll_no)
      );
  ELSIF target_user.employee_id IS NOT NULL THEN
    UPDATE public.app_data
    SET data = jsonb_set(data, '{status}', TO_JSONB(next_status), TRUE),
        updated_at = CURRENT_TIMESTAMP
    WHERE collection_name IN ('faculty', 'userRegistrations')
      AND (
        UPPER(item_id) = UPPER(target_user.employee_id)
        OR UPPER(COALESCE(data->>'employeeId', data->>'userID', '')) = UPPER(target_user.employee_id)
      );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_registration_status(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_registration_status(UUID, TEXT, TEXT) TO authenticated;

DO $$
DECLARE
  policy_row RECORD;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'users', 'students', 'student_profiles', 'student_module_progress',
        'faculty_module_evaluations', 'app_data', 'recordings', 'portfolios'
      )
  LOOP
    EXECUTE FORMAT('DROP POLICY %I ON %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  END LOOP;
END;
$$;

CREATE POLICY "Users may read own account or admins may read all"
  ON public.users FOR SELECT
  USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "Only approved admins may update user accounts"
  ON public.users FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Approved accounts may read authorized student profiles"
  ON public.students FOR SELECT
  USING (public.is_admin() OR public.is_faculty() OR public.is_student_owner(roll_no));
CREATE POLICY "Approved faculty and admins may update student profiles"
  ON public.students FOR UPDATE
  USING (public.is_admin() OR public.is_faculty())
  WITH CHECK (public.is_admin() OR public.is_faculty());
CREATE POLICY "Only approved admins may delete student profiles"
  ON public.students FOR DELETE
  USING (public.is_admin());

CREATE POLICY "Approved accounts may read authorized student profile mappings"
  ON public.student_profiles FOR SELECT
  USING (
    public.is_admin()
    OR public.is_faculty()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'approved'
        AND u.is_active IS TRUE
        AND UPPER(u.roll_no) = UPPER(student_profiles.roll_number)
    )
  );

CREATE POLICY "Approved users may access application data"
  ON public.app_data FOR SELECT
  USING (
    public.is_admin()
    OR (
      public.is_approved_user()
      AND collection_name NOT IN ('administrators', 'userRegistrations', 'faculty')
      AND (
        collection_name <> 'studentProfiles'
        OR public.is_faculty()
        OR (
          public.is_student_owner(item_id)
          AND public.is_student_owner(COALESCE(data->>'rollNo', data->>'roll_no', item_id))
        )
      )
    )
  );
CREATE POLICY "Approved users may manage application data"
  ON public.app_data FOR ALL
  USING (
    public.is_admin()
    OR (
      public.is_approved_user()
      AND collection_name NOT IN ('administrators', 'userRegistrations', 'faculty')
      AND (
        collection_name <> 'studentProfiles'
        OR public.is_faculty()
        OR (
          public.is_student_owner(item_id)
          AND public.is_student_owner(COALESCE(data->>'rollNo', data->>'roll_no', item_id))
        )
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_approved_user()
      AND collection_name NOT IN ('administrators', 'userRegistrations', 'faculty')
      AND (
        collection_name <> 'studentProfiles'
        OR public.is_faculty()
        OR (
          public.is_student_owner(item_id)
          AND public.is_student_owner(COALESCE(data->>'rollNo', data->>'roll_no', item_id))
        )
      )
    )
  );

CREATE POLICY "Approved users may access authorized student progress"
  ON public.student_module_progress FOR SELECT
  USING (public.is_admin() OR public.is_faculty() OR public.is_student_owner(roll_no));
CREATE POLICY "Approved users may manage authorized student progress"
  ON public.student_module_progress FOR ALL
  USING (public.is_admin() OR public.is_faculty() OR public.is_student_owner(roll_no))
  WITH CHECK (public.is_admin() OR public.is_faculty() OR public.is_student_owner(roll_no));

CREATE POLICY "Approved users may view authorized evaluations"
  ON public.faculty_module_evaluations FOR SELECT
  USING (public.is_admin() OR public.is_faculty() OR public.is_student_owner(student_roll_no));
CREATE POLICY "Only approved faculty and admins may manage evaluations"
  ON public.faculty_module_evaluations FOR ALL
  USING (public.is_admin() OR public.is_faculty())
  WITH CHECK (public.is_admin() OR public.is_faculty());

CREATE POLICY "Approved users may view authorized recordings"
  ON public.recordings FOR SELECT
  USING (public.is_admin() OR public.is_faculty() OR public.is_student_owner(roll_no));
CREATE POLICY "Approved users may add authorized recordings"
  ON public.recordings FOR INSERT
  WITH CHECK (public.is_admin() OR public.is_faculty() OR public.is_student_owner(roll_no));
CREATE POLICY "Approved users may delete authorized recordings"
  ON public.recordings FOR DELETE
  USING (public.is_admin() OR public.is_student_owner(roll_no));

CREATE POLICY "Approved users may view authorized portfolios"
  ON public.portfolios FOR SELECT
  USING (public.is_admin() OR public.is_faculty() OR public.is_student_owner(roll_no));
CREATE POLICY "Approved users may manage authorized portfolios"
  ON public.portfolios FOR ALL
  USING (public.is_admin() OR public.is_faculty() OR public.is_student_owner(roll_no))
  WITH CHECK (public.is_admin() OR public.is_faculty() OR public.is_student_owner(roll_no));
