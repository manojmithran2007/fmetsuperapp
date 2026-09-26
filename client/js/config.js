/**
 * COLLEGE BUS MANAGEMENT PLATFORM - CLIENT CONFIGURATION
 * Public client-safe keys only. NEVER put service-role keys here!
 */

window.APP_CONFIG = {
  // Public Supabase configuration
  SUPABASE_URL: 'https://nwcvkrmombpvmjzxhvda.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53Y3Zrcm1vbWJwdm1qenhodmRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzOTIzNzksImV4cCI6MjEwNDk2ODM3OX0.ZHoux4xFkvWjcMDjbdvFvfmGtgCnfszvD7CS5Wi6WQs',

  // Backend API URL (relative for same-origin)
  API_BASE_URL: '/api'
};

// Check if credentials are placeholders
window.APP_CONFIG.isConfigured = function () {
  return Boolean(
    window.APP_CONFIG.SUPABASE_URL &&
    !window.APP_CONFIG.SUPABASE_URL.includes('your-project-id') &&
    window.APP_CONFIG.SUPABASE_ANON_KEY &&
    !window.APP_CONFIG.SUPABASE_ANON_KEY.includes('your-supabase-public-anon-key')
  );
};

// Synchronize public runtime configuration from backend to respect Vercel environment variables
window.APP_CONFIG.syncPromise = (function () {
  if (typeof fetch === 'function' && typeof window !== 'undefined') {
    return fetch(`${window.APP_CONFIG.API_BASE_URL}/config`)
      .then(res => res.ok ? res.json() : null)
      .then(cfg => {
        if (cfg && cfg.supabaseUrl && cfg.supabaseAnonKey) {
          const changed = window.APP_CONFIG.SUPABASE_URL !== cfg.supabaseUrl ||
                          window.APP_CONFIG.SUPABASE_ANON_KEY !== cfg.supabaseAnonKey;
          window.APP_CONFIG.SUPABASE_URL = cfg.supabaseUrl;
          window.APP_CONFIG.SUPABASE_ANON_KEY = cfg.supabaseAnonKey;
          if (changed && window.Auth && typeof window.Auth.init === 'function') {
            window.Auth.init(true);
          }
        }
      })
      .catch(() => {});
  }
  return Promise.resolve();
})();

