const API = '/api/reminders';

const form = document.getElementById('reminder-form');
const phoneInput = document.getElementById('phone');
const timeInput = document.getElementById('reminder-time');
const feedback = document.getElementById('feedback');
const reminderList = document.getElementById('reminder-list');

// Set min datetime to now and default to now + 1 minute
function setMinAndDefaultTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  timeInput.min = now.toISOString().slice(0, 16);

  const defaultTime = new Date(now.getTime() + 60000);
  timeInput.value = defaultTime.toISOString().slice(0, 16);
}
setMinAndDefaultTime();

// Test call button
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
setInterval(setMinAndDefaultTime, 60000);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showFeedback('', '');

  const phoneNumber = phoneInput.value.trim();
  const reminderTime = new Date(timeInput.value).toISOString();

  if (!phoneNumber) {
    showFeedback('Enter a phone number (e.g. 4155551234)', 'error');
    return;
  }

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, reminderTime }),
    });

    const data = await res.json();

    if (!res.ok) {
      showFeedback(data.error || 'Something went wrong.', 'error');
      return;
    }

    showFeedback(
      `Reminder set! We'll call ${data.phoneNumber} at ${formatTime(data.reminderTime)}`,
      'success'
    );
    const savedPhone = phoneInput.value;
    form.reset();
    phoneInput.value = savedPhone;
    setMinAndDefaultTime();
    loadReminders();
  } catch {
    showFeedback('Network error. Is the server running?', 'error');
  }
});

async function loadReminders() {
  try {
    const res = await fetch(API);
    const reminders = await res.json();

    if (reminders.length === 0) {
      reminderList.innerHTML =
        '<p class="empty">No upcoming reminders.</p>';
      return;
    }

    reminderList.innerHTML = reminders
      .map(
        (r) => `
      <div class="reminder-card">
        <div class="reminder-info">
          <span class="reminder-phone">${escapeHtml(r.phoneNumber)}</span>
          <span class="reminder-time">${formatTime(r.reminderTime)}</span>
        </div>
        <button class="cancel-btn" onclick="cancelReminder('${r.id}')">Cancel</button>
      </div>`
      )
      .join('');
  } catch {
    reminderList.innerHTML =
      '<p class="empty">Could not load reminders.</p>';
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

// Check Twilio status
async function checkStatus() {
  try {
    const res = await fetch('/api/status');
    const { twilioConfigured } = await res.json();
    const warning = document.getElementById('twilio-warning');
    warning.style.display = twilioConfigured ? 'none' : 'block';
  } catch { /* ignore */ }
}

// Load on startup
checkStatus();
loadReminders();
