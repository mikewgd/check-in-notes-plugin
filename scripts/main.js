#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLogData } from './getLogData.js';
import { createMDFile } from './createCheckInFile.js';
import { getDateRange } from './helpers.js'

const inputArg = process.argv[2];
const SOURCE = 'API';

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

  if (dates.length === 7) {
    console.log('Retrieving log data');
    const logs = await getLogData(dates, SOURCE);
    
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