/**
 * auth.js — handles login and signup pages
 * Redirects to dashboard if already logged in.
 */

const isSignupPage = window.location.pathname.includes('signup');

// Check if already logged in; redirect to dashboard
(async function checkAlreadyLoggedIn() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      window.location.replace('/dashboard.html');
    }
  } catch (_) {
    // Not logged in — stay on page
  }
})();

// ── Utility ─────────────────────────────────────────────────

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

// ── Login ────────────────────────────────────────────────────

function initLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const btn = document.getElementById('submitBtn');

    if (!email) {
      showError('Please enter your email address.');
      return;
    }
    if (!password) {
      showError('Please enter your password.');
      return;
    }

    setLoading(btn, true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        showError(data.error || 'Login failed. Please try again.');
        return;
      }

      window.location.replace('/dashboard.html');
    } catch (err) {
      showError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(btn, false);
    }
  });
}

// ── Signup ───────────────────────────────────────────────────

function initSignupForm() {
  const form = document.getElementById('signupForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const btn = document.getElementById('submitBtn');

    if (!username) {
      showError('Please enter a username.');
      return;
    }
    if (username.length < 2) {
      showError('Username must be at least 2 characters.');
      return;
    }
    if (!email) {
      showError('Please enter your email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      showError('Please enter a password.');
      return;
    }
    if (password.length < 6) {
      showError('Password must be at least 6 characters.');
      return;
    }

    setLoading(btn, true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        showError(data.error || 'Signup failed. Please try again.');
        return;
      }

      window.location.replace('/dashboard.html');
    } catch (err) {
      showError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(btn, false);
    }
  });
}

// ── Init ─────────────────────────────────────────────────────

if (isSignupPage) {
  initSignupForm();
} else {
  initLoginForm();
}
