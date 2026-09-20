const { supabaseAdmin, isConfigured } = require('../config/supabase');
const { validateRegistrationInput } = require('../utils/validation');

/**
 * Service to register a new Staff member.
 * Strictly controlled server-side: forces role = 'staff' and approval_status = 'pending'.
 */
async function registerStaff({ fullName, email, password, confirmPassword }) {
  if (!isConfigured || !supabaseAdmin) {
    const error = new Error('Supabase configuration is not completed in .env. Please configure your project credentials.');
    error.status = 503;
    throw error;
  }

  // 1. Validate input
  const validation = validateRegistrationInput({ fullName, email, password, confirmPassword });
  if (!validation.isValid) {
    const error = new Error(validation.errors.join(' '));
    error.status = 400;
    throw error;
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanFullName = fullName.trim();

  // 2. Check if email already exists in admin_profiles or staff_profiles
  const [adminCheck, staffCheck] = await Promise.all([
    supabaseAdmin.from('admin_profiles').select('id').eq('email', cleanEmail).maybeSingle(),
    supabaseAdmin.from('staff_profiles').select('id').eq('email', cleanEmail).maybeSingle()
  ]);

  if (adminCheck.data || staffCheck.data) {
    const error = new Error('An account with this email address already exists.');
    error.status = 409;
    throw error;
  }

  // 3. Create user in Supabase Auth via Admin API
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: cleanEmail,
    password: password,
    email_confirm: true, // Mark confirmed so they do not get blocked by email confirmation, but blocked by approval_status
    user_metadata: {
      full_name: cleanFullName,
      role: 'staff'
    }
  });

  if (authError || !authData?.user) {
    const error = new Error(authError?.message || 'Failed to create user authentication record.');
    error.status = authError?.status || 400;
    throw error;
  }

  const newUserId = authData.user.id;

  // 4. Create the Staff profile record in public.staff_profiles
  const { data: profileData, error: profileError } = await supabaseAdmin
    .from('staff_profiles')
    .insert([
      {
        id: newUserId,
        full_name: cleanFullName,
        email: cleanEmail,
        role: 'staff',
        approval_status: 'pending',
        is_active: true
      }
    ])
    .select('id, full_name, email, role, approval_status, is_active, created_at')
    .single();

  if (profileError) {
    // Rollback auth user creation if profile insert fails
    await supabaseAdmin.auth.admin.deleteUser(newUserId).catch((delErr) => {
      console.error('Failed to rollback orphaned auth user:', delErr);
    });

    const error = new Error('Failed to initialize staff application profile. ' + (profileError.message || ''));
    error.status = 500;
    throw error;
  }

  return {
    id: profileData.id,
    fullName: profileData.full_name,
    email: profileData.email,
    role: profileData.role,
    approvalStatus: profileData.approval_status,
    isActive: profileData.is_active,
    createdAt: profileData.created_at
  };
}

module.exports = {
  registerStaff
};
