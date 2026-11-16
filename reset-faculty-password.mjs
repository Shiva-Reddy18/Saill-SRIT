
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const newPassword = process.env.NEW_PASSWORD;

const facultyUserId = 'ad6246da-d1d0-473d-9777-f18c9a499700';

async function resetFacultyPassword() {
  if (!supabaseUrl || !serviceRoleKey || !newPassword) {
    console.error('Missing required environment variables.');
    process.exitCode = 1;
    return;
  }

  if (newPassword.length < 8) {
    console.error('Password must contain at least 8 characters.');
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  const { data, error } =
    await supabase.auth.admin.updateUserById(
      facultyUserId,
      {
        password: newPassword
      }
    );

  if (error) {
    console.error('Password update failed:', error.message);
    process.exitCode = 1;
    return;
  }

  console.log('Password updated successfully!');
  console.log('Faculty account:', data.user.email);
  console.log('Auth User ID:', data.user.id);
}

resetFacultyPassword().catch((error) => {
  console.error('Unexpected error:', error.message);
  process.exitCode = 1;
});
