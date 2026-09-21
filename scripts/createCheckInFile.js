import fs from 'node:fs/promises';
import path from 'node:path';
import process2 from 'node:process';

const populateTemplate = (date, { links, logs }) => `# Check-in for ${date}

## Data from Application:
${logs}
## Output:
**Fasted weight** = (Replace with fasted weight)
**Appetite** = (Replace with how appetite has been)
**Digestion** = (Replace with how digestion has been)
**Workout performance**
Avg HR (Replace with average heart rate). [workoutNotes] ${links.join(', ')}
**Did you miss any cardio sessions, meals or weight sessions? If so, how many?**
(Replace if you missed any cardio and weight session and how many)
**Any questions or comments?**
(Replace with any questions or comments) [workoutQuestions]`;

async function createLogList(data) {
  let finalOutput = '';
  let workoutLinks = [];

  data.map(({ workout, workoutId, workoutNotes, date, exercises }) => {
    if (workoutId !== '') {
      workoutLinks.push(`${workout.replace(/\bW\d+/, '').trim()}: https://hevy.com/workout/${workoutId}`);
    }

    finalOutput += `
### ${workout} (${date})
**Notes:** ${workoutNotes}${workoutId !== '' ? `\nhttps://hevy.com/workout/${workoutId}` : ``}

${exercises.map(({ exerciseName, exerciseNote, sets }) => `
**${exerciseName}**
_${exerciseNote}_
${sets.map(({ repCount, weight, rpe }, index) => `
- Set ${index + 1} = ${repCount} reps / ${weight}lbs / ${rpe} rpe`).join('\n')}
`).join('')}`
  });

  return { logs: finalOutput, links: workoutLinks };
}

export async function createMDFile(data, date) {
  const mdPath = path.join(process2.cwd(), `./check-ins/${date}.md`);
  const workoutData = await createLogList(data);

  try {
    await fs.writeFile(mdPath, populateTemplate(date, workoutData));
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