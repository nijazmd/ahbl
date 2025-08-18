// 🔄 Map an object into a row by header order
function rowFromHeaders_(sheet, obj) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return headers.map(h => (h in obj ? obj[h] : ""));
}

// 🧹 Keep only header row (clear all below)
function clearAllDataRows_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
}

// ✍️ Write exactly one row to a sheet (row 2), replacing any previous data
function writeSingleRowByHeaders(sheetName, obj) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  clearAllDataRows_(sheetName);
  const row = rowFromHeaders_(sheet, obj);
  sheet.getRange(2, 1, 1, row.length).setValues([row]);
}

// ➕ Append a row to a sheet by headers (for final submissions)
function appendRowByHeaders(sheetName, obj) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const row = rowFromHeaders_(sheet, obj);
  sheet.appendRow(row);
}

// ✅ Main POST: supports Mode=save|submit
function doPost(e) {
  try {
    const input = e.parameter || {};
    const mode = (input["Mode"] || "submit").toLowerCase();

    // Normalize fields used in both modes
    input["Notes"] = input["Comments"] || ""; // Comments -> Notes

    if (mode === "save") {
      // One draft only: overwrite AHbL_Drafts with a single row
      writeSingleRowByHeaders("AHbL_Drafts", input);
      return ContentService.createTextOutput("💾 Draft saved.")
        .setMimeType(ContentService.MimeType.TEXT);
    }

    if (mode === "submit") {
      // Write final row
      appendRowByHeaders("AHbL_Data", input);
      // Clear the single draft
      clearAllDataRows_("AHbL_Drafts");
      return ContentService.createTextOutput("✅ Success: Data submitted.")
        .setMimeType(ContentService.MimeType.TEXT);
    }

    return ContentService.createTextOutput("⚠️ Unknown mode.")
      .setMimeType(ContentService.MimeType.TEXT);

  } catch (err) {
    return ContentService.createTextOutput("❌ Error: " + err.message)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

// 🔍 GET: defaults to AHbL_Data, pass ?sheet=AHbL_Drafts to fetch the single draft
function doGet(e) {
  const sheetName = (e && e.parameter && e.parameter.sheet) ? e.parameter.sheet : "AHbL_Data";
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();

  if (data.length < 2) {
    return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
  }

  const headers = data[0];
  const rows = data.slice(1).map(r => {
    const o = {};
    headers.forEach((h, i) => o[h] = r[i]);
    return o;
  });

  return ContentService.createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON);
}

// (Optional helpers you had)
function incrementSubmissionCount() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const today = new Date().toISOString().slice(0, 10);
  const key = `submissionCount_${today}`;
  const count = parseInt(scriptProperties.getProperty(key)) || 0;
  if (count >= 25) return false;
  scriptProperties.setProperty(key, count + 1);
  return true;
}
function resetSubmissionCountDaily() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const allProps = scriptProperties.getProperties();
  for (let key in allProps) {
    if (key.startsWith("submissionCount_")) scriptProperties.deleteProperty(key);
  }
}
function backupSheet() {
  const sourceFile = SpreadsheetApp.getActiveSpreadsheet();
  const date = new Date().toISOString().slice(0, 10);
  const folderId = '1yWHHtRPSwpLF4eLDYyhFtyJ1DsFSf2eY';
  const backupName = `${sourceFile.getName()} Backup - ${date}`;
  DriveApp.getFileById(sourceFile.getId()).makeCopy(backupName, DriveApp.getFolderById(folderId));
}
