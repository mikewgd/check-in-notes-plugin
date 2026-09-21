import { google } from 'googleapis';
import fs from 'node:fs/promises';
import path from 'node:path';
import process2 from 'node:process';

import { convertCSVtoJSON, normalizeDate, kgToLbs } from './helpers.js'

const sheets = google.sheets('v4');
const drive = google.drive('v3');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.metadata.readonly'
];
const CREDENTIALS_PATH = path.join(process2.cwd(), './secrets/credentials.json');

async function googAuth() {
  console.log('Authenticate with google');

  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: SCOPES,
  });
  return auth.getClient();
}

function cleaupCSVtoJSONData(data) {
  // TODO: Need to work on this.
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
    // TODO: Update since it will be CSV.
    q: `'${process.env.FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
    fields: 'files(id, name, createdTime)', 
  });

  const googDriveFiles = googDriveList.data.googDriveFiles;
  
  if (!googDriveFiles || googDriveFiles.length === 0) {
    return { success: false, data: `No CSV found in folder ID: ${process.env.FOLDER_ID}`}
  }

  console.log(`Targeting latest sheet: "${googDriveFiles[0].name}" (Created: ${googDriveFiles[0].createdTime})`);

  const latestCSVFileId = googDriveFiles[0].id;

  // TODO: Necessary since using a CSV?
  const googSheet = await sheets.spreadsheets.values.get({
    spreadsheetId: latestCSVFileId,
    auth,
    range: 'A:Z'
  });

  const jsonData = convertCSVtoJSON(googSheet.data);
  return { success: true, data: cleaupCSVtoJSONData(jsonData) };
}

async function callHevyApi() {
  const apiUrl = 'https://api.hevyapp.com/v1/workouts?page=1&page_size=10';
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

  return { success, data: finalData };
}