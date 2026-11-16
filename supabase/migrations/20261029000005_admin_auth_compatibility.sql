-- Keep legacy active administrator profiles authorized without putting them
-- through the student/faculty registration approval workflow.
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
      AND is_active IS TRUE
      AND (
        LOWER(status) = 'approved'
        OR (
          LOWER(role) IN ('admin', 'administrator')
          AND LOWER(status) = 'active'
        )
      )
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
    AND is_active IS TRUE
    AND (
      LOWER(status) = 'approved'
      OR (
        LOWER(role) IN ('admin', 'administrator')
        AND LOWER(status) = 'active'
      )
    )
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
      AND is_active IS TRUE
      AND LOWER(status) IN ('approved', 'active')
  );
$$;

-- Resolve a legacy admin username to its email only; authorization still
-- comes exclusively from the UUID-linked public.users profile after sign-in.
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

  SELECT NULLIF(data->>'email', '') INTO found_email
  FROM public.app_data
  WHERE collection_name = 'administrators'
    AND (
      LOWER(item_id) = LOWER(clean_id)
      OR LOWER(COALESCE(data->>'username', '')) = LOWER(clean_id)
      OR LOWER(COALESCE(data->>'email', '')) = LOWER(clean_id)
    )
  LIMIT 1;

  IF found_email IS NOT NULL THEN
    RETURN jsonb_build_object('found', true, 'email', LOWER(found_email), 'role', 'administrator');
  END IF;

  RETURN jsonb_build_object('found', true, 'email', LOWER(clean_id) || '@srit.ac.in', 'role', 'unknown');
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_login_identifier(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(TEXT) TO anon, authenticated;
