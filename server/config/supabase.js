const { createClient } = require('@supabase/supabase-js');
const env = require('./env');

let supabaseAdmin = null;
let supabaseClient = null;

if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
  supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

module.exports = {
  supabaseAdmin,
  supabaseClient,
  isConfigured: env.isConfigured
};
