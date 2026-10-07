'use strict';
(() => {
  const $ = id => document.getElementById(id);

  const form = $('beta-form');
  const email = $('beta-email');
  const fields = $('beta-fields');
  const submit = $('beta-submit');
  const status = $('beta-status');
  const error = $('email-error');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const endpoint = local ? 'http://127.0.0.1:8787/api/beta' : window.VOICE_CONFIG?.signupEndpoint;
  let pending = false;
  let received = false;

  if (local) $('local-preview-note').hidden = false;
  if (endpoint) fields.disabled = false;
  else status.textContent = 'Beta requests will open soon. Please check back shortly.';

  email.addEventListener('input', () => {
    email.removeAttribute('aria-invalid');
    error.textContent = '';
    if (!pending && !received) status.textContent = '';
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || received || !endpoint) return;
    email.value = email.value.trim();
    if (!email.validity.valid || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
      email.setAttribute('aria-invalid', 'true');
      error.textContent = 'Enter a valid email address, like you@example.com.';
      email.focus();
      return;
    }
    pending = true;
    fields.disabled = true;
    form.setAttribute('aria-busy', 'true');
    error.textContent = '';
    status.textContent = 'Sending your request…';
    submit.querySelector('.submit-label').textContent = 'Sending…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.value }),
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.received !== true) {
        const message = response.status === 429
          ? 'Too many attempts. Please wait a minute and try again.'
          : response.status === 400
            ? 'Please check your email address and try again.'
            : 'We couldn’t save your request. Please try again.';
        throw new Error(message);
      }
      received = true;
      form.dataset.state = 'received';
      status.textContent = 'Request received. We’ll follow up when the first beta is ready to try.';
      submit.querySelector('.submit-label').textContent = 'Request received';
    } catch (failure) {
      status.textContent = failure.name === 'AbortError' || failure instanceof TypeError
        ? 'Couldn’t reach the signup service. Your email is still here—please try again.'
        : failure.message;
      form.dataset.state = 'error';
      submit.querySelector('.submit-label').textContent = 'Try again';
    } finally {
      clearTimeout(timeout);
      pending = false;
      fields.disabled = received;
      form.removeAttribute('aria-busy');
    }
  });
})();
