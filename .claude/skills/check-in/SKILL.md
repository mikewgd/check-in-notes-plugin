---
name: check-in
description: Generate a weekly workout check-in summary for the trainer. Takes a date (YYYY-MM-DD) representing the end of the week, runs the data pipeline, and produces a filled-in check-in markdown file ready to email.
allowed-tools: Bash, Read, Write, Edit
---

# /check-in

Invoked as `/check-in YYYY-MM-DD`. The date is the end of the check-in week (the script subtracts 1–7 days from it).

## Step 1 — Run the data pipeline

Run the Node script and pass the date through verbatim:

```bash
node scripts/main.js <DATE>
```

The script returns/prints `{success, data}`. If `success: false`, **stop and show `data` to the user** — do not continue. If the script throws or exits non-zero, surface stderr to the user and stop.

On success, the script has written `check-ins/<DATE>.md`.

## Step 2 — Read the inputs

Read three files:
- `check-ins/<DATE>.md` — extract the block between `## Data from Application:` and `## Output:`. Each line is `- <date> (<W#> <workout>: <exercise>) - <note>`.
- `examples/example-1.md` and `examples/example-2.md` — use these as few-shot guidance for tone, length, and what details to keep vs. drop in the summary. Match their style; don't invent a new one.

## Step 3 — Extract questions from the notes

Scan the workout notes for any explicit questions or things the user flagged to ask the trainer (look for `?`, phrases like "ask [TRAINER_NAME]", "should I", "is it ok to"). Collect them verbatim or lightly rephrased — these become `[workoutQuestions]`. If there are none, leave that placeholder removed (empty string, no "N/A").

## Step 4 — Summarize the workout performance

Write a single paragraph in the voice of the examples. It should cover:
- Notable form issues or wins
- Weight adjustments (went up, went down, felt too heavy/light)
- Exercises that were unusually tough or easy
- Any equipment/location anomalies (e.g. hotel gym)

Keep it concise — the examples are ~3-5 sentences. Don't list every exercise; synthesize. This becomes `[workoutNotes]`.

## Step 5 — Ask the user the follow-up questions

Ask all six together as a plain text prompt so the user can answer in one pass. Do not use `AskUserQuestion` — most of these are free-form (weight, HR, comments) and that tool requires 2–4 fixed options per question.

```
1. What is your fasted weight?
2. What was your appetite? (default - no issues)
3. What was your digestion? (default - no issues)
4. What was your average heart rate?
5. Were there any skips? (Provide cardio and lifting)
6. Any additional comments or questions?
```

Rules:
- All six must be answered before continuing.
- If the user answers `skip` for #2 or #3, use `No issues`.
- If the user answers `skip` for #5, use `No skips`.
- #6 appends to `[workoutQuestions]` from Step 3 — combine them into one block separated by a blank line, with the user's additional comment last. If both are empty, write `None.`

## Step 6 — Fill the file

Edit `check-ins/<DATE>.md` in place. The template `createCheckInFile.js` wrote has these slots:

| Placeholder | Replace with |
|---|---|
| `(Replace with fasted weight)` | answer to #1 |
| `(Replace with how appetite has been)` | answer to #2 (or `No issues`) |
| `(Replace with how digestion has been)` | answer to #3 (or `No issues`) |
| `(Replace with average heart rate)` | answer to #4 |
| `[workoutNotes]` | the summary from Step 4 |
| `(Replace if you missed any cardio and weight session and how many)` | answer to #5 (or `No skips`) |
| `[workoutQuestions]` + `(Replace with any questions or comments)` | combined questions from Step 3 + answer to #6 |

Use exact-string Edit, not regex. Verify all placeholders are gone after the edit — if any remain, fix them before reporting success.

## Step 7 — Show the result

Read the finished `## Output:` block back to the user and tell them the file path.

## Step 8 — Create the Gmail draft

Run:

```bash
node scripts/draftEmail.js <DATE>
```

This reads `check-ins/<DATE>.md`, wraps the `## Output:` block in `templates/email.md`, and creates a draft in the user's Gmail. It only **creates** the draft — it never sends. The script prints `{success, data}`. Surface `data` either way (draft id on success, error message on failure). If `gmail-token.json` is missing or expired, the script will fail — tell the user to re-run `node scripts/auth.js`.
