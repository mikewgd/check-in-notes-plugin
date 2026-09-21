export async function convertCSVtoJSON(data) {
  let finalObj = { rows: [] };

  if (!data || data.length === 0) {
    return {
      success: false,
      data: `There is no data.`
    }
  }

  const [ headers ] = data;
  const rows = data.slice(1);
  
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

// Apps Script sometimes returns dates as "M/D/YY" before the YYYY-MM-DD
// format finishes applying — normalize both shapes to YYYY-MM-DD.
export function normalizeDate(s) {
  if (typeof s !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, mo, d, y] = m;
  const yyyy = y.length === 2 ? `20${y}` : y;
  return `${yyyy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
};