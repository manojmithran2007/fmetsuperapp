/**
 * COLLEGE BUS MANAGEMENT PLATFORM - AUTHENTICATION SERVICE
 * Integrates client-side Supabase Auth and backend profile verification
 */

const Auth = {
  client: null,
  cachedSession: null,
  cachedProfile: null,

  /**
   * Initialize Supabase Auth client if credentials and CDN library are available
   */
  init() {
    if (this.client) return this.client;

    if (window.supabase && window.APP_CONFIG.isConfigured()) {
      try {
        this.client = window.supabase.createClient(
          window.APP_CONFIG.SUPABASE_URL,
          window.APP_CONFIG.SUPABASE_ANON_KEY,
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          }
        );
      } catch (err) {
        console.error('Failed to initialize Supabase client:', err);
      }
    }
    return this.client;
  },

  /**
   * Return active access token if available
   */
  getAccessToken() {
    // If Supabase client has session stored in local storage
    if (this.cachedSession?.access_token) {
      return this.cachedSession.access_token;
    }

    // Attempt to read from localStorage fallback
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        try {
          const parsed = JSON.parse(localStorage.getItem(key));
          if (parsed?.access_token) {
            return parsed.access_token;
          }
        } catch (e) {}
      }
    }
    return null;
  },

  /**
   * Retrieve active session
   */
  async getSession() {
    this.init();
    if (!this.client) return null;
    const { data, error } = await this.client.auth.getSession();
    if (error || !data?.session) {
      this.cachedSession = null;
      return null;
    }
    this.cachedSession = data.session;
    return data.session;
  },

  /**
   * Authenticate user with email and password via Supabase Auth
   */
  async login(email, password) {
    this.init();
    if (!this.client) {
      throw new Error('Supabase client is not configured. Please enter your project keys in client/js/config.js and .env.');
    }

    const { data, error } = await this.client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    });

    if (error) {
      throw new Error(error.message || 'Invalid email or password.');
    }

    this.cachedSession = data.session;

    // Fetch verified profile from backend
    const profileResponse = await window.Api.getMe();
    this.cachedProfile = profileResponse.user;

    return {
      session: data.session,
      user: data.user,
      profile: this.cachedProfile
    };
  },

  /**
   * Sign out current user
   */
  async logout() {
    this.init();
    if (this.client) {
      await this.client.auth.signOut();
    }
    this.cachedSession = null;
    this.cachedProfile = null;
    localStorage.removeItem('app_cached_profile');
    window.location.href = 'login.html';
  },

  /**
   * Fetch current verified profile from backend
   */
  async getVerifiedProfile() {
    const session = await this.getSession();
    if (!session) return null;

    try {
      const res = await window.Api.getMe();
      this.cachedProfile = res.user;
      return res.user;
    } catch (err) {
      console.warn('Failed to fetch verified profile:', err);
      return null;
    }
  }
};

window.Auth = Auth;
