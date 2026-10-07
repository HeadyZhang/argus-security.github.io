'use strict';
(() => {
  const stages = [
    { name: 'Delegate', speaker: 'You / Ask for a briefing', spoken: '“Read my project brief. Tell me what needs my decision.”', response: 'Let your AI go through the details and bring back the decisions that need you.', foot: 'It reads the brief. You hear what matters.', caption: 'The sample brief is context for the conversation.', status: 'Original brief', next: 'Hear the briefing' },
    { name: 'Brief', speaker: 'AI / Here’s what needs you', spoken: '“The brief leaves two decisions open: the first workflow, and when I need your approval.”', response: 'The details, distilled into the two choices you need to make next.', foot: 'A decision briefing, without reading the whole brief.', caption: 'The AI brings the two open decisions into focus.', status: '2 open decisions', next: 'Ask a follow-up' },
    { name: 'Clarify', speaker: 'You / Ask for the reasoning', spoken: '“What first workflow would you recommend, and why?”', response: 'AI: “Read notes, discuss a decision, then propose an update. It keeps the first version focused.”', foot: 'Hear the reasoning. Ask for more if you need it.', caption: 'The recommendation and its reasoning come back by voice.', status: 'Discussing a direction', next: 'Set the direction' },
    { name: 'Steer', speaker: 'You / Make the call', spoken: '“Start there. Require approval before publishing or sending. Update the brief.”', response: 'You choose the scope and set the boundaries. The agent’s next step is to propose the change.', foot: 'Your judgment moves the work forward.', caption: 'The original stays in view until you review the proposal.', status: 'Direction chosen', next: 'Review the update' },
    { name: 'Review', speaker: 'AI / Brief you on the proposal', spoken: '“I’ve drafted the workflow and approval boundaries. The proposed brief is ready for your review.”', response: 'Hear what changed, then review the wording when you’re ready. You keep the final say.', foot: 'A proposal to review. Nothing published or sent.', caption: 'Sample changes only. No real document has been modified.', status: 'Proposed update', next: 'Replay the example' }
  ];
  const $ = id => document.getElementById(id);
  const walkthrough = document.querySelector('.walkthrough');
  const stageButtons = [...document.querySelectorAll('[data-stage]')];
  let current = 0;

  function render(index) {
    current = index;
    const stage = stages[current];
    walkthrough.dataset.step = String(current);
    for (const field of ['speaker', 'spoken', 'response']) $(field).textContent = stage[field];
    $('conversation-foot').textContent = stage.foot;
    $('document-caption').textContent = stage.caption;
    $('document-status').textContent = stage.status;
    $('workflow-value').textContent = current === 4 ? '+ Read notes → discuss → propose an update.' : 'Still to be decided.';
    $('approval-value').textContent = current === 4 ? '+ Approval required before publishing or sending.' : 'Still to be decided.';
    for (const id of ['workflow-field', 'approval-field']) {
      $(id).classList.toggle('highlight', current > 0 && current < 4);
      $(id).classList.toggle('proposed', current === 4);
    }
    stageButtons.forEach((button, index) => {
      if (index === current) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    $('previous').disabled = current === 0;
    $('next').replaceChildren(document.createTextNode(stage.next + ' '));
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = current === 4 ? '↺' : '→';
    $('next').append(arrow);
    $('step-count').textContent = `${String(current + 1).padStart(2, '0')} / 05 · ${stage.name}`;
  }

  stageButtons.forEach(button => button.addEventListener('click', () => render(Number(button.dataset.stage))));
  $('previous').addEventListener('click', () => render(Math.max(0, current - 1)));
  $('next').addEventListener('click', () => render((current + 1) % stages.length));
  document.querySelector('.step-list').hidden = false;
  document.querySelector('.walkthrough-controls').hidden = false;
  // Announce the new transcript once per user action, without moving keyboard focus.
  $('experience').setAttribute('aria-live', 'polite');
  $('experience').setAttribute('aria-atomic', 'true');

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
