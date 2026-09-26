const dotenv = require('dotenv');
const path = require('path');

// Load .env from process.cwd() and fallback to explicit project root path
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  PORT: process.env.PORT || 5000,
  SUPABASE_URL: (process.env.SUPABASE_URL || '').trim(),
  SUPABASE_ANON_KEY: (process.env.SUPABASE_ANON_KEY || '').trim(),
  SUPABASE_SERVICE_ROLE_KEY: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  NODE_ENV: (process.env.NODE_ENV || 'development').trim()
};

// Check if configuration is using placeholder values
const isConfigured = Boolean(
  env.SUPABASE_URL &&
  !env.SUPABASE_URL.includes('your-project-id') &&
  env.SUPABASE_ANON_KEY &&
  !env.SUPABASE_ANON_KEY.includes('your-supabase-public-anon-key') &&
  env.SUPABASE_SERVICE_ROLE_KEY &&
  !env.SUPABASE_SERVICE_ROLE_KEY.includes('your-supabase-service-role-key')
);

module.exports = {
  ...env,
  isConfigured
};
