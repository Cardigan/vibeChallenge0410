# Phone Reminder App

A web app that schedules phone calls to remind you at a specific time. Uses Twilio for automated voice calls with text-to-speech, PostgreSQL for persistent storage, and SMS verification to prevent abuse.

## Features

- **Scheduled calls** with custom or default voice messages
- **Phone verification** via SMS before scheduling (prevents abuse)
- **Test call** button for instant calls (uses fixed sev 1 alert message)
- **Persistent reminders** survive server restarts (PostgreSQL)
- **Missed reminder recovery** — fires any reminders that were missed while the server was down

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up PostgreSQL** — create a database locally or use a hosted service

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your credentials:
   - `TWILIO_ACCOUNT_SID` — from your [Twilio console](https://console.twilio.com)
   - `TWILIO_AUTH_TOKEN` — from your Twilio console
   - `TWILIO_PHONE_NUMBER` — your Twilio phone number (E.164 format)
   - `DATABASE_URL` — PostgreSQL connection string

4. **Start the server**
   ```bash
   npm start
   ```
   Open [http://localhost:3000](http://localhost:3000)

## Usage

1. Enter a phone number (US numbers don't need +1 prefix)
2. Click **Verify** — you'll receive an SMS with a 6-digit code
3. Enter the code and click **Confirm**
4. Pick a reminder time and optionally type a custom message
5. Click **Set Reminder**
6. At the scheduled time, the app calls and speaks your message

## Deploy to Render

1. Push to GitHub
2. On [Render](https://render.com), create a **Blueprint** from your repo
3. `render.yaml` auto-provisions a free PostgreSQL database
4. Set the 3 Twilio env vars in the Render dashboard
5. Deploy — you get a public URL

## Notes

- **Test Call** always uses the fixed sev 1 DRI alert message, no verification needed.
- Twilio trial accounts can only call/text verified phone numbers.
- Verification codes expire after 10 minutes.

