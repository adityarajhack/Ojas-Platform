/* Shared helpers for the Citizen and Admin panels. No external dependencies. */
(function () {
  const Panel = {};
  let storeKey = 'gov_panel';
  let onLogout = () => {};

  Panel.init = function (key, logoutHandler) {
    storeKey = key;
    onLogout = logoutHandler || onLogout;
  };

  Panel.session = function () {
    try { return JSON.parse(localStorage.getItem(storeKey) || 'null'); } catch { return null; }
  };
  Panel.saveSession = function (s) { localStorage.setItem(storeKey, JSON.stringify(s)); };
  Panel.clearSession = function () { localStorage.removeItem(storeKey); };

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  async function refresh() {
    const s = Panel.session();
    if (!s || !s.refreshToken) return false;
    const res = await fetch('/v1/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    s.accessToken = data.accessToken;
    s.refreshToken = data.refreshToken;
    Panel.saveSession(s);
    return true;
  }

  /** Calls the API. Adds bearer token + Idempotency-Key, retries once after rotating the refresh token on 401. */
  Panel.api = async function (method, path, body, opts) {
    opts = opts || {};
    const s = Panel.session();
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (s && s.accessToken && !opts.noAuth) headers['Authorization'] = 'Bearer ' + s.accessToken;
    if (method !== 'GET') headers['Idempotency-Key'] = opts.idempotencyKey || uuid();
    let res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (res.status === 401 && !opts.noAuth && !opts._retried && s && s.refreshToken) {
      if (await refresh()) return Panel.api(method, path, body, Object.assign({}, opts, { _retried: true }));
      Panel.clearSession();
      onLogout();
      throw new Error('Session expired. Please log in again.');
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && (data.detail || data.message)) || res.statusText || 'Request failed';
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  };

  Panel.toast = function (msg, kind) {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3500);
  };

  Panel.esc = function (v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  Panel.date = function (v, withTime) {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return Panel.esc(v);
    return withTime === false
      ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  Panel.money = function (v) {
    const n = Number(v || 0);
    return '₹' + n.toLocaleString('en-IN');
  };

  const STATUS_CLASS = {
    SUBMITTED: 'b-blue', UNDER_VERIFICATION: 'b-blue', FLAGGED: 'b-amber', APPROVED: 'b-green', DISBURSED: 'b-green',
    REJECTED: 'b-red', WITHDRAWN: 'b-grey', APPEALED: 'b-purple', HIGH: 'b-red', MEDIUM: 'b-amber', LOW: 'b-green',
    VERIFIED: 'b-green', PENDING: 'b-amber', ACTIVE: 'b-green', REVOKED: 'b-grey', ALIVE: 'b-green', DECEASED: 'b-grey',
    SUCCESS: 'b-green', PUBLISHED: 'b-green', FAILED: 'b-red', UPHELD: 'b-red', OVERTURNED: 'b-green', SENT: 'b-green',
    INDIVIDUAL: 'b-blue', HOUSEHOLD: 'b-purple', PROPERTY: 'b-amber', VERY_HIGH: 'b-red',
  };
  Panel.badge = function (status) {
    if (!status) return '';
    const label = String(status).replace(/_/g, ' ');
    return '<span class="badge ' + (STATUS_CLASS[status] || 'b-grey') + '">' + Panel.esc(label) + '</span>';
  };

  Panel.empty = function (msg) { return '<div class="empty">' + Panel.esc(msg || 'Nothing to show yet.') + '</div>'; };
  Panel.loading = function () { return '<div class="empty"><span class="spinner"></span> Loading…</div>'; };

  Panel.openDrawer = function (html) {
    Panel.closeDrawer();
    const ov = document.createElement('div'); ov.className = 'overlay'; ov.id = 'drawer-ov'; ov.onclick = Panel.closeDrawer;
    const dr = document.createElement('div'); dr.className = 'drawer'; dr.id = 'drawer';
    dr.innerHTML = '<button class="btn sm close" onclick="Panel.closeDrawer()">✕ Close</button>' + html;
    document.body.appendChild(ov); document.body.appendChild(dr);
    return dr;
  };
  Panel.closeDrawer = function () {
    ['drawer', 'drawer-ov'].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
  };

  /** Simple prompt modal returning the entered text, or null if cancelled. */
  Panel.ask = function (title, placeholder, minLen) {
    return new Promise((resolve) => {
      const ov = document.createElement('div'); ov.className = 'overlay'; ov.style.zIndex = 55;
      const m = document.createElement('div'); m.className = 'modal';
      m.innerHTML = '<h3>' + Panel.esc(title) + '</h3><div class="field"><textarea id="ask-input" placeholder="' + Panel.esc(placeholder || '') +
        '"></textarea><div class="small muted" id="ask-hint">Minimum ' + (minLen || 1) + ' characters</div></div>' +
        '<div class="btn-row" style="justify-content:flex-end"><button class="btn" id="ask-cancel">Cancel</button><button class="btn primary" id="ask-ok">Submit</button></div>';
      document.body.appendChild(ov); document.body.appendChild(m);
      const input = m.querySelector('#ask-input');
      input.focus();
      const done = (v) => { ov.remove(); m.remove(); resolve(v); };
      m.querySelector('#ask-cancel').onclick = () => done(null);
      ov.onclick = () => done(null);
      m.querySelector('#ask-ok').onclick = () => {
        const v = input.value.trim();
        if (v.length < (minLen || 1)) { m.querySelector('#ask-hint').style.color = '#c62828'; return; }
        done(v);
      };
    });
  };

  Panel.fileToBase64 = function (file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  };

  /** Wraps an async click handler: disables the button and shows errors as toasts. */
  Panel.run = async function (btn, fn) {
    if (btn) btn.disabled = true;
    try { return await fn(); }
    catch (e) { Panel.toast(e.message || String(e), 'error'); }
    finally { if (btn) btn.disabled = false; }
  };

  window.Panel = Panel;
})();
