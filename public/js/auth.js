/**
 * auth.js — login by username + password, signup with username + password only
 */

const isSignupPage = window.location.pathname.includes('signup');

// Redirect to dashboard if already logged in
(async function checkAlreadyLoggedIn() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) window.location.replace('/dashboard.html');
  } catch (_) {}
})();

function showError(message) {
  const el = document.getElementById('errorMsg');
  el.textContent = message;
  el.classList.add('visible');
}
function hideError() {
  const el = document.getElementById('errorMsg');
  el.textContent = '';
  el.classList.remove('visible');
}
function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.textContent = loading
    ? (isSignupPage ? 'Creating account…' : 'Signing in…')
    : (isSignupPage ? 'Create account' : 'Sign in');
}

// ── Login ─────────────────────────────────────────────────────

function initLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const btn = document.getElementById('submitBtn');

    if (!username) { showError('Please enter your username.'); return; }
    if (!password) { showError('Please enter your password.'); return; }

    setLoading(btn, true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || 'Login failed. Please try again.'); return; }
      window.location.replace('/dashboard.html');
    } catch {
      showError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(btn, false);
    }
  });
}

// ── Signup ────────────────────────────────────────────────────

function initSignupForm() {
  const form = document.getElementById('signupForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const btn = document.getElementById('submitBtn');

    if (!username) { showError('Please enter a username.'); return; }
    if (username.length < 2) { showError('Username must be at least 2 characters.'); return; }
    if (/\s/.test(username)) { showError('Username cannot contain spaces.'); return; }
    if (!password) { showError('Please enter a password.'); return; }
    if (password.length < 6) { showError('Password must be at least 6 characters.'); return; }

    setLoading(btn, true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || 'Signup failed. Please try again.'); return; }
      window.location.replace('/dashboard.html');
    } catch {
      showError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(btn, false);
    }
  });
}

if (isSignupPage) {
  initSignupForm();
} else {
  initLoginForm();
}
