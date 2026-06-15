export async function runAppsScript() {
  const payload = {
    secretKey: process.env.APP_KEY,
  };

  console.log('Running Google AppsScript to cleanup file.');

  try {
    const response = await fetch(process.env.APP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { success: false, data: `HTTP error! Status: ${response.status}` }
    }

    const data = await response.json();
    return { success: true, data: `Response from apps script: ${data}`}
  } catch (error) {
    return { success: false, data: `Error running Apps Script: ${error}`}
  }
}