require('dotenv').config();
const express = require('express');
const schedule = require('node-schedule');
const twilio = require('twilio');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;
const DELAY_PHONE_PICKUP = "... ... ... ... "
const TEST_CALL_MESSAGE =
  DELAY_PHONE_PICKUP + 
  'You are the D.R.I.' + 
  'A sev 1 incident has been raised against your service. ' +
  'You are the D.R.I. Panic Panic Panic!';

// In-memory job map (keyed by reminder id)
const scheduledJobs = new Map();
// In-memory fallback when DB is unavailable
const inMemoryReminders = new Map();
let nextInMemoryId = 1;
let dbReady = false;

// Normalize phone number: assume US (+1) if no country code
function normalizePhone(raw) {
  if (!raw) return null;
  let phone = raw.replace(/[\s\-().]/g, '');
  if (!phone.startsWith('+')) {
    phone = '+1' + phone;
  }
  return /^\+[1-9]\d{6,14}$/.test(phone) ? phone : null;
}

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

// Schedule a reminder job
function scheduleReminder(reminder) {
  const fireTime = new Date(reminder.reminder_time);
  const now = new Date();

  if (fireTime <= now) {
    console.log(`Firing missed reminder ${reminder.id} — calling ${reminder.phone_number}`);
    makeCall(reminder.phone_number, reminder.message)
      .catch((err) => console.error(`Error in reminder ${reminder.id}:`, err.message))
      .then(() => {
        if (dbReady) db.markFired(reminder.id);
        else inMemoryReminders.delete(String(reminder.id));
      });
    return;
  }

  const job = schedule.scheduleJob(fireTime, () => {
    console.log(`Firing reminder ${reminder.id} — calling ${reminder.phone_number}`);
    makeCall(reminder.phone_number, reminder.message)
      .catch((err) => console.error(`Error in reminder ${reminder.id}:`, err.message))
      .then(() => {
        if (dbReady) db.markFired(reminder.id);
        else inMemoryReminders.delete(String(reminder.id));
        scheduledJobs.delete(String(reminder.id));
      });
  });

  scheduledJobs.set(String(reminder.id), job);
}

// ── Reminder endpoints ──

function requireDb(res) {
  if (!dbReady) {
    res.status(503).json({
      error: 'Database is not connected. Set DATABASE_URL in your .env file and restart the server.',
    });
    return false;
  }
  return true;
}

app.post('/api/reminders', async (req, res) => {
  const phoneNumber = normalizePhone(req.body.phoneNumber);

  if (!phoneNumber) {
    return res.status(400).json({
      error: 'Invalid phone number. Example: 4155551234 or +14155551234',
    });
  }

  const scheduledDate= new Date(req.body.reminderTime);
  if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
    return res
      .status(400)
      .json({ error: 'Reminder time must be a valid future date/time.' });
  }

  const message = req.body.message?.trim() || null;

  try {
    let reminder;
    if (dbReady) {
      reminder = await db.createReminder(phoneNumber, scheduledDate, message);
    } else {
      const id = String(nextInMemoryId++);
      reminder = { id, phone_number: phoneNumber, reminder_time: scheduledDate.toISOString(), message, status: 'pending' };
      inMemoryReminders.set(id, reminder);
    }
    scheduleReminder(reminder);

    console.log(`Reminder ${reminder.id} scheduled for ${reminder.reminder_time}`);
    res.status(201).json({
      id: reminder.id,
      phoneNumber: reminder.phone_number,
      reminderTime: reminder.reminder_time,
      message: reminder.message,
    });
  } catch (err) {
    console.error('Failed to create reminder:', err.message);
    res.status(500).json({ error: 'Failed to create reminder.' });
  }
});

app.get('/api/reminders', async (_req, res) => {
  try {
    let reminders;
    if (dbReady) {
      reminders = await db.getPendingReminders();
    } else {
      reminders = Array.from(inMemoryReminders.values()).filter(r => r.status === 'pending');
    }
    res.json(
      reminders.map((r) => ({
        id: r.id,
        phoneNumber: r.phone_number,
        reminderTime: r.reminder_time,
        message: r.message,
      }))
    );
  } catch (err) {
    console.error('Failed to list reminders:', err.message);
    res.status(500).json({ error: 'Failed to load reminders.' });
  }
});

