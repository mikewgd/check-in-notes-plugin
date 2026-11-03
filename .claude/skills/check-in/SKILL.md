---
name: check-in
description: Generate a weekly workout check-in summary for the trainer. Takes a date (YYYY-MM-DD) representing the end of the week, runs the data pipeline, and produces a filled-in check-in markdown file ready to email.
allowed-tools: Bash, Read, Write, Edit
---

# /check-in

Invoked as `/check-in YYYY-MM-DD`, or `/check-in YYYY-MM-DD demo [weight] [avg-HR]` for demo mode (see below). The date is the end of the check-in week (the script subtracts 1–7 days from it).

## Demo mode

If the second argument is `demo`, run this faster flow for live demos: fewer round trips and no waiting on the user. Any further arguments are the fasted weight and average heart rate, in that order (e.g. `/check-in 2026-10-30 demo 170 150`). Everything not listed in the table is unchanged.

| Step | Demo-mode override |
|---|---|
| 1 | Pass **only the date** (the first argument) to `main.js`. |
| 2 | Read **only** `check-ins/<DATE>.md`. Don't read or list `resources/` — use the cheat sheet below. |
| 4 | The summary is 2–3 sentences, not 4–7. Same first-person voice and same report-don't-diagnose rule. |
| 5 | Don't ask the six questions. Take weight and HR from the arguments; if either is missing, ask for just those two in a single line and wait. Use fixed defaults for the rest: appetite `No issues`, digestion `No issues`, skips `No skips`, no additional comment (so Step 3's questions alone fill the questions block, or `None.` if there are none). |
| 6 | Skip the preview/approval loop. |
| 7 | Use exactly two Edits, one after the other, on these contiguous spans (they hold every placeholder): <br>**Edit 1** `old_string` = the lines `**Fasted weight** = (Replace with fasted weight)`, `**Appetite** = (Replace with how appetite has been)`, `**Digestion** = (Replace with how digestion has been)`, `**Workout performance**`, then `Avg HR (Replace with average heart rate). [workoutNotes]`. <br>**Edit 2** `old_string` = the lines `(Replace if you missed any cardio and weight session and how many)`, `**Any questions or comments?**`, then `(Replace with any questions or comments) [workoutQuestions]`. <br>Keep the bold label lines in each `new_string`. Skip the placeholder grep: an Edit fails if its `old_string` doesn't match, so a successful Edit means those placeholders are gone. |
| 8 | Don't re-read the file. Print the summary, the questions block, and the file path from what you wrote. |
| 9 | Run `node scripts/draftEmail.js <DATE> demo`. The `demo` flag creates the draft with **no `To:` address** and a generic greeting (`Hey there,` instead of the trainer's name). It's still a real Gmail draft; surface `data` as usual. |

### RPE cheat sheet (demo mode only)

Condensed from `resources/*.md`, which stays the source of truth — update this if those change.

- RPE 10 = 0 reps left (failure); 9.5 = 0–1 left; 9 = 1 left; 8.5 = 1–2 left; 8 = 2 left; 7 = 3 left. Most sets are meant to sit around RPE 7–8; 9.5–10 is near-failure effort.
- Patterns worth surfacing (state them, don't explain them): RPE climbing across sets at the same weight; weight going up while RPE holds, or the same weight feeling easier than before; sets at 9.5–10, especially recurring across exercises; RPE spiking on exercises done late in a session.

## Step 1 — Run the data pipeline

Run the Node script and pass the date (the first argument only — see Demo mode):

```bash
node scripts/main.js <DATE>
```

The script returns/prints `{success, data}`. If `success: false`, **stop and show `data` to the user** — do not continue. If the script throws or exits non-zero, surface stderr to the user and stop.

On success, the script has written `check-ins/<DATE>.md`.

## Step 2 — Read the inputs

Read:
- `check-ins/<DATE>.md` — extract the block between `## Data from Application:` and `## Output:`. It's organized per workout day: `### <workout> (<date>)`, a `**Notes:** <workout-level note>` line, a Hevy link, then per exercise a `**<exercise name>**` heading, an italicized `_<exercise note>_` line, and a `- Set <N> = <reps> reps / <weight>lbs / <rpe> rpe` line per set.
- `resources/*.md` — RPE reference material (what the RPE scale means, the RIR translation matrix, and how to analyze performance trends with RPE). Use this as the analytical framework for Step 4.

## Step 3 — Extract questions from the notes

Scan both the workout-level notes and each exercise's note for any explicit questions or things the user flagged to ask the trainer (look for `?`, phrases like "ask [TRAINER_NAME]", "should I", "is it ok to"). Extract just the question itself — strip addressee/framing preambles like "Ask [TRAINER_NAME] if..." or "Ask [TRAINER_NAME]:" so only the actual question remains (e.g. "Ask [TRAINER_NAME] if there is an alternative exercise for rear delt cable fly?" becomes "Is there an alternative exercise for rear delt cable fly?"). These become `[workoutQuestions]`. If there are none, leave that placeholder removed (empty string, no "N/A").

## Step 4 — Summarize the workout performance

Write a single paragraph (roughly 4-7 sentences) synthesizing the whole week. **Write it in the user's own voice, first person, as if they were typing a quick note to their trainer** — "I cut the drop sets", "my form wasn't good on...", "that felt easier than last time". Never refer to "the user" or write like a third-party report ("Three sessions were logged...", "Notes describe..."). Keep it casual and conversational: plain words, contractions are fine, no stiff phrasing like "landed at", "noted as", or "in the data". Open with a plain statement of which sessions were done (e.g. "Only legs, chest and back were done this week."). Use the RPE scale and RIR translation matrix from `resources/*.md` as vocabulary to describe what happened in the data — **report patterns, don't diagnose them**. The trainer draws the conclusions (fatigue vs. progress vs. programming issue); the summary's job is to surface the notable data points so he can. In particular look for and state, neutrally:
- **RPE movement across sets at the same weight** (e.g. "RPE rose from 8.5 to 9.5 across two sets") without labeling it as fatigue, overtraining, or any other cause.
- **Weight changes alongside RPE** (e.g. "weight increased from 35 to 50lbs while RPE held at 7") without characterizing it as good/bad progression.
- **Sets landing at RPE 9.5–10** — worth noting factually as near-failure effort, especially if it recurs across multiple exercises.
- Notable form/control issues, equipment or location anomalies (e.g. crowded gym, subbed machines), and exercises that were unusually tough or easy — as reported in the notes, not inferred.

Don't list every exercise or every set — synthesize into the most notable data points across the week, stated as observations rather than conclusions. This becomes `[workoutNotes]`.

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
- #6 combines with `[workoutQuestions]` from Step 3 into a single block, each item on its own line with a single line break between them (no blank lines), with the user's additional comment last. Number the items (`1.`, `2.`, `3.`, …) **only when there are two or more items, or a single item that is an actual question** — a lone comment (no question) is written as plain prose with no number. If both are empty, write `None.`

## Step 6 — Preview and get feedback

Before touching the file, show the user the two pieces of generated prose so they can revise them:
- the `[workoutNotes]` summary from Step 4
- the combined `[workoutQuestions]` block from Step 3 + #6

Present them as plain text and ask: "Here's the draft summary and questions — want any changes, or should I write the file?"

Loop on their feedback: apply requested edits to the summary/questions and re-show until the user approves (e.g. "looks good", "yes", "write it"). Only continue to Step 7 once they've approved. Do **not** write or edit the check-in file during this step.

## Step 7 — Fill the file

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

## Step 8 — Show the result

Read the finished `## Output:` block back to the user and tell them the file path.

## Step 9 — Create the Gmail draft

Run:

```bash
node scripts/draftEmail.js <DATE>
```

This reads `check-ins/<DATE>.md`, wraps the `## Output:` block in `templates/email.md`, and creates a draft in the user's Gmail. It only **creates** the draft — it never sends. The script prints `{success, data}`. Surface `data` either way (draft id on success, error message on failure). If `gmail-token.json` is missing or expired, the script will fail — tell the user to re-run `node scripts/auth.js`.
