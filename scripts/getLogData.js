import { google } from 'googleapis';
import fs from 'node:fs/promises';
import path from 'node:path';
import process2 from 'node:process';

const sheets = google.sheets('v4');
const drive = google.drive('v3');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.metadata.readonly'
];
const CREDENTIALS_PATH = path.join(process2.cwd(), './secrets/credentials.json');

async function authorize() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: SCOPES,
  });
  return auth.getClient();
}

async function getLatestSheetId(folderId) {
  const auth = await authorize();

  const response = await drive.files.list({
    auth,
    pageSize: 1,
    orderBy: 'createdTime desc',
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
    fields: 'files(id, name, createdTime)', 
  });

  const files = response.data.files;
  
  if (!files || files.length === 0) {
    return { success: false, data: `No spreadsheets found in folder ID: ${folderId}`}
  }

  console.log(`Targeting latest sheet: "${files[0].name}" (Created: ${files[0].createdTime})`);
  return { success: true, data: files[0].id };
}

async function transformData(data) {
  const { values } = data;

  if (!values || values.length === 0) {
    return {
      success: false,
      data: `There is no data.`
    }
  }

  const [ headers ] = values;
  const rows = values.slice(1);
  const valueTransformer = value => {
    let val = value;

    if (!isNaN(val) && val.trim() !== '') {
      return parseFloat(value);
    }
    if (value) {
      val = value;
    }
    return val;
  };
  
  let finalObj = {
    rows: [],
  };

  console.log('Transforming CSV into JSON');

  rows.forEach((i, index) => {
    let row = {};
    headers.forEach((h, hIndex) => { 
      row[h] = valueTransformer(i[hIndex]); 
    });
    finalObj.rows.push(row);
  });

  return finalObj;
}

async function getSheetValues(sheetId, range = 'A:Z') {
  const auth = await authorize();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    auth,
    range: range
  });

  return transformData(res.data);
}

// Apps Script sometimes returns dates as "M/D/YY" before the YYYY-MM-DD
// format finishes applying — normalize both shapes to YYYY-MM-DD.
const normalizeDate = (s) => {
  if (typeof s !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, mo, d, y] = m;
  const yyyy = y.length === 2 ? `20${y}` : y;
  return `${yyyy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

export async function getLogData(dateRange) {
  const dynamicSheetId = await getLatestSheetId(process.env.FOLDER_ID);
  const data = await getSheetValues(dynamicSheetId.data);
  const rows = data.rows;
  const wanted = new Set(dateRange);
  const finalRows = [];

  rows.forEach(({ Date, Workout, Exercise, Notes }) => {
    const normalized = normalizeDate(Date);
    if (normalized && wanted.has(normalized)) {
      finalRows.push({
        date: normalized,
        workout: Workout,
        exercise: Exercise,
        note: Notes,
      });
    }
  });

  return { success: true, data: finalRows };
}