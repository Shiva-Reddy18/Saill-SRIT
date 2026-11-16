ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS programme TEXT,
  ADD COLUMN IF NOT EXISTS academic_year TEXT,
  ADD COLUMN IF NOT EXISTS mapping_status TEXT NOT NULL DEFAULT 'unmapped',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.students'::regclass
      AND conname = 'students_user_id_fkey'
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$$;

UPDATE public.students
SET full_name = COALESCE(NULLIF(full_name, ''), name)
WHERE full_name IS NULL OR full_name = '';

UPDATE public.students s
SET user_id = u.id,
    full_name = COALESCE(NULLIF(s.full_name, ''), u.full_name),
    programme = COALESCE(NULLIF(s.programme, ''), 'B.Tech')
FROM public.users u
WHERE s.user_id IS NULL
  AND UPPER(u.roll_no) = UPPER(s.roll_no)
  AND LOWER(u.role) = 'student';

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
      WHEN COALESCE(NEW.raw_user_meta_data->>'year', '') ~ '^[0-9]+'
        THEN SUBSTRING(NEW.raw_user_meta_data->>'year' FROM '^[0-9]+')::INTEGER
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
      WHEN COALESCE(NEW.raw_user_meta_data->>'semester', '') ~ '^[0-9]+'
        THEN SUBSTRING(NEW.raw_user_meta_data->>'semester' FROM '^[0-9]+')::INTEGER
      ELSE 1
    END;

    INSERT INTO public.students (
      user_id, roll_no, name, full_name, email, programme, branch, department,
      year, semester, section, academic_year, batch_id, mapping_status,
      is_active, status, created_at, updated_at
    ) VALUES (
      NEW.id,
      user_roll_no,
      user_full_name,
      user_full_name,
      LOWER(NEW.email),
      NULLIF(NEW.raw_user_meta_data->>'programme', ''),
      COALESCE(user_branch, 'CSE'),
      COALESCE(user_dept, user_branch, 'CSE'),
      year_value,
      semester_value,
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'section', ''), 'A'),
      NULLIF(NEW.raw_user_meta_data->>'academic_year', ''),
      NULLIF(NEW.raw_user_meta_data->>'batch_id', ''),
      'unmapped',
      FALSE,
      'pending',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (roll_no) DO UPDATE
    SET user_id = COALESCE(public.students.user_id, EXCLUDED.user_id),
        full_name = COALESCE(NULLIF(public.students.full_name, ''), EXCLUDED.full_name),
        programme = COALESCE(NULLIF(public.students.programme, ''), EXCLUDED.programme),
        academic_year = COALESCE(NULLIF(public.students.academic_year, ''), EXCLUDED.academic_year),
        updated_at = CURRENT_TIMESTAMP
    WHERE public.students.user_id IS NULL
       OR public.students.user_id = EXCLUDED.user_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_registration_semester(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE REGEXP_REPLACE(LOWER(TRIM(COALESCE(value, ''))), '[^a-z0-9]', '', 'g')
    WHEN '1' THEN '1'
    WHEN 'i' THEN '1'
    WHEN 'semester1' THEN '1'
    WHEN 'semesteri' THEN '1'
    WHEN 'sem1' THEN '1'
    WHEN 'semi' THEN '1'
    WHEN '2' THEN '2'
    WHEN 'ii' THEN '2'
    WHEN 'semester2' THEN '2'
    WHEN 'semesterii' THEN '2'
    WHEN 'sem2' THEN '2'
    WHEN 'semii' THEN '2'
    WHEN '3' THEN '3'
    WHEN 'iii' THEN '3'
    WHEN 'semester3' THEN '3'
    WHEN 'semesteriii' THEN '3'
    WHEN 'sem3' THEN '3'
    WHEN 'semiii' THEN '3'
    WHEN '4' THEN '4'
    WHEN 'iv' THEN '4'
    WHEN 'semester4' THEN '4'
    WHEN 'semesteriv' THEN '4'
    WHEN 'sem4' THEN '4'
    WHEN 'semiv' THEN '4'
    WHEN '5' THEN '5'
    WHEN 'v' THEN '5'
    WHEN 'semesterv' THEN '5'
    WHEN 'sem5' THEN '5'
    WHEN 'semv' THEN '5'
    WHEN '6' THEN '6'
    WHEN 'vi' THEN '6'
    WHEN 'semester6' THEN '6'
    WHEN 'semestervi' THEN '6'
    WHEN 'sem6' THEN '6'
    WHEN 'semvi' THEN '6'
    WHEN '7' THEN '7'
    WHEN 'vii' THEN '7'
    WHEN 'semester7' THEN '7'
    WHEN 'semestervii' THEN '7'
    WHEN 'sem7' THEN '7'
    WHEN 'semvii' THEN '7'
    WHEN '8' THEN '8'
    WHEN 'viii' THEN '8'
    WHEN 'semester8' THEN '8'
    WHEN 'semesterviii' THEN '8'
    WHEN 'sem8' THEN '8'
    WHEN 'semviii' THEN '8'
    ELSE REGEXP_REPLACE(LOWER(TRIM(COALESCE(value, ''))), '[^a-z0-9]', '', 'g')
  END;
$$;

CREATE OR REPLACE FUNCTION public.approve_student_registration(target_roll_no TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  clean_roll TEXT := UPPER(TRIM(target_roll_no));
  student_row public.students%ROWTYPE;
  user_row public.users%ROWTYPE;
  resolved_user_id UUID;
  matched_batch JSONB;
  matched_batch_id TEXT;
  matched_academic_year TEXT;
  matched_department TEXT;
  matching_batch_count INTEGER;
  normalized_branch TEXT;
  normalized_semester TEXT;
  normalized_section TEXT;
  normalized_programme TEXT;
  normalized_academic_year TEXT;
  current_status TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an approved administrator may approve student registrations'
      USING ERRCODE = '42501';
  END IF;
  IF clean_roll IS NULL OR clean_roll = '' THEN
    RAISE EXCEPTION 'A student roll number is required';
  END IF;

  SELECT * INTO student_row
  FROM public.students
  WHERE UPPER(roll_no) = clean_roll
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student registration % was not found', clean_roll;
  END IF;

  current_status := LOWER(COALESCE(student_row.status, ''));
  IF current_status NOT IN ('pending', 'pending_approval', 'approved', 'active') THEN
    RAISE EXCEPTION 'Student registration % is %, not awaiting approval', clean_roll, current_status;
  END IF;

  resolved_user_id := student_row.user_id;
  IF resolved_user_id IS NULL THEN
    SELECT id INTO resolved_user_id
    FROM public.users
    WHERE LOWER(role) = 'student'
      AND (UPPER(roll_no) = clean_roll OR LOWER(email) = LOWER(student_row.email))
    LIMIT 1;
  END IF;
  IF resolved_user_id IS NULL THEN
    RAISE EXCEPTION 'No Supabase Auth account is associated with student %', clean_roll;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = resolved_user_id
      AND LOWER(email) = LOWER(student_row.email)
  ) THEN
    RAISE EXCEPTION 'The linked Supabase Auth account for student % is missing or has a different email', clean_roll;
  END IF;

  SELECT * INTO user_row
  FROM public.users
  WHERE id = resolved_user_id
  FOR UPDATE;
  IF NOT FOUND OR LOWER(user_row.role) <> 'student' THEN
    RAISE EXCEPTION 'The linked public account for student % is missing or is not a student account', clean_roll;
  END IF;
  IF LOWER(user_row.email) <> LOWER(student_row.email) OR
     (user_row.roll_no IS NOT NULL AND UPPER(user_row.roll_no) <> clean_roll) THEN
    RAISE EXCEPTION 'The linked account details do not match student registration %', clean_roll;
  END IF;

  normalized_branch := REGEXP_REPLACE(LOWER(TRIM(COALESCE(student_row.branch, ''))), '[^a-z0-9]', '', 'g');
  normalized_semester := public.normalize_registration_semester(student_row.semester::TEXT);
  normalized_section := REGEXP_REPLACE(LOWER(TRIM(COALESCE(student_row.section, ''))), '[^a-z0-9]', '', 'g');
  normalized_programme := REGEXP_REPLACE(LOWER(TRIM(COALESCE(student_row.programme, ''))), '[^a-z0-9]', '', 'g');
  normalized_academic_year := REGEXP_REPLACE(LOWER(TRIM(COALESCE(student_row.academic_year, ''))), '[^a-z0-9]', '', 'g');

  IF normalized_branch = '' OR normalized_semester = '' OR
     normalized_section = '' OR normalized_programme = '' THEN
    RAISE EXCEPTION 'Student % is missing required programme, branch, semester, or section information', clean_roll;
  END IF;

  SELECT COUNT(*), JSONB_AGG(a.data)->0
  INTO matching_batch_count, matched_batch
  FROM public.app_data a
  WHERE a.collection_name = 'batches'
    AND LOWER(COALESCE(a.data->>'status', 'active')) = 'active'
    AND REGEXP_REPLACE(LOWER(TRIM(COALESCE(a.data->>'programme', a.data->>'program', ''))), '[^a-z0-9]', '', 'g')
        IN ('', normalized_programme)
    AND REGEXP_REPLACE(LOWER(TRIM(COALESCE(a.data->>'section', ''))), '[^a-z0-9]', '', 'g')
        = normalized_section
    AND public.normalize_registration_semester(a.data->>'semester') = normalized_semester
    AND (
      REGEXP_REPLACE(LOWER(TRIM(COALESCE(a.data->>'branchCode', a.data->>'branch_code', ''))), '[^a-z0-9]', '', 'g')
        = normalized_branch
      OR REGEXP_REPLACE(LOWER(TRIM(COALESCE(a.data->>'branch', a.data->>'department', ''))), '[^a-z0-9]', '', 'g')
        = normalized_branch
      OR REGEXP_REPLACE(LOWER(TRIM(SPLIT_PART(COALESCE(a.data->>'batchCode', a.data->>'batch_code', ''), '-', 1))), '[^a-z0-9]', '', 'g')
        = normalized_branch
    )
    AND (
      normalized_academic_year = ''
      OR REGEXP_REPLACE(LOWER(TRIM(COALESCE(a.data->>'academicYear', a.data->>'academic_year', ''))), '[^a-z0-9]', '', 'g')
        = normalized_academic_year
    )
    AND NULLIF(TRIM(COALESCE(a.data->>'academicYear', a.data->>'academic_year', '')), '') IS NOT NULL;

  IF matching_batch_count = 0 THEN
    SELECT COUNT(*),
           JSONB_AGG(JSONB_BUILD_OBJECT(
             'batchId', b.id::TEXT,
             'programme', COALESCE(ap.code, ap.name, ''),
             'department', COALESCE(ad.name, ab.name, ''),
             'branch', COALESCE(ab.name, b.branch_id),
             'branchCode', COALESCE(ab.code, b.branch_id),
             'batchCode', CONCAT(COALESCE(ab.code, b.branch_id), '-', COALESCE(asec.section_name, b.section_id)),
             'semester', COALESCE(sem.label, b.semester_id),
             'section', COALESCE(
               NULLIF(SPLIT_PART(asec.section_name, '-', ARRAY_LENGTH(STRING_TO_ARRAY(asec.section_name, '-'), 1)), ''),
               asec.section_name,
               b.section_id
             ),
             'academicYear', ay.label,
             'status', 'ACTIVE'
           ))->0
    INTO matching_batch_count, matched_batch
    FROM public.batches b
    LEFT JOIN public.academic_branches ab
      ON LOWER(ab.id) = LOWER(b.branch_id) OR LOWER(ab.code) = LOWER(b.branch_id)
    LEFT JOIN public.academic_departments ad
      ON LOWER(ad.id) = LOWER(ab.department_id) OR LOWER(ad.code) = LOWER(ab.department_id)
    LEFT JOIN public.academic_programmes ap
      ON LOWER(ap.id) = LOWER(ab.programme_id) OR LOWER(ap.code) = LOWER(ab.programme_id)
    LEFT JOIN public.academic_semesters sem
      ON LOWER(sem.id) = LOWER(b.semester_id)
    LEFT JOIN public.academic_years ay
      ON LOWER(ay.id) = LOWER(sem.year_id)
    LEFT JOIN public.academic_sections asec
      ON LOWER(asec.id) = LOWER(b.section_id)
    WHERE public.normalize_registration_semester(COALESCE(sem.label, b.semester_id)) = normalized_semester
      AND REGEXP_REPLACE(LOWER(TRIM(COALESCE(
        NULLIF(SPLIT_PART(asec.section_name, '-', ARRAY_LENGTH(STRING_TO_ARRAY(asec.section_name, '-'), 1)), ''),
        asec.section_name,
        b.section_id
      ))), '[^a-z0-9]', '', 'g') = normalized_section
      AND (
        REGEXP_REPLACE(LOWER(TRIM(COALESCE(ab.code, ''))), '[^a-z0-9]', '', 'g') = normalized_branch
        OR REGEXP_REPLACE(LOWER(TRIM(COALESCE(ab.name, ''))), '[^a-z0-9]', '', 'g') = normalized_branch
      )
      AND (
        COALESCE(ap.code, ap.name, '') = ''
        OR REGEXP_REPLACE(LOWER(TRIM(COALESCE(ap.code, ap.name, ''))), '[^a-z0-9]', '', 'g')
          = normalized_programme
      )
      AND NULLIF(TRIM(COALESCE(ay.label, '')), '') IS NOT NULL
      AND (
        normalized_academic_year = ''
        OR REGEXP_REPLACE(LOWER(TRIM(ay.label)), '[^a-z0-9]', '', 'g') = normalized_academic_year
      );
  END IF;

  IF matching_batch_count = 0 THEN
    RAISE EXCEPTION 'No active official batch matches student % programme, branch, semester, section, and academic year', clean_roll;
  ELSIF matching_batch_count > 1 THEN
    RAISE EXCEPTION 'More than one active official batch matches student %; resolve the academic mapping before approval', clean_roll;
  END IF;

  matched_batch_id := NULLIF(TRIM(COALESCE(matched_batch->>'batchId', matched_batch->>'batch_id', matched_batch->>'id')), '');
  matched_academic_year := NULLIF(TRIM(COALESCE(matched_batch->>'academicYear', matched_batch->>'academic_year')), '');
  matched_department := NULLIF(TRIM(COALESCE(matched_batch->>'department', matched_batch->>'branch')), '');
  IF matched_batch_id IS NULL OR matched_academic_year IS NULL OR matched_department IS NULL THEN
    RAISE EXCEPTION 'The matching official batch is missing its batch ID, academic year, or department';
  END IF;

  IF current_status IN ('approved', 'active') THEN
    IF student_row.mapping_status = 'mapped' AND student_row.is_active IS TRUE AND
       student_row.batch_id = matched_batch_id AND
       NULLIF(student_row.academic_year, '') = matched_academic_year THEN
      RETURN JSONB_BUILD_OBJECT(
        'success', TRUE,
        'status', 'approved',
        'mapping_status', 'mapped',
        'is_active', TRUE,
        'user_id', resolved_user_id,
        'batch_id', matched_batch_id,
        'academic_year', matched_academic_year
      );
    END IF;
    RAISE EXCEPTION 'Student % is already approved but its academic mapping is incomplete or inconsistent', clean_roll;
  END IF;

  UPDATE public.users
  SET roll_no = clean_roll,
      status = 'approved',
      is_active = TRUE,
      approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP),
      approved_by = auth.uid()::TEXT,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = resolved_user_id;

  UPDATE public.students
  SET user_id = resolved_user_id,
      full_name = COALESCE(NULLIF(full_name, ''), name),
      programme = COALESCE(NULLIF(programme, ''), matched_batch->>'programme', matched_batch->>'program'),
      department = matched_department,
      academic_year = matched_academic_year,
      batch_id = matched_batch_id,
      mapping_status = 'mapped',
      is_active = TRUE,
      status = 'approved',
      updated_at = CURRENT_TIMESTAMP
  WHERE UPPER(roll_no) = clean_roll;

  UPDATE public.student_profiles
  SET status = 'approved',
      updated_at = CURRENT_TIMESTAMP
  WHERE UPPER(roll_number) = clean_roll;

  UPDATE public.app_data
  SET data = JSONB_SET(
        JSONB_SET(
          JSONB_SET(data, '{status}', '"approved"'::JSONB, TRUE),
          '{mappingStatus}', '"MAPPED"'::JSONB, TRUE
        ),
        '{batchId}', TO_JSONB(matched_batch_id), TRUE
      ),
      updated_at = CURRENT_TIMESTAMP
  WHERE collection_name = 'studentProfiles'
    AND (UPPER(item_id) = clean_roll OR UPPER(COALESCE(data->>'rollNo', data->>'roll_no', '')) = clean_roll);

  RETURN JSONB_BUILD_OBJECT(
    'success', TRUE,
    'status', 'approved',
    'mapping_status', 'mapped',
    'is_active', TRUE,
    'user_id', resolved_user_id,
    'batch_id', matched_batch_id,
    'academic_year', matched_academic_year
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_student_registration(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_student_registration(TEXT) TO authenticated;
