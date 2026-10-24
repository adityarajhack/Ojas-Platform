/**
 * Ojas Unified Auth & Application Bridge
 * Handles real backend authentication, session sync, "Apply Now" login gatekeeping,
 * interactive modal rendering, and API communication.
 */
(function (window, document) {
  'use strict';

  const TOKEN_KEY = 'ojas_token';
  const USER_KEY = 'ojas_user';
  const REDIRECT_KEY = 'ojas_redirect_after_login';

  const JanasetuAuth = {
    // Current token & user
    getToken() {
      return localStorage.getItem(TOKEN_KEY) || localStorage.getItem('janasetu_token') || localStorage.getItem('gov_panel_token') || null;
    },

    getUser() {
      try {
        const u = localStorage.getItem(USER_KEY) || localStorage.getItem('janasetu_user') || localStorage.getItem('gov_panel_user');
        return u ? JSON.parse(u) : null;
      } catch (e) {
        return null;
      }
    },

    setSession(token, user) {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem('janasetu_token', token);
        localStorage.setItem('gov_panel_token', token);
      }
      if (user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        localStorage.setItem('janasetu_user', JSON.stringify(user));
        localStorage.setItem('gov_panel_user', JSON.stringify(user));
      }
      this.syncNavbar();
    },

    clearSession() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem('janasetu_token');
      localStorage.removeItem('janasetu_user');
      localStorage.removeItem('gov_panel_token');
      localStorage.removeItem('gov_panel_user');
      localStorage.removeItem(REDIRECT_KEY);
      localStorage.removeItem('janasetu_redirect_after_login');
      this.syncNavbar();
    },

    isLoggedIn() {
      return !!this.getToken() && !!this.getUser();
    },

    isCitizen() {
      const u = this.getUser();
      return u && u.role === 'CITIZEN';
    },

    isStaff() {
      const u = this.getUser();
      return u && u.role && u.role !== 'CITIZEN';
    },

    // HTTP Helper
    async request(endpoint, options = {}) {
      const token = this.getToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };
      if (token && !headers['Authorization']) {
        headers['Authorization'] = 'Bearer ' + token;
      }

      const res = await fetch(endpoint, {
        ...options,
        headers
      });

      const contentType = res.headers.get('content-type') || '';
      let data = {};
      if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
        data = await res.json().catch(() => ({}));
      } else {
        data = { text: await res.text().catch(() => '') };
      }

      if (!res.ok) {
        const message = data.detail || data.message || data.title || 'Request failed with status ' + res.status;
        const err = new Error(message);
        err.data = data;
        err.status = res.status;
        throw err;
      }

      return data;
    },

    // Login API
    async login(username, password) {
      const res = await this.request('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      if (res.accessToken && res.user) {
        this.setSession(res.accessToken, res.user);
      }
      return res;
    },

    // Citizen Signup API
    async signup(payload) {
      const res = await this.request('/v1/citizen/signup', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res.accessToken && res.user) {
        this.setSession(res.accessToken, res.user);
      }
      return res;
    },

    // Logout
    logout() {
      this.clearSession();
      if (window.location.pathname.includes('apply.html') || window.location.pathname.includes('citizen.html')) {
        window.location.href = '/index.html';
      } else {
        window.location.reload();
      }
    },

    // Gatekeeper for Apply Now
    requireCitizen(intendedUrl) {
      if (this.isLoggedIn() && this.isCitizen()) {
        if (intendedUrl) window.location.href = intendedUrl;
        return true;
      }
      // If not logged in or not a citizen, trigger modal
      sessionStorage.setItem(REDIRECT_KEY, intendedUrl || window.location.href);
      this.showModal({
        mode: 'login',
        role: 'CITIZEN',
        message: 'Welfare scheme applications require citizen authentication to verify lifelong records and household eligibility. Please sign in or create an account to proceed.'
      });
      return false;
    },

    currentRole: 'CITIZEN',

    // Show Auth Modal
    showModal(opts = {}) {
      let modal = document.getElementById('janasetuAuthModal');
      if (!modal) {
        this.injectModal();
        modal = document.getElementById('janasetuAuthModal');
      }

      const alertBox = document.getElementById('janasetuAuthAlert');
      if (alertBox) {
        if (opts.message) {
          alertBox.textContent = opts.message;
          alertBox.classList.remove('hidden');
        } else {
          alertBox.classList.add('hidden');
        }
      }

      if (opts.mode === 'signup') {
        this.switchTab('signup');
      } else {
        this.switchTab('login');
        if (opts.role && opts.role !== 'CITIZEN') {
          this.setLoginRole('OFFICER');
        } else {
          this.setLoginRole('CITIZEN');
        }
      }

      if (modal) {
        modal.classList.remove('hidden');
      }
    },

    hideModal() {
      const modal = document.getElementById('janasetuAuthModal');
      if (modal) {
        modal.classList.add('hidden');
      }
    },

    switchTab(tab) {
      const tabLogin = document.getElementById('tabBtnLogin');
      const tabSignup = document.getElementById('tabBtnSignup');

      const viewLogin = document.getElementById('authViewLogin');
      const viewSignup = document.getElementById('authViewSignup');

      [tabLogin, tabSignup].forEach(b => {
        if (b) b.classList.remove('active');
      });
      [viewLogin, viewSignup].forEach(v => {
        if (v) {
          v.classList.add('hidden');
          v.style.display = 'none';
        }
      });

      if (tab === 'signup') {
        if (tabSignup) tabSignup.classList.add('active');
        if (viewSignup) {
          viewSignup.classList.remove('hidden');
          viewSignup.style.display = 'block';
        }
      } else {
        if (tabLogin) tabLogin.classList.add('active');
        if (viewLogin) {
          viewLogin.classList.remove('hidden');
          viewLogin.style.display = 'block';
        }
      }
    },

    setLoginRole(role) {
      this.currentRole = role;
      const btnCitizen = document.getElementById('roleBtnCitizen');
      const btnOfficer = document.getElementById('roleBtnOfficer');
      const pill = document.getElementById('authDemoPill');
      const pillTitle = document.getElementById('demoPillTitle');
      const pillDesc = document.getElementById('demoPillDesc');
      const submitBtn = document.getElementById('btnLoginSubmit');
      const submitLbl = document.getElementById('btnSubmitLabel');
      const lblUser = document.getElementById('lblUsername');
      const userInp = document.getElementById('loginUsername');
      const offAccounts = document.getElementById('officerQuickAccounts');
      const citAccounts = document.getElementById('citizenQuickAccounts');

      if (role === 'OFFICER') {
        if (btnCitizen) {
          btnCitizen.style.background = 'transparent';
          btnCitizen.style.color = '#64748b';
          btnCitizen.style.boxShadow = 'none';
        }
        if (btnOfficer) {
          btnOfficer.style.background = '#0f172a';
          btnOfficer.style.color = '#ffffff';
          btnOfficer.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
        }
        if (pill) pill.className = 'auth-demo-pill officer';
        if (submitBtn) {
          submitBtn.className = 'auth-btn-submit officer';
        }
        if (submitLbl) submitLbl.textContent = 'Sign In to Officer Console';
        if (lblUser) lblUser.textContent = 'Officer SSO Username / NIC ID';
        if (userInp) userInp.placeholder = 'e.g. sysadmin_rao or officer_sharma';
        if (offAccounts) offAccounts.style.display = 'block';
        if (citAccounts) citAccounts.style.display = 'none';

        // Keep current selected officer pill or default to officer_sharma
        const activeBtn = document.querySelector('#officerPillButtons .auth-role-pill.active');
        const defaultUser = activeBtn ? activeBtn.getAttribute('data-user') : 'officer_sharma';
        this.fillDemo(defaultUser);
      } else {
        if (btnOfficer) {
          btnOfficer.style.background = 'transparent';
          btnOfficer.style.color = '#64748b';
          btnOfficer.style.boxShadow = 'none';
        }
        if (btnCitizen) {
          btnCitizen.style.background = '#ffffff';
          btnCitizen.style.color = '#ea580c';
          btnCitizen.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)';
        }
        if (pill) pill.className = 'auth-demo-pill';
        if (submitBtn) {
          submitBtn.className = 'auth-btn-submit';
        }
        if (submitLbl) submitLbl.textContent = 'Sign In as Citizen & Continue';
        if (lblUser) lblUser.textContent = 'Citizen Username / Registered Email';
        if (userInp) userInp.placeholder = 'e.g. citizen_demo or email';
        if (offAccounts) offAccounts.style.display = 'none';
        if (citAccounts) citAccounts.style.display = 'block';
        this.fillDemo('citizen_demo');
      }
    },

    fillCurrentDemo() {
      const activeBtn = document.querySelector('.auth-role-pill.active');
      const currentUser = activeBtn ? activeBtn.getAttribute('data-user') : (this.currentRole === 'OFFICER' ? 'officer_sharma' : 'citizen_demo');
      this.fillDemo(currentUser);
    },

    // Inject Auth Modal into DOM
    injectModal() {
      if (document.getElementById('janasetuAuthModal')) return;

      const div = document.createElement('div');
      div.id = 'janasetuAuthModal';
      div.className = 'hidden';
      div.innerHTML = `
        <div class="auth-card">
          <!-- Tricolor Top Bar -->
          <div class="auth-top-strip"></div>
          
          <!-- Header -->
          <div class="auth-header">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="display:inline-block;width:24px;height:16px;border-radius:2px;box-shadow:0 1px 2px rgba(0,0,0,0.2);border:1px solid #cbd5e1;background:linear-gradient(180deg, #FF9933 33%, #FFFFFF 33% 66%, #138808 66%);"></span>
              <div>
                <h3>Ojas Secure Access</h3>
                <p>Government of India · Unified Digital Platform</p>
              </div>
            </div>
            <button type="button" onclick="JanasetuAuth.hideModal()" class="auth-close-btn" aria-label="Close">✕</button>
          </div>

          <!-- Alert banner (optional message) -->
          <div id="janasetuAuthAlert" class="auth-alert hidden" style="margin: 1rem 1.5rem 0 1.5rem;"></div>
          <div id="janasetuAuthError" class="auth-error hidden" style="margin: 1rem 1.5rem 0 1.5rem;"></div>

          <!-- Tabs -->
          <div class="auth-tabs">
            <button id="tabBtnLogin" onclick="JanasetuAuth.switchTab('login')" class="auth-tab active">Sign In</button>
            <button id="tabBtnSignup" onclick="JanasetuAuth.switchTab('signup')" class="auth-tab">New Citizen Registration</button>
          </div>

          <!-- Content Body -->
          <div class="auth-body">
            
            <!-- VIEW 1: UNIFIED CITIZEN / OFFICER LOGIN -->
            <div id="authViewLogin">
              <!-- Role Selector Bar -->
              <div style="margin-bottom: 1.15rem;">
                <label style="display: block; font-size: 0.72rem; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.4rem;">
                  Login As:
                </label>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #f1f5f9; padding: 4px; border-radius: 12px; border: 1px solid #cbd5e1;">
                  <button type="button" id="roleBtnCitizen" onclick="JanasetuAuth.setLoginRole('CITIZEN')" style="padding: 9px 12px; border-radius: 9px; font-weight: 800; font-size: 0.82rem; border: none; cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; gap: 8px; background: #ffffff; color: #ea580c; box-shadow: 0 2px 6px rgba(0,0,0,0.08);">
                    <span>👤</span> <span>Citizen</span>
                  </button>
                  <button type="button" id="roleBtnOfficer" onclick="JanasetuAuth.setLoginRole('OFFICER')" style="padding: 9px 12px; border-radius: 9px; font-weight: 800; font-size: 0.82rem; border: none; cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; gap: 8px; background: transparent; color: #64748b;">
                    <span>🛡️</span> <span>Officer</span>
                  </button>
                </div>
              </div>

              <!-- Quick demo pill (Dynamic) -->
              <div id="authDemoPill" class="auth-demo-pill">
                <div>
                  <p id="demoPillTitle" class="title">Demo Citizen Account</p>
                  <p id="demoPillDesc" class="desc">Rajesh Sharma (CENTRAL District, BPL)</p>
                </div>
                <button type="button" onclick="JanasetuAuth.fillCurrentDemo()" class="auth-demo-btn">Auto Fill</button>
              </div>

              <form onsubmit="JanasetuAuth.submitLogin(event, 'loginUsername', 'loginPassword')">
                <div class="auth-form-group">
                  <label id="lblUsername" for="loginUsername">Citizen Username / Registered Email</label>
                  <input id="loginUsername" type="text" required placeholder="e.g. citizen_demo or email" autocomplete="username"/>
                </div>
                <div class="auth-form-group">
                  <label for="loginPassword">Password</label>
                  <input id="loginPassword" type="password" required placeholder="••••••••" autocomplete="current-password"/>
                </div>

                <div>
                  <button type="submit" id="btnLoginSubmit" class="auth-btn-submit">
                    <span id="btnSubmitLabel">Sign In as Citizen &amp; Continue</span>
                  </button>
                </div>
              </form>

              <!-- Officer Quick Account Switcher Grid (Visible when Role = OFFICER) -->
              <div id="officerQuickAccounts" style="display:none; margin-top: 1.15rem; padding-top: 0.85rem; border-top: 1px solid #e2e8f0;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 0.5rem;">
                  <span style="font-size: 0.72rem; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">
                    ⚡ All Officer &amp; Admin Accounts:
                  </span>
                  <span style="font-size: 0.68rem; font-weight: 700; color: #d97706;">One-Click Auto Fill</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;" id="officerPillButtons">
                  <!-- Super Admin -->
                  <button type="button" onclick="JanasetuAuth.fillDemo('sysadmin_rao')" class="auth-role-pill" data-user="sysadmin_rao" title="Full Platform Operations &amp; Root Security">
                    <span class="role-icon">👑</span>
                    <span class="role-text">
                      <strong>Super Admin</strong>
                      <small>sysadmin_rao</small>
                    </span>
                  </button>
                  <!-- Senior Officer -->
                  <button type="button" onclick="JanasetuAuth.fillDemo('senior_officer_patel')" class="auth-role-pill" data-user="senior_officer_patel" title="Appeals, Sanctions &amp; SLA Overrides">
                    <span class="role-icon">🏛️</span>
                    <span class="role-text">
                      <strong>Senior Officer</strong>
                      <small>senior_officer_patel</small>
                    </span>
                  </button>
                  <!-- Officer Sharma (Step 1) -->
                  <button type="button" onclick="JanasetuAuth.fillDemo('officer_sharma')" class="auth-role-pill active" data-user="officer_sharma" title="Primary Verification Officer - Step 1">
                    <span class="role-icon">🛡️</span>
                    <span class="role-text">
                      <strong>Officer Sharma</strong>
                      <small>officer_sharma (Step 1)</small>
                    </span>
                  </button>
                  <!-- Officer Verma (Four-Eyes Step 2) -->
                  <button type="button" onclick="JanasetuAuth.fillDemo('officer_verma')" class="auth-role-pill" data-user="officer_verma" title="Dual Officer Four-Eyes Verification - Step 2">
                    <span class="role-icon">🛡️</span>
                    <span class="role-text">
                      <strong>Officer Verma</strong>
                      <small>officer_verma (Step 2)</small>
                    </span>
                  </button>
                  <!-- Dept Admin -->
                  <button type="button" onclick="JanasetuAuth.fillDemo('dept_admin_singh')" class="auth-role-pill" data-user="dept_admin_singh" title="Ministry of Rural Development Administrator">
                    <span class="role-icon">🏢</span>
                    <span class="role-text">
                      <strong>Dept Admin</strong>
                      <small>dept_admin_singh</small>
                    </span>
                  </button>
                  <!-- Auditor -->
                  <button type="button" onclick="JanasetuAuth.fillDemo('auditor_gupta')" class="auth-role-pill" data-user="auditor_gupta" title="Merkle Trees, Tamper Proofs &amp; Break-Glass Review">
                    <span class="role-icon">🔍</span>
                    <span class="role-text">
                      <strong>Auditor</strong>
                      <small>auditor_gupta</small>
                    </span>
                  </button>
                  <!-- Field Worker -->
                  <button type="button" onclick="JanasetuAuth.fillDemo('field_worker_ram')" class="auth-role-pill" data-user="field_worker_ram" title="Gram Sevak Field Verification">
                    <span class="role-icon">📱</span>
                    <span class="role-text">
                      <strong>Field Worker</strong>
                      <small>field_worker_ram</small>
                    </span>
                  </button>
                  <!-- Intake Clerk -->
                  <button type="button" onclick="JanasetuAuth.fillDemo('clerk_demo')" class="auth-role-pill" data-user="clerk_demo" title="Counter Application Entry">
                    <span class="role-icon">📝</span>
                    <span class="role-text">
                      <strong>Intake Clerk</strong>
                      <small>clerk_demo</small>
                    </span>
                  </button>
                </div>
              </div>

              <!-- Citizen Quick Account Switcher (Visible when Role = CITIZEN) -->
              <div id="citizenQuickAccounts" style="margin-top: 1.15rem; padding-top: 0.85rem; border-top: 1px solid #e2e8f0;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 0.5rem;">
                  <span style="font-size: 0.72rem; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">
                    ⚡ Demo Citizen Account:
                  </span>
                  <span style="font-size: 0.68rem; font-weight: 700; color: #ea580c;">One-Click Select</span>
                </div>
                <button type="button" onclick="JanasetuAuth.fillDemo('citizen_demo')" class="auth-role-pill active" data-user="citizen_demo" style="width: 100%; text-align: left;">
                  <span class="role-icon">👤</span>
                  <span class="role-text">
                    <strong>Rajesh &amp; Suresh Sharma</strong>
                    <small>citizen_demo · CENTRAL District · BPL Household Priority</small>
                  </span>
                </button>
              </div>
            </div>

            <!-- VIEW 2: CITIZEN SIGNUP -->
            <div id="authViewSignup" style="display:none;">
              <p style="font-size:0.75rem;color:#64748b;margin-bottom:1rem;font-weight:500;">Create your lifelong digital citizen record linked to public welfare registers.</p>
              
              <form onsubmit="JanasetuAuth.submitSignup(event)">
                <div class="grid-2">
                  <div class="auth-form-group">
                    <label>First Name *</label>
                    <input id="regFirstName" type="text" required placeholder="Ramesh"/>
                  </div>
                  <div class="auth-form-group">
                    <label>Last Name *</label>
                    <input id="regLastName" type="text" required placeholder="Sharma"/>
                  </div>
                  <div class="auth-form-group">
                    <label>Date of Birth *</label>
                    <input id="regDob" type="date" required value="1990-01-15"/>
                  </div>
                  <div class="auth-form-group">
                    <label>Gender *</label>
                    <select id="regGender">
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div class="auth-form-group col-span-2">
                    <label>Residential Address *</label>
                    <input id="regAddress" type="text" required placeholder="House No 12, Rampur Khas"/>
                  </div>
                  <div class="auth-form-group">
                    <label>District *</label>
                    <select id="regDistrict">
                      <option value="CENTRAL" selected>Central</option>
                      <option value="NORTH">North</option>
                      <option value="SOUTH">South</option>
                      <option value="EAST">East</option>
                      <option value="WEST">West</option>
                      <option value="AYODHYA">Ayodhya</option>
                    </select>
                  </div>
                  <div class="auth-form-group">
                    <label>Pincode *</label>
                    <input id="regPincode" type="text" required placeholder="110001"/>
                  </div>
                  <div class="auth-form-group">
                    <label>Phone Number *</label>
                    <input id="regPhone" type="tel" required placeholder="9811002233"/>
                  </div>
                  <div class="auth-form-group">
                    <label>Username *</label>
                    <input id="regUsername" type="text" required placeholder="ramesh_sharma"/>
                  </div>
                  <div class="auth-form-group col-span-2">
                    <label>Email Address *</label>
                    <input id="regEmail" type="email" required placeholder="ramesh@gmail.com"/>
                  </div>
                  <div class="auth-form-group col-span-2">
                    <label>Password (min 8 chars) *</label>
                    <input id="regPassword" type="password" required minlength="8" value="Demo@Password123"/>
                  </div>
                </div>

                <div>
                  <button type="submit" id="btnSignupSubmit" class="auth-btn-submit signup">
                    <span>Create Citizen Record &amp; Login</span>
                  </button>
                </div>
              </form>
            </div>

          </div>
        </div>
      `;

      document.body.appendChild(div);
    },

    fillDemo(username) {
      const u = document.getElementById('loginUsername');
      const p = document.getElementById('loginPassword');
      const pill = document.getElementById('authDemoPill');
      const pillTitle = document.getElementById('demoPillTitle');
      const pillDesc = document.getElementById('demoPillDesc');

      const accounts = {
        sysadmin_rao: {
          role: 'OFFICER',
          title: 'Demo Super Admin / System Admin',
          desc: 'sysadmin_rao (Root Operations, User Toggles & Tamper Scrutiny)'
        },
        senior_officer_patel: {
          role: 'OFFICER',
          title: 'Demo Senior Review Officer',
          desc: 'senior_officer_patel (Appeals, Sanctions & SLA Overrides)'
        },
        officer_sharma: {
          role: 'OFFICER',
          title: 'Demo Verification Officer 1',
          desc: 'officer_sharma (CENTRAL District Verifier · Step 1)'
        },
        officer_verma: {
          role: 'OFFICER',
          title: 'Demo Verification Officer 2 (Four-Eyes)',
          desc: 'officer_verma (Dual Officer Four-Eyes Verification · Step 2)'
        },
        dept_admin_singh: {
          role: 'OFFICER',
          title: 'Demo Department Administrator',
          desc: 'dept_admin_singh (Ministry of Rural Development Admin)'
        },
        auditor_gupta: {
          role: 'OFFICER',
          title: 'Demo Security & Compliance Auditor',
          desc: 'auditor_gupta (Tamper Proofs, Merkle Verification & Audit Logs)'
        },
        field_worker_ram: {
          role: 'OFFICER',
          title: 'Demo Gram Sevak Field Worker',
          desc: 'field_worker_ram (Geo-tagged Photo Verification & Dwelling Inspection)'
        },
        clerk_demo: {
          role: 'OFFICER',
          title: 'Demo Counter Intake Clerk',
          desc: 'clerk_demo (Counter Application Entry & Document Scanning)'
        },
        citizen_demo: {
          role: 'CITIZEN',
          title: 'Demo Citizen Account',
          desc: 'Rajesh & Suresh Sharma (CENTRAL District, BPL Household)'
        }
      };

      const acc = accounts[username] || accounts.officer_sharma;
      if (u) u.value = username;
      if (p) p.value = 'Demo@Password123';
      if (pillTitle) pillTitle.textContent = acc.title;
      if (pillDesc) pillDesc.textContent = acc.desc;

      // Update active highlight on all role buttons
      document.querySelectorAll('.auth-role-pill').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-user') === username);
      });
    },

    showError(msg) {
      const el = document.getElementById('janasetuAuthError');
      if (el) {
        el.textContent = msg;
        el.classList.remove('hidden');
      } else {
        alert(msg);
      }
    },

    clearError() {
      const el = document.getElementById('janasetuAuthError');
      if (el) el.classList.add('hidden');
    },

    async submitLogin(e, userInpId, passInpId) {
      if (e) e.preventDefault();
      this.clearError();

      const username = (document.getElementById(userInpId)?.value || '').trim();
      const password = (document.getElementById(passInpId)?.value || '').trim();
      if (!username || !password) {
        this.showError('Please enter both username and password.');
        return;
      }

      const submitBtn = document.getElementById('btnLoginSubmit');
      const originalText = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.innerHTML = '<span>Verifying credentials...</span>';
        submitBtn.setAttribute('disabled', 'true');
      }

      try {
        const res = await this.login(username, password);
        this.hideModal();

        // Check if redirect intended
        const redirect = sessionStorage.getItem(REDIRECT_KEY);
        sessionStorage.removeItem(REDIRECT_KEY);

        if (redirect && redirect.length > 1) {
          window.location.href = redirect;
        } else if (res.user.role !== 'CITIZEN') {
          window.location.href = '/official.html';
        } else {
          window.location.href = '/citizen.html';
        }
      } catch (err) {
        this.showError(err.message || 'Login failed. Please verify credentials.');
      } finally {
        if (submitBtn) {
          submitBtn.innerHTML = originalText;
          submitBtn.removeAttribute('disabled');
        }
      }
    },

    async submitSignup(e) {
      if (e) e.preventDefault();
      this.clearError();

      const payload = {
        first_name: document.getElementById('regFirstName')?.value.trim(),
        last_name: document.getElementById('regLastName')?.value.trim(),
        date_of_birth: document.getElementById('regDob')?.value,
        gender: document.getElementById('regGender')?.value,
        address_line: document.getElementById('regAddress')?.value.trim(),
        district: document.getElementById('regDistrict')?.value,
        pincode: document.getElementById('regPincode')?.value.trim(),
        phone: document.getElementById('regPhone')?.value.trim(),
        username: document.getElementById('regUsername')?.value.trim(),
        email: document.getElementById('regEmail')?.value.trim(),
        password: document.getElementById('regPassword')?.value,
      };

      const btn = document.getElementById('btnSignupSubmit');
      const orig = btn ? btn.innerHTML : '';
      if (btn) {
        btn.innerHTML = '<span>Creating lifelong record...</span>';
        btn.setAttribute('disabled', 'true');
      }

      try {
        const res = await this.signup(payload);
        this.hideModal();

        const redirect = sessionStorage.getItem(REDIRECT_KEY);
        sessionStorage.removeItem(REDIRECT_KEY);

        if (redirect) {
          window.location.href = redirect;
        } else {
          window.location.href = '/citizen.html';
        }
      } catch (err) {
        this.showError(err.message || 'Registration failed.');
      } finally {
        if (btn) {
          btn.innerHTML = orig;
          btn.removeAttribute('disabled');
        }
      }
    },

    // Synchronize Navbar across pages
    syncNavbar() {
      const user = this.getUser();
      const loginWraps = document.querySelectorAll('.aicte-dropdown-wrap');
      
      // Find the login dropdown wrapper
      loginWraps.forEach(wrap => {
        const btn = wrap.querySelector('button[onclick*="loginDropdown"]');
        if (!btn) return;

        if (user && user.username) {
          // Logged in state
          const isCitizen = user.role === 'CITIZEN';
          btn.innerHTML = `
            <span class="inline-flex size-5 items-center justify-center rounded-full ${isCitizen ? 'bg-orange-500' : 'bg-slate-800'} text-white text-[11px] font-bold">
              ${user.username.charAt(0).toUpperCase()}
            </span>
            <span class="font-bold text-xs text-slate-800">${user.username}</span>
            <span class="text-[9px] px-1.5 py-0.2 rounded-full ${isCitizen ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'} font-extrabold">${user.role}</span>
            <svg class="size-3 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
          `;

          const card = wrap.querySelector('#loginDropdown');
          if (card) {
            card.innerHTML = `
              <div class="p-3 bg-slate-50 border-b border-slate-100 rounded-t-xl">
                <p class="text-xs font-bold text-slate-900">${user.username}</p>
                <p class="text-[10px] text-slate-500">${user.email || 'Registered User'} · ${user.district || 'CENTRAL'}</p>
              </div>
              <div class="p-1 space-y-0.5 text-xs">
                ${isCitizen ? `
                  <a href="/citizen.html" class="aicte-dropdown-item font-semibold"><span>👤</span> Citizen Dashboard</a>
                  <a href="/apply.html?mode=check" class="aicte-dropdown-item font-semibold text-amber-800"><span>⚡</span> Check Scheme Eligibility</a>
                  <a href="/apply.html" class="aicte-dropdown-item font-semibold"><span>📝</span> Apply for Schemes</a>
                  <a href="/panel/citizen" class="aicte-dropdown-item font-semibold text-orange-600"><span>⚡</span> Live Self-Service Panel</a>
                ` : `
                  <a href="/official.html" class="aicte-dropdown-item font-semibold"><span>🔐</span> Officer Console</a>
                  <a href="/panel/admin" class="aicte-dropdown-item font-semibold text-orange-600"><span>⚡</span> Live Admin Control Panel</a>
                `}
                <div class="border-t border-slate-100 my-1"></div>
                <button type="button" onclick="JanasetuAuth.logout()" class="w-full text-left aicte-dropdown-item font-bold text-red-600 hover:bg-red-50">
                  <span>🚪</span> Sign Out
                </button>
              </div>
            `;
          }
        } else {
          // Logged out state
          btn.innerHTML = `
            <svg class="size-4 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
            <span>Login / Register</span>
            <svg class="size-3 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
          `;

          const card = wrap.querySelector('#loginDropdown');
          if (card) {
            card.innerHTML = `
              <div class="p-1.5 space-y-1">
                <button type="button" onclick="JanasetuAuth.showModal({mode:'login', role:'CITIZEN'})" class="w-full text-left aicte-dropdown-item">
                  <span class="text-base">🔐</span>
                  <div>
                    <span class="block text-xs font-bold text-slate-900">Sign In</span>
                    <span class="block text-[10px] text-slate-500">Citizen or Government Officer</span>
                  </div>
                </button>
                <button type="button" onclick="JanasetuAuth.showModal({mode:'signup'})" class="w-full text-left aicte-dropdown-item">
                  <span class="text-base">📝</span>
                  <div>
                    <span class="block text-xs font-bold text-emerald-700">New Citizen Registration</span>
                    <span class="block text-[10px] text-slate-500">Create lifelong citizen record</span>
                  </div>
                </button>
              </div>
            `;
          }
        }
      });
    },

    // Attach global click interception for Apply Now buttons
    initApplyGatekeeper() {
      document.addEventListener('click', (e) => {
        const target = e.target.closest('a[href*="apply.html"], button[data-apply-action], .scheme-card, [data-require-citizen]');
        if (!target) return;

        // If target is inside a modal or logout, ignore
        if (target.closest('#janasetuAuthModal') || target.getAttribute('onclick')?.includes('logout')) return;

        const href = target.getAttribute('href') || 'apply.html';

        // Public Eligibility Checker does not require login!
        if (href.includes('mode=check') || href.includes('check=true') || target.hasAttribute('data-public-check')) {
          return;
        }
        
        // If clicking on apply page itself while on apply.html, don't intercept unless checking logged in
        if (!this.isLoggedIn() || !this.isCitizen()) {
          e.preventDefault();
          e.stopPropagation();
          sessionStorage.setItem(REDIRECT_KEY, href);
          this.showModal({
            mode: 'login',
            role: 'CITIZEN',
            message: 'Welfare scheme applications require citizen authentication to verify lifelong records and household grant history. Please sign in or create an account to proceed.'
          });
          return false;
        }
      }, true);
    },

    init() {
      this.injectModal();
      this.syncNavbar();
      this.initApplyGatekeeper();
    }
  };

  // Expose globally
  window.JanasetuAuth = JanasetuAuth;
  window.OjasAuth = JanasetuAuth;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => JanasetuAuth.init());
  } else {
    JanasetuAuth.init();
  }
})(window, document);