app.delete('/api/reminders/:id', async (req, res) => {
  try {
    let cancelled;
    if (dbReady) {
      cancelled = await db.deleteReminder(req.params.id);
    } else {
      cancelled = inMemoryReminders.delete(req.params.id);
    }
    if (!cancelled) {
      return res.status(404).json({ error: 'Reminder not found.' });
    }
    const job = scheduledJobs.get(req.params.id);
    if (job) {
      job.cancel();
      scheduledJobs.delete(req.params.id);
    }
    console.log(`Reminder ${req.params.id} cancelled`);
    res.json({ message: 'Reminder cancelled.' });
  } catch (err) {
    console.error('Failed to cancel reminder:', err.message);
    res.status(500).json({ error: 'Failed to cancel reminder.' });
  }
});

// ── Test call — always uses the fixed sev 1 message ──

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
  await makeCall(phoneNumber, null);
  res.json({ message: `Test call initiated to ${phoneNumber}` });
});

// ── Phone verification endpoints ──

app.post('/api/verify/send', async (req, res) => {
  if (!requireDb(res)) return;
  const phoneNumber = normalizePhone(req.body.phoneNumber);
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Invalid phone number.' });
  }

  if (!isTwilioConfigured()) {
    return res.status(503).json({ error: 'Twilio is not configured.' });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  try {
    await db.saveVerificationCode(phoneNumber, code, expiresAt);

    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    await client.messages.create({
      body: `Your Phone Reminder verification code is: ${code}`,
      to: phoneNumber,
      from: TWILIO_PHONE_NUMBER,
    });

    console.log(`Verification code sent to ${phoneNumber}`);
    res.json({ message: 'Verification code sent.' });
  } catch (err) {
    console.error(`Failed to send verification to ${phoneNumber}:`, err.message);
    res.status(500).json({ error: 'Failed to send verification code.' });
  }
});

app.post('/api/verify/check', async (req, res) => {
  if (!requireDb(res)) return;
  const phoneNumber = normalizePhone(req.body.phoneNumber);
  const { code } = req.body;

  if (!phoneNumber || !code) {
    return res.status(400).json({ error: 'Phone number and code required.' });
  }

  try {
    const valid = await db.checkVerificationCode(phoneNumber, code);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid or expired code.' });
    }
    console.log(`Phone ${phoneNumber} verified`);
    res.json({ verified: true });
  } catch (err) {
    console.error('Verification check failed:', err.message);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

app.get('/api/verify/:phone', async (req, res) => {
  if (!requireDb(res)) return;
  const phoneNumber = normalizePhone(req.params.phone);
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Invalid phone number.' });
  }

  try {
    const verified = await db.isPhoneVerified(phoneNumber);
    res.json({ verified });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check verification.' });
  }
});

// ── Status endpoint ──

app.get('/api/status', (_req, res) => {
  res.json({ twilioConfigured: isTwilioConfigured(), dbConnected: dbReady });
});

// ── Twilio call helper ──

async function makeCall(to, customMessage) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } =
    process.env;

  const message = customMessage || TEST_CALL_MESSAGE;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.error('═══════════════════════════════════════════════════');
    console.error('  REMINDER FIRED but Twilio is not configured!');
    console.error(`  Would have called: ${to}`);
    console.error(`  Message: "${message}"`);
    console.error('  → Set up .env with Twilio credentials to enable calls.');
    console.error('═══════════════════════════════════════════════════');
    return;
  }

  const safeMessage = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  try {
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const call = await client.calls.create({
      twiml: `<Response><Say voice="alice">${safeMessage}</Say></Response>`,
      to,
      from: TWILIO_PHONE_NUMBER,
    });
    console.log(`Call initiated: SID ${call.sid}`);
  } catch (err) {
    console.error(`Failed to call ${to}:`, err.message);
  }
}

// ── Startup ──

async function start() {
  if (process.env.DATABASE_URL) {
    try {
      await db.initDb();
      dbReady = true;

      const pending = await db.getPendingReminders();
      console.log(`Restoring ${pending.length} pending reminder(s)`);
      for (const r of pending) {
        scheduleReminder(r);
      }
    } catch (err) {
      console.error('Database initialization failed:', err.message);
      console.log('Running without database — reminders will not persist.');
    }
  } else {
    console.log('WARNING: DATABASE_URL not set. Reminders will not persist.');
  }

  app.listen(PORT, () => {
    console.log(`Reminder app running at http://localhost:${PORT}`);

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;

    if (!sid || !token) {
      console.log('WARNING: Twilio credentials not set. Calls will not be made.');
      console.log('Copy .env.example to .env and fill in your Twilio details.');
    } else if (!sid.startsWith('AC')) {
      console.log('WARNING: TWILIO_ACCOUNT_SID should start with "AC".');
      console.log('Find your Account SID at https://console.twilio.com');
    }
  });
}

start();
