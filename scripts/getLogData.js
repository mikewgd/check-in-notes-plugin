import { google } from 'googleapis';
import fs from 'node:fs/promises';
import path from 'node:path';
import process2 from 'node:process';

import { convertCSVtoJSON, kgToLbs, formatDate } from './helpers.js'

// const sheets = google.sheets('v4');
const drive = google.drive('v3');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly'
];
const CREDENTIALS_PATH = path.join(process2.cwd(), './secrets/credentials.json');
const ENTRIES = 10;

async function googAuth() {
  console.log('Authenticate with google');

  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: SCOPES,
  });
  return auth.getClient();
}

function cleaupCSVtoJSONData(passedData) {
  const grouped = passedData.reduce((acc, current) => {
    const repCount = Number(current.reps);
    if (current.set_type !== 'normal' || repCount === 0) {
      return acc;
    }

    const workoutKey = `${current.title}_${current.start_time}`;

    // 1. Initialize Workout Level if it doesn't exist
    if (!acc[workoutKey]) {
      acc[workoutKey] = {
        workout: current.title,
        workoutId: '', 
        workoutNotes: current.description,
        date: current.start_time,
        exercisesMap: {}
      };
    }

    // Retrieve the workout object from acc
    const workout = acc[workoutKey];
    const exerciseKey = current.exercise_title;

    // 2. Initialize Exercise Level if it doesn't exist inside this workout
    if (!workout.exercisesMap[exerciseKey]) {
      workout.exercisesMap[exerciseKey] = {
        exerciseName: current.exercise_title,
        exerciseNote: current.exercise_notes,
        sets: []
      };
    }

    // 3. Push the Set data
    workout.exercisesMap[exerciseKey].sets.push({
      repCount: Number(current.reps),
      weight: Number(current.weight_lbs),
      rpe: Number(current.rpe)
    });

    return acc;
  }, {});

  const result = Object.values(grouped)
    .map(workout => ({
      workout: workout.workout,
      workoutId: workout.workoutId,
      workoutNotes: workout.workoutNotes,
      date: formatDate(workout.date),
      exercises: Object.values(workout.exercisesMap).filter(ex => ex.sets.length > 0)
    }))
    .filter(workout => workout.exercises.length > 0);

  return result;
}

function cleanUpApiData(data) {
  const { workouts } = data;
  const cleanedData = [];

  if (!workouts || workouts.length === 0) {
    return {
      success: false,
      data: `There is no data.`
    }
  }

  return workouts.map(({ title, description, start_time, id, exercises }) => ({
    workout: title,
    workoutId: id,
    workoutNotes: description, 
    date: start_time.split('T')[0],
    exercises: exercises.map(({ title: exerciseName, notes, sets }) => ({
      exerciseName,
      exerciseNote: notes,
      sets: sets.filter(i => i.type === 'normal' && i.reps > 0).map(({ weight_kg, reps, rpe }) => ({
        repCount: reps,
        weight: kgToLbs(weight_kg, 1),
        rpe,
      }))
    }))
  }));
}

async function callGoogApi() {
  const auth = await googAuth();

  console.log('Call Google Drive to list files.')

  const googDriveList = await drive.files.list({
    auth,
    pageSize: 1,
    orderBy: 'createdTime desc',
    q: `'${process.env.FOLDER_ID}' in parents and mimeType = 'text/csv' and trashed = false`,
    fields: 'files(id, name, createdTime)', 
  });

  const googDriveFiles = googDriveList.data.files;
  
  if (!googDriveFiles || googDriveFiles.length === 0) {
    return { success: false, data: `No CSV found in folder ID: ${process.env.FOLDER_ID}`}
  }

  console.log(`Targeting latest sheet: "${googDriveFiles[0].name}" (Created: ${googDriveFiles[0].createdTime})`);

  const latestCSVFileId = googDriveFiles[0].id;

  console.log(`Grabbing the file contents for ${googDriveFiles[0].name}`);

  const latestCSV = await drive.files.get({
    auth,
    fileId: latestCSVFileId, 
    alt: 'media',
    responseType: 'text'
  });

  const rawCsvText = latestCSV.data;
  const convertedToJSON = convertCSVtoJSON(rawCsvText);

  if (!convertedToJSON.success) {
    return { success: false, data: 'There was an issue parsing the CSV to JSON.' };
  }

  return { success: true, data: cleaupCSVtoJSONData(convertedToJSON.data) };
}

async function callHevyApi() {
  const apiUrl = `https://api.hevyapp.com/v1/workouts?page=1&page_size=${ENTRIES}`;
  const apiHeaders = {
    headers: {
      "api-key": process.env.HEVY_API_KEY,
      "accept": "application/json",
    }
  };

  const response = await fetch(apiUrl, apiHeaders);

  if (!response.ok) {
    return { success: false, data: `API Error: ${response.status} ${response.statusText}` };
  }

  const apiResult = await response.json();
  return { success: true, data: cleanUpApiData(apiResult) };
}


export async function getLogData(dateRange, source) {
  const wanted = new Set(dateRange);
  const { data, success } = source === 'API' ? await callHevyApi() : await callGoogApi();
  const finalData = [];


  if (success) {
    data.forEach(item => {
      if (wanted.has(item.date)) {
        finalData.push(item);
      }
    });
  }
  console.log(success, data)

  return { success, data: finalData };
}