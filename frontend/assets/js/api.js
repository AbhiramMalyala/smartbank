// assets/js/api.js — Central API client
const API_BASE = 'http://localhost:5000/api';

const Api = {
  _token: () => localStorage.getItem('sb_token'),

  async request(method, endpoint, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this._token();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    try {
      const res = await fetch(API_BASE + endpoint, opts);
      const data = await res.json();
      if (res.status === 401) {
        localStorage.removeItem('sb_token');
        localStorage.removeItem('sb_user');
        window.location.href = '/pages/login.html';
        return null;
      }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      console.error('API Error:', err);
      return { ok: false, data: { message: 'Network error. Is the server running?' } };
    }
  },

  get:    (ep)       => Api.request('GET',    ep),
  post:   (ep, body) => Api.request('POST',   ep, body),
  put:    (ep, body) => Api.request('PUT',    ep, body),
  delete: (ep)       => Api.request('DELETE', ep),
};

// Helpers
function fmtINR(n) {
  if (n === null || n === undefined) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.classList.remove('show'), 6000);
}
function scoreColor(s) {
  if (s >= 90) return '#f04a6a';
  if (s >= 75) return '#ff7832';
  if (s >= 50) return '#f5a623';
  if (s >= 25) return '#0fd4c8';
  return '#22d47e';
}
function levelBadge(level) {
  return `<span class="badge badge-${level}">${level}</span>`;
}
function actionBadge(action) {
  const map = { block: 'blocked', review: 'review', flag: 'medium', allow: 'completed' };
  return `<span class="badge badge-${map[action] || 'clean'}">${action}</span>`;
}
function statusBadge(status) {
  const map = { completed: 'completed', blocked: 'blocked', under_review: 'review', failed: 'critical', pending: 'pending' };
  return `<span class="badge badge-${map[status] || 'clean'}">${status}</span>`;
}
function scoreBar(score) {
  const c = scoreColor(score);
  return `<div class="score-row"><div class="score-track"><div class="score-fill" style="width:${score}%;background:${c}"></div></div><div class="score-num" style="color:${c}">${score}</div></div>`;
}
