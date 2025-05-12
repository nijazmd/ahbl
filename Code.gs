// 🔄 Reusable function: Append row to any sheet based on column headers
function appendRowByHeaders(sheetName, inputData) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = [];

  headers.forEach(header => {
    row.push(header in inputData ? inputData[header] : "");
  });

  sheet.appendRow(row);
}

// ✅ Handles submissions to AHbL_Data using header-based mapping
function doPost(e) {
  try {
    const input = e.parameter;
    input["Notes"] = input["Comments"] || ""; // Map Comments to Notes
    appendRowByHeaders("AHbL_Data", input);

    return ContentService.createTextOutput("✅ Success: Data submitted.")
                         .setMimeType(ContentService.MimeType.TEXT);
  } catch (error) {
    return ContentService.createTextOutput("❌ Error: " + error.message)
                         .setMimeType(ContentService.MimeType.TEXT);
  }
}

// 🔁 Optional: Handles adding new task metadata to TasksMeta
function doPostTask(e) {
  try {
    const input = e.parameter;
    appendRowByHeaders("TasksMeta", input);

    return ContentService.createTextOutput("✅ Task added.")
                         .setMimeType(ContentService.MimeType.TEXT);
  } catch (error) {
    return ContentService.createTextOutput("❌ Error adding task.")
                         .setMimeType(ContentService.MimeType.TEXT);
  }
}

// 🔍 Expose all rows from AHbL_Data as JSON
function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("AHbL_Data");
  const data = sheet.getDataRange().getValues();

  if (data.length < 2) {
    return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
  }

  const headers = data[0];
  const rows = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });

  return ContentService.createTextOutput(JSON.stringify(rows))
                       .setMimeType(ContentService.MimeType.JSON);
}

// 🔒 Submission limiting: Max 25 per day
function incrementSubmissionCount() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `submissionCount_${today}`;

  const count = parseInt(scriptProperties.getProperty(key)) || 0;
  if (count >= 25) return false;

  scriptProperties.setProperty(key, count + 1);
  return true;
}

// 🧹 Clears daily submission limits
function resetSubmissionCountDaily() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const allProps = scriptProperties.getProperties();

  for (let key in allProps) {
    if (key.startsWith("submissionCount_")) {
      scriptProperties.deleteProperty(key);
    }
  }
}

// 💾 Create daily backup of the spreadsheet
function backupSheet() {
  const sourceFile = SpreadsheetApp.getActiveSpreadsheet();
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const folderId = '1yWHHtRPSwpLF4eLDYyhFtyJ1DsFSf2eY'; // Replace with your backup folder's ID
  const backupName = `${sourceFile.getName()} Backup - ${date}`;

  DriveApp.getFileById(sourceFile.getId()).makeCopy(backupName, DriveApp.getFolderById(folderId));
}
