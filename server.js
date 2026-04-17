require('dotenv').config();
const express = require('express');
const schedule = require('node-schedule');
const twilio = require('twilio');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;
const REMINDER_MESSAGE =
  'A sev 1 has been raised against your service. ' +
  'You are the D.R.I. Panic Panic Panic!';

// In-memory storage
const reminders = new Map();
let nextId = 1;

// Normalize phone number: assume US (+1) if no country code
function normalizePhone(raw) {
  if (!raw) return null;
  let phone = raw.replace(/[\s\-().]/g, '');
  if (!phone.startsWith('+')) {
    phone = '+1' + phone;
  }
  return /^\+[1-9]\d{6,14}$/.test(phone) ? phone : null;
}

// Create a reminder
app.post('/api/reminders', (req, res) => {
  const phoneNumber = normalizePhone(req.body.phoneNumber);

  if (!phoneNumber) {
    return res.status(400).json({
      error: 'Invalid phone number. Example: 4155551234 or +14155551234',
    });
  }

  const scheduledDate = new Date(req.body.reminderTime);
  if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
    return res
      .status(400)
      .json({ error: 'Reminder time must be a valid future date/time.' });
  }

  const id = String(nextId++);

  const job = schedule.scheduleJob(scheduledDate, () => {
    console.log(`Firing reminder ${id} — calling ${phoneNumber}`);
    makeCall(phoneNumber)
      .catch((err) => console.error(`Unhandled error in reminder ${id}:`, err.message))
      .finally(() => reminders.delete(id));
  });

  reminders.set(id, {
    id,
    phoneNumber,
    reminderTime: scheduledDate.toISOString(),
    job,
  });

  console.log(`Reminder ${id} scheduled for ${scheduledDate.toISOString()}`);
  res.status(201).json({
    id,
    phoneNumber,
    reminderTime: scheduledDate.toISOString(),
  });
});

// List reminders
app.get('/api/reminders', (_req, res) => {
  const list = [];
  for (const [, r] of reminders) {
    list.push({
      id: r.id,
      phoneNumber: r.phoneNumber,
      reminderTime: r.reminderTime,
    });
  }
  res.json(list);
});

// Cancel a reminder
app.delete('/api/reminders/:id', (req, res) => {
  const reminder = reminders.get(req.params.id);
  if (!reminder) {
    return res.status(404).json({ error: 'Reminder not found.' });
  }
  reminder.job.cancel();
  reminders.delete(req.params.id);
  console.log(`Reminder ${req.params.id} cancelled`);
  res.json({ message: 'Reminder cancelled.' });
});

// Test call — calls immediately
app.post('/api/test-call', async (req, res) => {
  const phoneNumber = normalizePhone(req.body.phoneNumber);

  if (!phoneNumber) {
    return res.status(400).json({
      error: 'Invalid phone number. Example: 4155551234 or +14155551234',
    });
  }

  if (!isTwilioConfigured()) {
    return res.status(503).json({
      error: 'Twilio is not configured. Set up your .env file first.',
    });
  }

  console.log(`Test call requested to ${phoneNumber}`);
  await makeCall(phoneNumber);
  res.json({ message: `Test call initiated to ${phoneNumber}` });
});

// Check if Twilio is configured
function isTwilioConfigured() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } =
    process.env;
  return !!(
    TWILIO_ACCOUNT_SID &&
    TWILIO_ACCOUNT_SID.startsWith('AC') &&
    TWILIO_AUTH_TOKEN &&
    TWILIO_PHONE_NUMBER
  );
}

// Status endpoint so the UI can show Twilio config state
app.get('/api/status', (_req, res) => {
  res.json({ twilioConfigured: isTwilioConfigured() });
});

// Make a Twilio call with inline TwiML
async function makeCall(to) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } =
    process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.error('═══════════════════════════════════════════════════');
    console.error('  REMINDER FIRED but Twilio is not configured!');
    console.error(`  Would have called: ${to}`);
    console.error(`  Message: "${REMINDER_MESSAGE}"`);
    console.error('  → Set up .env with Twilio credentials to enable calls.');
    console.error('═══════════════════════════════════════════════════');
    return;
  }

  try {
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const call = await client.calls.create({
      twiml: `<Response><Say voice="alice">${REMINDER_MESSAGE}</Say></Response>`,
      to,
      from: TWILIO_PHONE_NUMBER,
    });
    console.log(`Call initiated: SID ${call.sid}`);
  } catch (err) {
    console.error(`Failed to call ${to}:`, err.message);
  }
}

app.listen(PORT, () => {
  console.log(`Reminder app running at http://localhost:${PORT}`);

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) {
    console.log(
      'WARNING: Twilio credentials not set. Calls will not be made.'
    );
    console.log('Copy .env.example to .env and fill in your Twilio details.');
  } else if (!sid.startsWith('AC')) {
    console.log(
      'WARNING: TWILIO_ACCOUNT_SID should start with "AC". Check your .env file.'
    );
    console.log('Find your Account SID at https://console.twilio.com');
  }
});
