# check-in-notes-plugin
Every week I send my trainer my checkin for the week. Most of the details in the email I send to him are pretty easy. However the “workout performance” seems to take the most amount of time because I need to go through my workouts and see what I have done.

So I thought it would be cool if I could use AI to summarize and provide me with an update.

## Steps:

1. User will open this repository.
1. In Terminal run `claude`
1. In Terminal run `/check-in 2026-06-12`, which will kick off the skill.
    - Skill can only be run via slash command
    - Skill will have Read, Write and Bash access.
1. The skill will pass the date to a node script (`node scripts/main.js 2026-06-12`). The script file will do the following:
    - Handle the formatting and validation of the date.
    - Get an array of dates needed for logs
    - Trigger a Google Apps Script that will convert the latest file into a Google Sheet from a CSV and remove all irrelevant columns and rows
    - Call Google API to get the latest Google Sheet in the directory and convert it into a JSON and only return the logs for the dates found in the array of dates.
    - Create an md file in `/check-ins/YYYY-MM-DD.md` including all the necessary log information under `## Data from Application:` in a specific format for the skill to use.
    - The script will return `{ success: false, data: ...}` if there is an issue. The `data` property would be a message on what the error is. The skill should display to the user if there is an error.
    - The script will return `{ success: true, data... }` if it was successful.
1. If the script returns `{ success: true, data: ... }` that means everything was successful and the skill should continue to the next step automatically.
1. The skill will then read the `/check-ins` directory to find the file name that matches the date inputted by the user.
1. Once the skill has the file it will read all the information under `## Data from Application:`.
1. In order to provide context, the SKILL will be provided with 2 examples which include the raw data and output from `/examples` folder in order to understand the direction of summarizing the notes.
1. Using the examples as a guide, the skill will prepare a summary based off all the data provided (files in `/examples` and the content found under `## Data from Application:`). It will also gather any questions found within the notes to be saved for later.
1. The skill will then prompt the user with this 
    ```
    1. What is your fasted weight?
    2. What was your appetite? (default - no issues)
    3. What was your digestion? (default - no issues)
    4. What was your average heart rate?
    5. Were there any skips? (Provide cardio and lifting)
    6. Any additional comments or questions?
    ```
    - If the user puts `skip` the default will be used.
    - All questions must be answered.
    - See files in `/examples` as reference for the type of information.
1. The skill will then write to the file and replace `[workoutNotes]` with summarized notes in the same file and replace `[workoutQuestions]` with the questions found in the same file. And also replace the other content with the answers to questions provided by the user.
