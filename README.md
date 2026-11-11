# check-in-notes-plugin

A Claude Code skill (`/check-in YYYY-MM-DD`) that turns a week of workout logs into a check-in email draft for the trainer.

## What it does

1. Pulls the last 7 days of Hevy workout logs — either from the Hevy REST API directly, or from a CSV export in Drive (whichever source is configured, see below).
2. Writes `check-ins/<date>.md` with the raw entries, grouped by workout and exercise.
3. Summarizes the week using the RPE reference material in `resources/` as its analytical framework, extracts any questions you flagged in your notes, asks six follow-up questions (weight, appetite, digestion, HR, skips, comments), then shows you the draft summary and questions for review before writing anything.
4. Fills in the markdown once you approve.
5. Creates a Gmail draft addressed to the trainer using `templates/email.md` as the wrapper.

The draft is **never sent automatically** — open Gmail → Drafts and hit Send yourself.

## Data sources

`scripts/getLogData.js` supports two ways of getting workout data, both normalized into the same shape before being written to the check-in file:

- **Hevy API** (default) — calls `https://api.hevyapp.com/v1/workouts` directly with a Hevy API key. Populates Hevy workout links since the API returns workout IDs.
- **CSV/Drive** — reads the latest CSV file in a Drive folder (via a Google service account) and parses it locally with `csv-parse`. No workout links, since a CSV export has no Hevy workout ID.

Which one runs is controlled by the `SOURCE` constant at the top of `scripts/main.js` — there's no CLI flag for it yet. It's currently set to `'API'`; change it to anything else (e.g. `'CSV'`) to use the Drive/CSV path instead.

## Prerequisites

- Node 18+
- A Google account with Gmail (and Drive, if using the CSV source)
- A Hevy account and API key (if using the API source)
- Claude Code CLI

## One-time setup

### 1. Install

```bash
npm install
```

### 2. Create `.env`

At the repo root:

```
# Only needed for the API source
HEVY_API_KEY=<your Hevy API key>

# Only needed for the CSV source
FOLDER_ID=<Drive folder ID containing the CSV export>

# Who the Gmail draft is addressed to, and the name used in the greeting
TRAINER_EMAIL=<trainer's email>
TRAINER_NAME=<trainer's first name>
```

### 3. Service account credentials (CSV source only — skip if using the API source)

1. In Google Cloud Console, create a service account in your project.
2. Generate a JSON key and save it as `secrets/credentials.json`.
3. Share the Drive folder (`FOLDER_ID`) with the service account email (`...@<project>.iam.gserviceaccount.com`).

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
3. Show you the draft summary and questions and wait for your feedback/approval.
4. Fill in the placeholders.
5. Create a Gmail draft.

To re-run only the draft (without re-pulling logs):

```bash
node scripts/draftEmail.js 2026-06-12
```

## Permissions

`.claude/settings.json` allowlists the file edits and Node commands the skill uses, so it runs without permission prompts:

```json
{
  "permissions": {
    "allow": [
      "Edit(check-ins/**)",
      "Write(check-ins/**)",
      "Bash(node scripts/main.js:*)",
      "Bash(node scripts/draftEmail.js:*)"
    ]
  }
}
```

The scope is intentionally narrow — only writes under `check-ins/` and the two pipeline scripts. `node scripts/auth.js` is left out on purpose (rare one-time OAuth step). Permission settings load at session start, so changes take effect on the next Claude Code session.

## Project structure

```
.
├── .claude/settings.json      # permission allowlist so the skill runs without prompts
├── .claude/skills/check-in/   # skill definition (SKILL.md)
├── check-ins/                 # generated check-in markdown (per date)
├── docs/PLANNING.md           # original design notes (data-source section predates the CSV/API split)
├── mocks/                     # sample Hevy API response + annotated normalized data shape, for reference only
├── resources/                 # RPE scale + RIR reference material used as the summary's analytical framework
├── scripts/                   # Node scripts (see CLAUDE.md for architecture)
├── secrets/                   # gitignored: credentials.json, oauth-client.json, gmail-token.json
├── templates/email.md         # email wrapper (SUBJECT/BODY with [date], [TRAINER_NAME] and [output] placeholders)
├── .env                       # gitignored
├── CLAUDE.md                  # architecture + gotchas (for Claude Code)
└── package.json
```

## Customizing the email

`templates/email.md` defines:
- `**SUBJECT:**` — uses `[date]` placeholder (rendered as `MM/DD/YYYY`)
- `**BODY:**` — uses `[TRAINER_NAME]` (from `.env`) and `[output]` (the filled-in check-in block) placeholders

The recipient comes from `TRAINER_EMAIL` in `.env`, not the template. Edit the template to change the subject or surrounding wording — no code changes needed. Keep the bracketed placeholders unescaped (`[date]`, not `\[date\]`) — some Markdown editors add backslashes when saving, which stops them from being filled in.
