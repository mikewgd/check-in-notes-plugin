# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Claude Code skill (`/check-in YYYY-MM-DD`) that generates weekly workout check-in summaries for the repo owner's trainer. The skill orchestrates a Node script that pulls Hevy workout logs (from either the Hevy REST API or a CSV export in Drive), filters them to the past week, and writes a markdown file at `check-ins/<date>.md` using `templates/email.md` as the output shape. After the file exists, the skill summarizes the `## Data from Application:` block (using `resources/*.md` RPE reference material as the analytical framework), extracts any questions the user flagged in their workout notes, asks the user a fixed set of follow-up questions, **previews the draft summary and questions for the user to revise/approve before writing**, fills in the placeholders, then creates a Gmail draft via `scripts/draftEmail.js`. See `docs/PLANNING.md` for the original design notes (written before the CSV/API split existed, so its data-source description is outdated — this file is the current source of truth).

## Running

End-users invoke the skill (`/check-in YYYY-MM-DD`) — it orchestrates the scripts. Direct invocations:

```bash
node scripts/main.js 2026-06-12       # build check-ins/<date>.md (input date is END of the week; script subtracts 1–7 days)
node scripts/draftEmail.js 2026-06-12 # create Gmail draft from check-ins/<date>.md
node scripts/auth.js                  # one-time Gmail OAuth flow; writes secrets/gmail-token.json
```

Requires `.env` at the repo root with `FOLDER_ID` (Drive folder containing the CSV export — only needed for the CSV source) and `HEVY_API_KEY` (Hevy API key — only needed for the API source). `draftEmail.js` also reads `TRAINER_EMAIL` (the draft's `To:`) and `TRAINER_NAME` (the greeting) from `.env`; it fails with a clear message if either is missing (demo mode doesn't need them). `secrets/credentials.json` is only needed for the CSV source (service account for Drive); `secrets/oauth-client.json` is needed for Gmail drafting regardless of source (see README). No build, lint, or test setup exists yet.

`.env` also carries `APP_URL`, `APP_KEY`, `PROJECT_ID` — these are leftovers from an earlier Apps-Script-based pipeline and are **no longer read by any script that main.js calls** (see "Legacy/unused code" below). Safe to ignore; don't treat their absence as an error.

## Demo mode

`/check-in YYYY-MM-DD demo [weight] [avg-HR]` (e.g. `/check-in 2026-10-30 demo 170 150`) runs a faster flow for live demos. It's defined in `.claude/skills/check-in/SKILL.md` ("Demo mode" section), plus a `demo` flag on `scripts/draftEmail.js`. Versus the normal flow it: skips reading `resources/` (uses an inline RPE cheat sheet instead), writes a 2–3 sentence summary, takes weight/HR from the arguments and defaults the other follow-ups (no questions asked), **skips the preview/approval step**, and fills the file with two Edits instead of one per placeholder. It still runs the real pipeline and creates a real Gmail draft, but via `node scripts/draftEmail.js <date> demo`, which **omits the `To:` address** (`TRAINER_EMAIL` is ignored) and swaps the `[TRAINER_NAME]` greeting for "Hey there,". The cheat sheet duplicates `resources/*.md` (the source of truth), so keep them in sync.

## Architecture

Two interchangeable data sources feed the same pipeline, both converging on one normalized shape (per-workout → per-exercise → per-set) documented in `mocks/dataStructure.json`:

1. **`main.js`** validates the input date, computes the 7-day window (`getDateRange`), then calls `getLogData(dates, SOURCE)` and `createMDFile`. `SOURCE` is a hardcoded constant at the top of `main.js` (currently `'API'`) — there's no CLI flag or env var to switch it at runtime. To use the CSV/Drive source instead of the Hevy API, edit that constant to anything other than `'API'` (e.g. `'CSV'`).
2. **`getLogData.js`** contains both source implementations and picks one based on `source === 'API'`:
   - **API path (`callHevyApi`)** — calls the Hevy app's own REST API (`https://api.hevyapp.com/v1/workouts`) directly with `HEVY_API_KEY`, fetching a single page of the most recent workouts (`ENTRIES = 10`, no pagination loop — if more than 10 workouts have happened since the last check-in, older ones fall off). `cleanUpApiData` reshapes the response into `{workout, workoutId, workoutNotes, date, exercises: [{exerciseName, exerciseNote, sets: [{repCount, weight, rpe}]}]}`, filtering sets to `type === 'normal'` with `reps > 0` and converting `weight_kg` to lbs via `kgToLbs`. Because this hits Hevy directly, `workoutId` is populated and `createCheckInFile.js` uses it to build `https://hevy.com/workout/<id>` links.
   - **CSV path (`callGoogApi`)** — authenticates with `secrets/credentials.json` (a **service account**, via `GoogleAuth.getClient()` — don't pass the `GoogleAuth` wrapper directly to API methods or you'll get `authClient.request is not a function`), uses Drive's `files.list` to find the most recently created CSV in `FOLDER_ID`, downloads its raw contents with `drive.files.get({alt: 'media'})`, and parses it with `convertCSVtoJSON` (in `helpers.js`, wraps `csv-parse`). `cleaupCSVtoJSONData` groups the flat CSV rows (keyed by `title` + `start_time`, then by `exercise_title`) into the same nested shape, filtering to `set_type === 'normal'` with `reps > 0`. There's no Hevy id in a CSV export, so `workoutId` is always `''` and no workout link is generated.
   - `getLogData(dateRange, source)` runs whichever fetcher, then filters the returned workouts down to those whose `date` falls in `dateRange`.
