# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Claude Code skill (`/check-in YYYY-MM-DD`) that generates weekly workout check-in summaries for the repo owner's trainer. The skill orchestrates a Node script that pulls workout logs from a Google Sheet, filters them to the past week, and writes a markdown file at `check-ins/<date>.md` using `templates/email.md` as the output shape. After the file exists, the skill summarizes the `## Data from Application:` block (using `examples/` as few-shot guidance), asks the user a fixed set of follow-up questions, fills in the placeholders, then creates a Gmail draft via `scripts/draftEmail.js`. See `docs/PLANNING.md` for the full intended flow.

## Running

End-users invoke the skill (`/check-in YYYY-MM-DD`) — it orchestrates the scripts. Direct invocations:

```bash
node scripts/main.js 2026-06-12       # build check-ins/<date>.md (input date is END of the week; script subtracts 1–7 days)
node scripts/draftEmail.js 2026-06-12 # create Gmail draft from check-ins/<date>.md
node scripts/auth.js                  # one-time Gmail OAuth flow; writes secrets/gmail-token.json
```

Requires `.env` at the repo root with `APP_URL`, `APP_KEY` (for the Apps Script web-app), `FOLDER_ID` (Drive folder containing the CSV→Sheet conversions), and `PROJECT_ID`. Also requires `secrets/credentials.json` and `secrets/oauth-client.json` (see README). No build, lint, or test setup exists yet.

## Architecture

The data path is deliberately split across two Google environments because the raw log source is a CSV in Drive that needs cleaning before it's usable:

1. **`main.js`** validates the input date, computes the 7-day window (`getDateRange`), then runs the rest sequentially.
2. **`runAppScript.js`** POSTs to a deployed Google Apps Script web-app (`APP_URL`, gated by `APP_KEY`). The Apps Script lives outside this repo — its job is to find the latest CSV in `FOLDER_ID`, convert it to a Google Sheet, and strip irrelevant columns/rows. This MUST run before `getSheet.js` because the Sheets API call depends on the cleaned Sheet existing.
3. **`getSheet.js`** authenticates with `secrets/credentials.json` (a **service account** — not OAuth), uses Drive to find the most recently-created spreadsheet in `FOLDER_ID`, fetches its values via Sheets API, and `transformData` reshapes header row + value rows into `{rows: [{Header: value, ...}]}`. `getLogData(dateRange)` then filters rows to entries whose `Date` falls in the window.
4. **`createCheckInFile.js`** writes `check-ins/<date>.md` from `populateTemplate`, with the filtered log lines formatted as `- <date> (<W#> <workout>: <exercise>) - <note>`. Workout-week prefix (`W5`, etc.) is extracted from the exercise string via regex, not stored separately. The `check-ins/` directory must exist before `main.js` runs — `fs.writeFile` won't create it.

Every async function returns `{success: boolean, data: <result-or-message>}`. The skill surface (per `docs/PLANNING.md`) shows `data` to the user on failure.

## Secrets

All credential files live in `secrets/` (gitignored as a folder):
- `secrets/credentials.json` — service account key for Drive + Sheets (see Service account auth below)
- `secrets/oauth-client.json` — OAuth 2.0 client for Gmail draft creation (Desktop app type, downloaded from Cloud Console)
- `secrets/gmail-token.json` — refresh token produced by `scripts/auth.js`; recreate by re-running that script if it expires (sensitive scopes in Testing mode expire after 7 days)

## Service account auth

`secrets/credentials.json` is a Google service account key (`[SERVICE_ACCOUNT_EMAIL]`). For the Sheets/Drive calls to succeed, the **target folder and any sheets in it must be shared with that email**. Folder-level sharing is required for the Drive `files.list` query; per-sheet sharing is what unlocks the Sheets API read. A 404 from `sheets.spreadsheets.values.get` usually means the sheet itself wasn't shared even though the folder was.

`authorize()` uses `GoogleAuth.getClient()` — calling code must not pass the `GoogleAuth` wrapper directly to API methods or you'll get `authClient.request is not a function`.

## Gmail draft (scripts/auth.js + scripts/draftEmail.js)

`draftEmail.js` reads `check-ins/<date>.md`, extracts the `## Output:` block, wraps it in `templates/email.md`, and creates a draft via `gmail.users.drafts.create`. It only **creates** drafts — never sends. Markdown `**bold**` is converted to `<strong>` so labels render bold in Gmail. Subject date is reformatted to `MM/DD/YYYY` from the YYYY-MM-DD CLI arg.

## Output template contract

`createCheckInFile.js` writes placeholders that the skill later replaces:
- `[workoutNotes]` — summarized workout performance prose
- `[workoutQuestions]` — questions extracted from the raw notes
- `(Replace with ...)` parenthetical hints — answered from the user's interactive responses

`examples/example-1.md` and `example-2.md` are the few-shot references for tone and level of detail in the summary. `templates/email.md` is the outer email format the final output gets pasted into.
