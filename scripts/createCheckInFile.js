import fs from 'node:fs/promises';
import path from 'node:path';
import process2 from 'node:process';

const populateTemplate = (date, logs) => `# Check-in for ${date}

## Data from Application:
${logs}
## Output:
**Fasted weight** = (Replace with fasted weight)
**Appetite** = (Replace with how appetite has been)
**Digestion** = (Replace with how digestion has been)
**Workout performance**
Avg HR (Replace with average heart rate). [workoutNotes] 
**Did you miss any cardio sessions, meals or weight sessions? If so, how many?**
(Replace if you missed any cardio and weight session and how many)
**Any questions or comments?**
(Replace with any questions or comments) [workoutQuestions]`;

async function createLogList(data) {
  const weekRegex = /\bW\d+/;
  let output = '';

  const getWorkoutName = (exercise, workout) => {
    let name = '';

    data.filter(i => {
      if (i.workout.trim() === workout) {
        const match = i.exercise.match(weekRegex);

        if (match) {
          const weekCode = match[0];
          name = `${weekCode} ${workout.trim()}`;
          return;
        }
      }
    });

    return name;
  }

  data.map(({ date, note, workout, exercise}) => {
    let workoutName = getWorkoutName(exercise, workout);
    let exerciseName = exercise.replace(weekRegex, '').trim();
    output += `- ${date.trim()} (${workoutName}: ${exerciseName}) - ${note.trim()}\n`
  })

  return output;
}

export async function createMDFile(data, date) {
  const mdPath = path.join(process2.cwd(), `./check-ins/${date}.md`);
  const logs = await createLogList(data);

  try {
    await fs.writeFile(mdPath, populateTemplate(date, logs));
    return { success: true, data: 'File written successfully!'}
  } catch (error) {
    return { success: false, data: 'Failed to write file!' };
    
    if (error.code === 'ENOENT') {
      return { success: false, data: `Error: The directory leading to ${filePath} does not exist.` };
    } else if (error.code === 'EACCES') {
      return { success: false, data: 'Error: Permission denied. Node cannot write to this directory.' };
    } else {
      return { success: false, data: `System Error Details: ${error.message}` };
    }
  }
  
}