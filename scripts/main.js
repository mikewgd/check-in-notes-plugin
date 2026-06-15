#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAppsScript } from "./runAppScript.js";
import { getLogData } from './getSheet.js';
import { createMDFile } from './createCheckInFile.js';

const inputArg = process.argv[2];

async function getDateRange(inputDate) {
  const startDate = new Date(inputDate);
  const endDate = new Date(inputDate);
  const formatDate = (date) => date.toISOString().split('T')[0];
  const dateRangeArray = [];

  endDate.setUTCDate(inputDate.getUTCDate() - 1);
  startDate.setUTCDate(inputDate.getUTCDate() - 7);

  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    dateRangeArray.push(formatDate(currentDate));
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  return dateRangeArray;
}

(async () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  dotenv.config({ path: path.resolve(__dirname, '../.env') });

  if (!inputArg) {
    console.error("Error: Please provide a date in YYYY-MM-DD format.");
    process.exit(1);
  }

  const inputDate = new Date(`${inputArg}T00:00:00Z`);

  if (isNaN(inputDate.getTime())) {
    console.error("Error: Invalid date format. Please use YYYY-MM-DD.");
    process.exit(1);
  }

  console.log('Calculating date range');
  const dates = await getDateRange(inputDate);  
  const appsScript = await runAppsScript();

  if (appsScript.success && dates.length === 7) {
    console.log('Retrieving Google Sheet');
    const logs = await getLogData(dates);
    
    if (!logs.success || logs.data.length < 1) {
      return { success: false, data: `There was an error with grabbing the logs.`}
    }

    console.log('Creating MD file');
    const createdFile = await createMDFile(logs.data, inputArg);
    return { success: createdFile.success, data: createdFile.data}
  } else {
    return { success: false, data: `There was an error getting the date range and/or the Apps Script.` }
  }
})();