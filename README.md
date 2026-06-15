# check-in-notes-plugin

A Claude Code skill (`/check-in YYYY-MM-DD`) that turns a week of workout logs into a check-in email draft for the trainer.

## What it does

1. Reads workout logs from a Google Sheet (filtered to the past 7 days).
2. Writes `check-ins/<date>.md` with the raw entries.
3. Summarizes the week, asks six follow-up questions (weight, appetite, digestion, HR, skips, comments), and fills in the markdown.
4. Creates a Gmail draft addressed to the trainer using `templates/email.md` as the wrapper.

The draft is **never sent automatically** — open Gmail → Drafts and hit Send yourself.

## Prerequisites

- Node 18+
- A Google account with Drive, Sheets, and Gmail
- Claude Code CLI
- An upstream Google Apps Script web app that converts the latest CSV in a Drive folder into a cleaned Sheet (lives outside this repo; URL goes in `.env`)

## One-time setup

### 1. Install

```bash
npm install
```

### 2. Create `.env`

At the repo root:

```
APP_URL=<deployed Apps Script web app URL>
APP_KEY=<shared secret the Apps Script checks>
FOLDER_ID=<Drive folder ID containing the CSV→Sheet conversions>
PROJECT_ID=<Google Cloud project id>
```

### 3. Service account credentials (for Sheets + Drive reads)

1. In Google Cloud Console, create a service account in your project.
2. Generate a JSON key and save it as `secrets/credentials.json`.
3. Share the Drive folder (`FOLDER_ID`) **and** each spreadsheet inside it with the service account email (`...@<project>.iam.gserviceaccount.com`). Folder-level sharing alone isn't enough for the Sheets API read.

### 4. OAuth client (for Gmail draft creation)

1. Enable the **Gmail API** in your Cloud project.
2. **APIs & Services → OAuth consent screen**: type "External", add yourself as a test user, add scope `.../auth/gmail.compose`.
3. **APIs & Services → Credentials → Create OAuth client ID** → application type "Desktop app" → download the JSON as `secrets/oauth-client.json`.
4. Run the one-time auth script:
   ```bash
   node scripts/auth.js
   ```
   It prints a URL, opens an OAuth flow in your browser, and writes `secrets/gmail-token.json`.

> Note: with sensitive scopes in Testing mode, refresh tokens expire every 7 days. Re-run `node scripts/auth.js` when that happens.

## Usage

In Claude Code:

```
/check-in 2026-06-12
```

The date is the **end** of the check-in week (script subtracts 1–7 days from it). The skill will:

1. Run the pipeline and create `check-ins/2026-06-12.md`.
2. Summarize the workouts and ask you six follow-up questions.
3. Fill in the placeholders.
4. Create a Gmail draft.

To re-run only the draft (without re-pulling sheet data):

```bash
node scripts/draftEmail.js 2026-06-12
```

## Project structure

```
.
├── .claude/skills/check-in/   # skill definition (SKILL.md)
├── check-ins/                 # generated check-in markdown (per date)
├── docs/PLANNING.md           # original design notes
├── examples/                  # few-shot examples for summary tone
├── scripts/                   # Node scripts (see CLAUDE.md for architecture)
├── secrets/                   # gitignored: credentials.json, oauth-client.json, gmail-token.json
├── templates/email.md         # email wrapper (TO/SUBJECT/BODY with [date] and [output] placeholders)
├── .env                       # gitignored
├── CLAUDE.md                  # architecture + gotchas (for Claude Code)
└── package.json
```

## Customizing the email

`templates/email.md` defines:
- `**TO:**` — trainer's email
- `**SUBJECT:**` — uses `[date]` placeholder (rendered as `MM/DD/YYYY`)
- `**BODY:**` — uses `[output]` placeholder (the filled-in check-in block)

Edit that file to change recipient, subject, or surrounding wording — no code changes needed.
