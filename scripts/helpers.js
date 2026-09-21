import { parse } from 'csv-parse/sync';

export function convertCSVtoJSON(csvString) {
  if (!csvString) {
    return { success: false };
  };

  try {
    console.log('Converting CSV to JSON');
    // 'columns: true' automatically treats the first row as headers 
    // and turns every following row into a clean JavaScript object!
    // 'skip_empty_lines: true' cleans up trailing blank lines.
    const records = parse(csvString, {
      columns: true,
      skip_empty_lines: true,
      trim: true // Automatically cleans up spaces around values
    });

    return { success: true, data: records };
  } catch (error) {
    console.log(`CSV Parse: ${error.message}`);
    return { success: false };
  }
}

export function kgToLbs(kg, decimals = 2) {
  if (typeof kg !== "number" || isNaN(kg)) {
    throw new TypeError("Input must be a valid number");
  }

  const lbs = kg * 2.20462262185;
  return Number(lbs.toFixed(decimals));
};

export async function getDateRange(inputDate) {
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

export function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}