3. **`createCheckInFile.js`** writes `check-ins/<date>.md` via `populateTemplate`. `createLogList` walks the nested workout/exercise/set data into `### <workout> (<date>)` sections with a `**Notes:**` line (plus a Hevy link when `workoutId` is set), then per exercise a `**<name>**` heading, an italicized `_<note>_` line, and one `- Set <N> = <reps> reps / <weight>lbs / <rpe> rpe` line per set. Collected workout links are also appended to the "Workout performance" line in the `## Output:` section. The `check-ins/` directory must exist before `main.js` runs — `fs.writeFile` won't create it.

Every async function returns `{success: boolean, data: <result-or-message>}`. The skill surface (per `docs/PLANNING.md`) shows `data` to the user on failure.

### Legacy/unused code

- **`scripts/runAppScript.js`** is dead code — it implements the old flow (POST to a deployed Google Apps Script web-app, gated by `APP_KEY`/`APP_URL`, that converted the latest CSV in `FOLDER_ID` into a cleaned Google Sheet). `main.js` no longer imports or calls it now that `getLogData.js`'s CSV path reads the Drive CSV directly. It's kept in the repo but not wired into the pipeline; don't assume it runs.
- **`getSheet.js`** and the Sheets-API read path it used to implement no longer exist — superseded by `getLogData.js`.
- **`examples/`** (few-shot summary examples) no longer exists — superseded by `resources/*.md` (RPE scale reference, RIR translation matrix, and guidance on analyzing performance trends with RPE), which the skill now uses as its analytical framework in the summarization step instead of few-shot examples.
- **`mocks/`** (`dataStructure.json` — an annotated example of the normalized shape both source paths produce) is reference/documentation only, not imported by any script. A sample raw Hevy API response used to live here as `api.json` but was removed because it held real workout data; see Hevy's API docs for the raw shape.

## Permissions

`.claude/settings.json` (checked in) holds a scoped `permissions.allow` list so the skill runs without prompting: `Edit`/`Write` under `check-ins/**` and `Bash(node scripts/main.js:*)` / `Bash(node scripts/draftEmail.js:*)`. Note `allowed-tools` in the skill frontmatter only gates *which* tools the skill may use — it does not auto-approve them; that's what this allowlist is for. `scripts/auth.js` is deliberately not allowlisted. Permission settings load at session start, so edits here take effect next session.

## Secrets

All credential files live in `secrets/` (gitignored as a folder):
- `secrets/credentials.json` — service account key for Drive access, only needed when using the CSV source (see Service account auth below)
- `secrets/oauth-client.json` — OAuth 2.0 client for Gmail draft creation (Desktop app type, downloaded from Cloud Console)
- `secrets/gmail-token.json` — refresh token produced by `scripts/auth.js`; recreate by re-running that script if it expires (sensitive scopes in Testing mode expire after 7 days)

## Service account auth

`secrets/credentials.json` is a Google service account key (`[SERVICE_ACCOUNT_EMAIL]`), only used by the CSV source in `getLogData.js`. For the Drive calls to succeed, the **target folder must be shared with that email**.

`authorize()`/`googAuth()` uses `GoogleAuth.getClient()` — calling code must not pass the `GoogleAuth` wrapper directly to API methods or you'll get `authClient.request is not a function`.

## Gmail draft (scripts/auth.js + scripts/draftEmail.js)

`draftEmail.js` reads `check-ins/<date>.md`, extracts the `## Output:` block, wraps it in `templates/email.md` (SUBJECT/BODY with `[date]`, `[TRAINER_NAME]` and `[output]` placeholders — keep them unescaped, since some Markdown editors turn `[x]` into `\[x\]`, which stops the `.replace` calls from matching), and creates a draft via `gmail.users.drafts.create`, addressed to `TRAINER_EMAIL` from `.env`. It only **creates** drafts — never sends. Markdown `**bold**` is converted to `<strong>` so labels render bold in Gmail. Subject date is reformatted to `MM/DD/YYYY` from the YYYY-MM-DD CLI arg.

## Output template contract

`createCheckInFile.js` writes placeholders that the skill later replaces:
- `[workoutNotes]` — summarized workout performance prose
- `[workoutQuestions]` — questions extracted from the raw notes
- `(Replace with ...)` parenthetical hints — answered from the user's interactive responses

`resources/*.md` are the reference material for the RPE-based analytical framework used in the summary (see `.claude/skills/check-in/SKILL.md` Step 4 — report patterns from the data, don't diagnose them). `templates/email.md` is the outer email format the final output gets pasted into.
