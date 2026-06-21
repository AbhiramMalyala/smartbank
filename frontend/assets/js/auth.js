// assets/js/auth.js  — FIXED VERSION
console.log("AUTH.JS LOADED");
const API = 'http://localhost:5000/api';

// ── Cursor (safe, runs after DOM ready) ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const cur = document.getElementById('cursor');
  const dot = document.getElementById('cursorDot');
  if (cur && dot) {
    document.addEventListener('mousemove', e => {
      cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px';
      dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px';
    });
  }

  // ── Alert helpers ──────────────────────────────────────────────────────────
  function showErr(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 8000);
  }
  function showSuc(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = msg;
    el.classList.add('show');
  }
  function hideAlert(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
  }

  // ── Button state helper ────────────────────────────────────────────────────
  function setBtnLoading(btnId, loadingText) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = true;
    // Works whether button has a <span> child or not
    const span = btn.querySelector('span');
    if (span) span.textContent = loadingText;
    else btn.textContent = loadingText;
  }
  function setBtnReady(btnId, readyText) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = false;
    const span = btn.querySelector('span');
    if (span) span.textContent = readyText;
    else btn.textContent = readyText;
  }

  // ════════════════════════════════════════════════════════
  //  LOGIN FORM
  // ════════════════════════════════════════════════════════
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      hideAlert('loginError');
      hideAlert('loginWarn');
      setBtnLoading('loginBtn', 'Signing In...');

      const email    = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;

      if (!email || !password) {
        showErr('loginError', 'Please enter your email and password.');
        setBtnReady('loginBtn', 'Sign In');
        return;
      }

      try {
        const res  = await fetch(`${API}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        console.log("LOGIN RESPONSE:", data);
        if (!res.ok) {
          showErr('loginError', data.message || 'Login failed. Check your credentials.');
          setBtnReady('loginBtn', 'Sign In');
          return;
        }

        // Success — save token and redirect
        // localStorage.setItem('sb_token', data.token);
        // localStorage.setItem('sb_user', JSON.stringify(data.user));
        // window.location.href = 'dashboard.html';
        localStorage.setItem('sb_token', data.token);
localStorage.setItem('sb_user', JSON.stringify(data.user));

console.log("Logged in user:", data.user);

const isAdminPage =
    window.location.pathname.includes('admin-login');

if (isAdminPage) {

    if (data.user.role !== 'admin') {

        alert('Access Denied. Admin account required.');

        localStorage.clear();

        setBtnReady('loginBtn', 'Sign In');

        return;
    }

    window.location.href = 'admin-dashboard.html';

} else {

    if (data.user.role === 'admin') {

        alert('Please use Admin Login.');

        localStorage.clear();

        setBtnReady('loginBtn', 'Sign In');

        return;
    }

    window.location.href = 'dashboard.html';
}

      } catch (err) {
        showErr('loginError',
          '⚠️ Cannot reach server.<br>' +
          'Make sure the backend is running:<br>' +
          '<code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px">cd backend &amp;&amp; npm run dev</code>'
        );
        setBtnReady('loginBtn', 'Sign In');
      }
    });
  }

  // ════════════════════════════════════════════════════════
  //  REGISTER FORM
  // ════════════════════════════════════════════════════════
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async e => {
      e.preventDefault();
      hideAlert('regError');
      hideAlert('regSuccess');
      setBtnLoading('regBtn', 'Creating Account...');

      // Collect values
      const firstName   = (document.getElementById('regFirst')?.value   || '').trim();
      const lastName    = (document.getElementById('regLast')?.value    || '').trim();
      const email       = (document.getElementById('regEmail')?.value   || '').trim();
      const phone       = (document.getElementById('regPhone')?.value   || '').trim();
      const password    = (document.getElementById('regPassword')?.value || '');
      const accountType = (document.getElementById('regAccType')?.value  || 'savings');
      const termsCheck  = document.getElementById('termsCheck');

      // ── Client-side validation ────────────────────────────────────────────
      if (!firstName) {
        showErr('regError', 'Please enter your first name.');
        setBtnReady('regBtn', 'Open My Account'); return;
      }
      if (!lastName) {
        showErr('regError', 'Please enter your last name.');
        setBtnReady('regBtn', 'Open My Account'); return;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showErr('regError', 'Please enter a valid email address.');
        setBtnReady('regBtn', 'Open My Account'); return;
      }
      if (password.length < 8) {
        showErr('regError', 'Password must be at least 8 characters long.');
        setBtnReady('regBtn', 'Open My Account'); return;
      }
      if (!/[A-Z]/.test(password)) {
        showErr('regError', 'Password must contain at least one uppercase letter (e.g. A–Z).');
        setBtnReady('regBtn', 'Open My Account'); return;
      }
      if (!/[a-z]/.test(password)) {
        showErr('regError', 'Password must contain at least one lowercase letter (e.g. a–z).');
        setBtnReady('regBtn', 'Open My Account'); return;
      }
      if (!/[0-9]/.test(password)) {
        showErr('regError', 'Password must contain at least one number (0–9).');
        setBtnReady('regBtn', 'Open My Account'); return;
      }
      if (termsCheck && !termsCheck.checked) {
        showErr('regError', 'Please accept the Terms of Service to continue.');
        setBtnReady('regBtn', 'Open My Account'); return;
      }

      // ── Send to backend ───────────────────────────────────────────────────
      try {
        const res = await fetch(`${API}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName, lastName, email, phone, password, accountType })
        });
        const data = await res.json();

        if (!res.ok) {
          // Show the exact server error message
          showErr('regError', data.message || 'Registration failed. Please try again.');
          setBtnReady('regBtn', 'Open My Account');
          return;
        }

        // ── Registration successful ──────────────────────────────────────
        showSuc('regSuccess',
          '✓ Account created successfully!<br>' +
          `Welcome, ${firstName}! Redirecting to login in 2 seconds...`
        );
        registerForm.reset();
        // Reset password strength bar
        const fill = document.getElementById('strengthFill');
        const txt  = document.getElementById('strengthText');
        if (fill) { fill.style.width = '0'; fill.style.background = ''; }
        if (txt)  txt.textContent = '';

        setTimeout(() => { window.location.href = 'login.html'; }, 2000);

      } catch (err) {
        console.error('Register fetch error:', err);
        showErr('regError',
          '⚠️ Cannot reach server.<br>' +
          'Make sure the backend is running:<br>' +
          '<code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px">cd backend &amp;&amp; npm run dev</code>'
        );
        setBtnReady('regBtn', 'Open My Account');
      }
    });
  }

}); // end DOMContentLoaded