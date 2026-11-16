import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  const authorization = request.headers.get('Authorization');
  const token = authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return jsonResponse(401, { error: 'Administrator authentication is required' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('[ensure-student-auth-user] Required Supabase secrets are not configured');
    return jsonResponse(500, { error: 'Student account verification is not configured on the server' });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
    if (callerError || !callerData.user) {
      return jsonResponse(401, { error: 'Administrator session is invalid or expired' });
    }

    const { data: adminProfile, error: adminError } = await serviceClient
      .from('users')
      .select('role, status, is_active')
      .eq('id', callerData.user.id)
      .maybeSingle();
    if (adminError) throw adminError;
    if (!adminProfile ||
        !['admin', 'administrator'].includes(String(adminProfile.role).toLowerCase()) ||
        !['approved', 'active'].includes(String(adminProfile.status).toLowerCase()) ||
        adminProfile.is_active !== true) {
      return jsonResponse(403, { error: 'Only an active administrator may approve students' });
    }

    const body = await request.json().catch(() => null);
    const rollNo = String(body?.rollNo || '').trim().toUpperCase();
    if (!rollNo) return jsonResponse(400, { error: 'A student roll number is required' });

    const { data: student, error: studentError } = await serviceClient
      .from('students')
      .select('*')
      .ilike('roll_no', rollNo)
      .maybeSingle();
    if (studentError) throw studentError;
    if (!student) return jsonResponse(404, { error: `Student registration ${rollNo} was not found` });
    if (!['pending', 'pending_approval', 'approved', 'active'].includes(String(student.status || '').toLowerCase())) {
      return jsonResponse(409, { error: `Student registration ${rollNo} is not awaiting approval` });
    }

    const email = String(student.email || '').trim().toLowerCase();
    if (!email) return jsonResponse(409, { error: 'The student registration has no email address' });

    let authUser = null;
    let created = false;
    if (student.user_id) {
      const { data, error } = await serviceClient.auth.admin.getUserById(String(student.user_id));
      if (!error && data.user && String(data.user.email || '').toLowerCase() === email) {
        authUser = data.user;
      } else if (error && error.status !== 404) {
        throw error;
      }
    }

    let { data: linkedProfile, error: profileError } = await serviceClient
      .from('users')
      .select('id, email, role')
      .ilike('roll_no', rollNo)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!linkedProfile) {
      const { data, error } = await serviceClient
        .from('users')
        .select('id, email, role')
        .ilike('email', email)
        .maybeSingle();
      if (error) throw error;
      linkedProfile = data;
    }

    if (authUser && linkedProfile && linkedProfile.id !== authUser.id) {
      return jsonResponse(409, { error: 'The registration and Auth account reference different application users' });
    }

    if (linkedProfile) {
      if (String(linkedProfile.role).toLowerCase() !== 'student' ||
          String(linkedProfile.email).toLowerCase() !== email) {
        return jsonResponse(409, { error: 'The linked account does not match this student registration' });
      }
      if (!authUser) {
        const { data, error } = await serviceClient.auth.admin.getUserById(linkedProfile.id);
        if (!error && data.user && String(data.user.email || '').toLowerCase() === email) {
          authUser = data.user;
        } else if (error && error.status !== 404) {
          throw error;
        }
      }
    }

    if (!authUser) {
      for (let page = 1; ; page += 1) {
        const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        authUser = data.users.find((user) => String(user.email || '').toLowerCase() === email) || null;
        if (authUser || !data.nextPage) break;
      }
    }

    if (!authUser) {
      const userMetadata = {
        role: 'student',
        roll_no: rollNo,
        full_name: String(student.full_name || student.name || rollNo),
        programme: student.programme || null,
        department: student.department || null,
        branch: student.branch || null,
        academic_year: student.academic_year || null,
        year: student.year || null,
        semester: student.semester || null,
        section: student.section || null,
        batch_id: student.batch_id || null
      };
      const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(email, {
        data: userMetadata
      });
      if (error) throw error;
      if (!data.user) throw new Error('Supabase Auth did not return the invited student account');
      authUser = data.user;
      created = true;
    }

    const { data: authProfile, error: authProfileError } = await serviceClient
      .from('users')
      .select('id, email, role')
      .eq('id', authUser.id)
      .maybeSingle();
    if (authProfileError) throw authProfileError;
    if (authProfile && (
      String(authProfile.email).toLowerCase() !== email ||
      String(authProfile.role).toLowerCase() !== 'student'
    )) {
      return jsonResponse(409, { error: 'The existing Auth account is linked to a different application profile' });
    }

    if (!authProfile) {
      const { error } = await serviceClient.from('users').insert({
        id: authUser.id,
        email,
        username: rollNo.toLowerCase(),
        role: 'student',
        full_name: String(student.full_name || student.name || rollNo),
        roll_no: rollNo,
        department: student.department || student.branch || null,
        status: 'pending',
        is_active: false
      });
      if (error) throw error;
    }

    const { error: linkError } = await serviceClient
      .from('students')
      .update({ user_id: authUser.id })
      .ilike('roll_no', rollNo);
    if (linkError) throw linkError;

    return jsonResponse(200, { userId: authUser.id, created });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unexpected account verification error';
    console.error('[ensure-student-auth-user] Student Auth verification failed', {
      name: error instanceof Error ? error.name : 'UnknownError'
    });
    return jsonResponse(500, { error: detail });
  }
});
