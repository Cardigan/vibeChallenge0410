# Phone Reminder App

A web app that schedules phone calls to remind you at a specific time. Uses Twilio for automated voice calls with text-to-speech.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure Twilio credentials**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your [Twilio](https://www.twilio.com/) account details:
   - `TWILIO_ACCOUNT_SID` — from your Twilio console
   - `TWILIO_AUTH_TOKEN` — from your Twilio console
   - `TWILIO_PHONE_NUMBER` — your Twilio phone number (E.164 format)

3. **Start the server**
   ```bash
   npm start
   ```
   Open [http://localhost:3000](http://localhost:3000)

## Usage

1. Enter a phone number in E.164 format (e.g. `+14155551234`)
2. Pick a future date/time for the reminder
3. Click **Set Reminder**
4. At the scheduled time, the app calls the number and plays: _"Hello! This is your scheduled reminder. Don't forget about your upcoming event. Goodbye!"_

## Notes

- Reminders are stored **in memory** and will be lost if the server restarts.
- The app works without Twilio credentials (for UI testing), but calls will not be made.
- Twilio trial accounts can only call verified phone numbers.

