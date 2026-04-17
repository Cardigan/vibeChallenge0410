const API = '/api/reminders';

const form = document.getElementById('reminder-form');
const phoneInput = document.getElementById('phone');
const timeInput = document.getElementById('reminder-time');
const messageInput = document.getElementById('custom-message');
const feedback = document.getElementById('feedback');
const reminderList = document.getElementById('reminder-list');
const verifyBtn = document.getElementById('verify-btn');
const verifySection = document.getElementById('verify-section');
const verifyCodeInput = document.getElementById('verify-code');
const checkCodeBtn = document.getElementById('check-code-btn');
const verifiedBadge = document.getElementById('verified-badge');
const submitBtn = document.getElementById('submit-btn');

let phoneVerified = false;

// Set min datetime and default to now + 1 minute
function setMinAndDefaultTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  timeInput.min = now.toISOString().slice(0, 16);
  timeInput.value = new Date(now.getTime() + 60000).toISOString().slice(0, 16);
}
setMinAndDefaultTime();
setInterval(setMinAndDefaultTime, 60000);

// ── Phone Verification ──

const consentCheckbox = document.getElementById('consent-checkbox');

verifyBtn.addEventListener('click', async () => {
  const phoneNumber = phoneInput.value.trim();
  if (!phoneNumber) {
    showFeedback('Enter a phone number first.', 'error');
    return;
  }

  if (!consentCheckbox.checked) {
    showFeedback('You must agree to the Privacy Policy and Terms & Conditions.', 'error');
    return;
  }

  // Check if already verified
  try {
    const res = await fetch(`/api/verify/${encodeURIComponent(phoneNumber)}`);
    const data = await res.json();
    if (data.verified) {
      setVerified(true);
      showFeedback('Phone already verified!', 'success');
      return;
    }
  } catch { /* continue to send code */ }

  showFeedback('Sending verification code...', 'success');
  try {
    const res = await fetch('/api/verify/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber }),
    });
    const data = await res.json();
    if (!res.ok) {
      showFeedback(data.error || 'Failed to send code.', 'error');
      return;
    }
    verifySection.style.display = 'block';
    verifyCodeInput.focus();
    showFeedback('Check your phone for the 6-digit code.', 'success');
  } catch {
    showFeedback('Network error.', 'error');
  }
});

checkCodeBtn.addEventListener('click', async () => {
  const phoneNumber = phoneInput.value.trim();
  const code = verifyCodeInput.value.trim();
  if (!code) {
    showFeedback('Enter the 6-digit code.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/verify/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, code }),
    });
    const data = await res.json();
    if (!res.ok) {
      showFeedback(data.error || 'Verification failed.', 'error');
      return;
    }
    setVerified(true);
    showFeedback('Phone verified!', 'success');
  } catch {
    showFeedback('Network error.', 'error');
  }
});

// Reset verification when phone number changes
phoneInput.addEventListener('input', () => {
  setVerified(false);
  verifySection.style.display = 'none';
  verifyCodeInput.value = '';
});

function setVerified(verified) {
  phoneVerified = verified;
  verifiedBadge.style.display = verified ? 'block' : 'none';
  verifySection.style.display = 'none';
  // Verification is optional — submit always enabled
  submitBtn.disabled = false;
  if (verified) {
    verifyBtn.textContent = '✅';
    verifyBtn.disabled = true;
  } else {
    verifyBtn.textContent = 'Verify';
    verifyBtn.disabled = false;
  }
}

// ── Test Call ──

document.getElementById('test-call-btn').addEventListener('click', async () => {
  const phoneNumber = phoneInput.value.trim();
  if (!phoneNumber) {
    showFeedback('Enter a phone number first (e.g. 4155551234)', 'error');
    return;
  }

  showFeedback('Calling now...', 'success');
  try {
    const res = await fetch('/api/test-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber }),
    });
    const data = await res.json();
    if (!res.ok) {
      showFeedback(data.error || 'Test call failed.', 'error');
    } else {
      showFeedback(data.message, 'success');
    }
  } catch {
    showFeedback('Network error. Is the server running?', 'error');
  }
});

// ── Create Reminder ──

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showFeedback('', '');

  const phoneNumber = phoneInput.value.trim();
  const reminderTime = new Date(timeInput.value).toISOString();
  const message = messageInput.value.trim() || undefined;

  if (!phoneNumber) {
    showFeedback('Enter a phone number (e.g. 4155551234)', 'error');
    return;
  }

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, reminderTime, message }),
    });

    const data = await res.json();

    if (!res.ok) {
      showFeedback(data.error || 'Something went wrong.', 'error');
      return;
    }

    const msgLabel = data.message ? ` — "${data.message}"` : '';
    showFeedback(
      `Reminder set! We'll call ${data.phoneNumber} at ${formatTime(data.reminderTime)}${msgLabel}`,
      'success'
    );
    const savedPhone = phoneInput.value;
    form.reset();
    phoneInput.value = savedPhone;
    messageInput.value = '';
    setMinAndDefaultTime();
    loadReminders();
  } catch {
    showFeedback('Network error. Is the server running?', 'error');
  }
});

// ── Load & Cancel Reminders ──

async function loadReminders() {
  try {
    const res = await fetch(API);
    const reminders = await res.json();

    if (reminders.length === 0) {
      reminderList.innerHTML = '<p class="empty">No upcoming reminders.</p>';
      return;
    }

    reminderList.innerHTML = reminders
      .map(
        (r) => `
      <div class="reminder-card">
        <div class="reminder-info">
          <span class="reminder-phone">${escapeHtml(r.phoneNumber)}</span>
          <span class="reminder-time">${formatTime(r.reminderTime)}</span>
          ${r.message ? `<span class="reminder-msg">"${escapeHtml(r.message)}"</span>` : '<span class="reminder-msg default-msg">Default alert message</span>'}
        </div>
        <button class="cancel-btn" onclick="cancelReminder('${r.id}')">Cancel</button>
      </div>`
      )
      .join('');
  } catch {
    reminderList.innerHTML = '<p class="empty">Could not load reminders.</p>';
  }
}

async function cancelReminder(id) {
  try {
    await fetch(`${API}/${id}`, { method: 'DELETE' });
    loadReminders();
  } catch {
    showFeedback('Failed to cancel reminder.', 'error');
  }
}

// ── Helpers ──

function showFeedback(message, type) {
  feedback.textContent = message;
  feedback.className = `feedback ${type}`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Status check + load on startup ──

async function checkStatus() {
  try {
    const res = await fetch('/api/status');
    const { twilioConfigured, dbConnected } = await res.json();
    document.getElementById('twilio-warning').style.display =
      twilioConfigured ? 'none' : 'block';
    document.getElementById('db-warning').style.display =
      dbConnected ? 'none' : 'block';
  } catch { /* ignore */ }
}

checkStatus();
loadReminders();
