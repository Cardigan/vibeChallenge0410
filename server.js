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
  'Hello! This is your scheduled reminder. ' +
  "Don't forget about your upcoming event. Goodbye!";

// In-memory storage
const reminders = new Map();
let nextId = 1;

// Create a reminder
app.post('/api/reminders', (req, res) => {
  const { phoneNumber, reminderTime } = req.body;

  // Validate phone number (E.164 format)
  if (!phoneNumber || !/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
    return res.status(400).json({
      error: 'Invalid phone number. Use E.164 format (e.g. +14155551234)',
    });
  }

  const scheduledDate = new Date(reminderTime);
  if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
    return res
      .status(400)
      .json({ error: 'Reminder time must be a valid future date/time.' });
  }

  const id = String(nextId++);

  const job = schedule.scheduleJob(scheduledDate, async () => {
    console.log(`Firing reminder ${id} — calling ${phoneNumber}`);
    await makeCall(phoneNumber);
    reminders.delete(id);
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

// Make a Twilio call with inline TwiML
async function makeCall(to) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } =
    process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.error('Twilio credentials not configured. Skipping call.');
    return;
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  try {
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

  const hasTwilio =
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN;
  if (!hasTwilio) {
    console.log(
      'WARNING: Twilio credentials not set. Calls will not be made.'
    );
    console.log('Copy .env.example to .env and fill in your Twilio details.');
  }
});
