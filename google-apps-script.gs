const MEASUREMENTS_SHEET = "Внесенные измерения";
const LINKS_SHEET = "Добавленные ссылки";
const PROTOCOL_MONITORING_SHEET = "Мониторинг";

function doPost(e) {
  const payload = JSON.parse(e.postData.contents || "{}");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    if (payload.type === "measurement") {
      const warnings = [];
      appendMeasurement_(payload);

      try {
        appendProtocolMonitoring_(payload);
      } catch (error) {
        warnings.push("Protocol monitoring: " + error.message);
      }

      try {
        upsertMatrixMeasurements_(payload);
      } catch (error) {
        warnings.push("Matrix: " + error.message);
      }

      return json_({ ok: true, type: "measurement", warnings });
    }
    if (payload.type === "protocolLink") {
      appendProtocolLink_(payload);
      return json_({ ok: true, type: "protocolLink" });
    }
    return json_({ ok: false, error: "Unknown type" });
  } finally {
    lock.releaseLock();
  }
}

function appendProtocolMonitoring_(payload) {
  const protocolSpreadsheet = getProtocolSpreadsheet_(payload.protocol);
  if (!protocolSpreadsheet) return;

  const sheet = getOrCreateSheetInSpreadsheet_(protocolSpreadsheet, PROTOCOL_MONITORING_SHEET, [
    "Дата записи",
    "Образец",
    "Точка",
    "Дата измерения",
    "T, °C",
    "pH",
    "Вязкость",
    "Внешний вид",
    "Комментарий",
    "Лист Google Sheets",
    "Ссылка на протокол",
  ]);

  sheet.appendRow([
    new Date(),
    payload.sample || "",
    payload.point || "",
    payload.date || "",
    payload.temperature || "",
    payload.ph || "",
    payload.viscosity || "",
    payload.appearance || "",
    payload.note || "",
    payload.targetSheet || "",
    payload.protocol || "",
  ]);
}

function appendMeasurement_(payload) {
  const sheet = getOrCreateSheet_(MEASUREMENTS_SHEET, [
    "Дата записи",
    "Образец",
    "Точка",
    "Дата измерения",
    "T, °C",
    "Лист Google Sheets",
    "pH",
    "Вязкость",
    "Внешний вид",
    "Ссылка на протокол",
    "Комментарий",
  ]);
  sheet.appendRow([
    new Date(),
    payload.sample || "",
    payload.point || "",
    payload.date || "",
    payload.temperature || "",
    payload.targetSheet || "",
    payload.ph || "",
    payload.viscosity || "",
    payload.appearance || "",
    payload.protocol || "",
    payload.note || "",
  ]);
}

function upsertMatrixMeasurements_(payload) {
  if (!payload.targetSheet || !payload.temperature || !payload.date) return;
  const spreadsheet = getProtocolSpreadsheet_(payload.protocol) || SpreadsheetApp.getActive();
  if (payload.viscosity !== "" && payload.viscosity != null) {
    upsertMatrixValue_(spreadsheet, payload.targetSheet, payload.sample, payload.date, payload.temperature, "Вязкость, 05", payload.viscosity);
  }
  if (payload.ph !== "" && payload.ph != null) {
    upsertMatrixValue_(spreadsheet, payload.targetSheet, payload.sample, payload.date, payload.temperature, "рН", payload.ph);
  }
}

function upsertMatrixValue_(spreadsheet, sheetName, title, dateText, temperature, parameter, value) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);

  const range = sheet.getDataRange();
  const values = range.getValues();
  const displayValues = range.getDisplayValues();
  const date = normalizeDate_(dateText);
  const dateDisplay = Utilities.formatDate(date, Session.getScriptTimeZone(), "dd.MM.yyyy");

  let titleRow = 0;
  if (title) {
    const normalizedTitle = normalizeText_(title);
    for (let r = 0; r < displayValues.length; r++) {
      if (normalizeText_(displayValues[r].join(" ")).includes(normalizedTitle)) {
        titleRow = r;
        break;
      }
    }
  }

  const headerRow = findDateHeaderRow_(displayValues, titleRow, dateDisplay);
  const dateCol = findOrCreateDateColumn_(sheet, displayValues, headerRow, dateDisplay);
  const targetRow = findMatrixRow_(displayValues, titleRow, temperature, parameter);

  sheet.getRange(targetRow + 1, dateCol + 1).setValue(value);
}

function findDateHeaderRow_(displayValues, startRow, dateDisplay) {
  for (let r = startRow; r < Math.min(displayValues.length, startRow + 12); r++) {
    if (displayValues[r].some((cell) => normalizeDateDisplay_(cell) === dateDisplay)) return r;
  }
  for (let r = startRow; r < Math.min(displayValues.length, startRow + 12); r++) {
    if (displayValues[r].some((cell) => /дата|1 день|5 дней|нед|убрать/i.test(String(cell)))) return r;
  }
  return startRow + 1;
}

function findOrCreateDateColumn_(sheet, displayValues, headerRow, dateDisplay) {
  for (let c = 0; c < displayValues[headerRow].length; c++) {
    if (normalizeDateDisplay_(displayValues[headerRow][c]) === dateDisplay) return c;
  }
  const col = Math.max(displayValues[headerRow].length, 3);
  sheet.getRange(headerRow + 1, col + 1).setValue(dateDisplay);
  return col;
}

function findMatrixRow_(displayValues, startRow, temperature, parameter) {
  const temp = String(temperature).trim();
  const wantedParameter = normalizeText_(parameter);
  for (let r = startRow; r < displayValues.length; r++) {
    const row = displayValues[r];
    const rowTemp = String(row[0] || "").trim();
    const rowParameter = normalizeText_(row[1] || "");
    if (rowTemp === temp && rowParameter === wantedParameter) return r;
  }
  throw new Error("Matrix row not found for T=" + temperature + ", parameter=" + parameter);
}

function normalizeDate_(dateText) {
  if (dateText instanceof Date) return dateText;
  const text = String(dateText || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const ru = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (ru) return new Date(Number(ru[3]), Number(ru[2]) - 1, Number(ru[1]));
  throw new Error("Bad date: " + dateText);
}

function normalizeDateDisplay_(value) {
  const text = String(value || "").trim();
  const ru = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!ru) return text;
  return `${ru[1].padStart(2, "0")}.${ru[2].padStart(2, "0")}.${ru[3]}`;
}

function normalizeText_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function appendProtocolLink_(payload) {
  const sheet = getOrCreateSheet_(LINKS_SHEET, [
    "Дата записи",
    "Образец",
    "Ссылка на протокол",
    "Комментарий",
  ]);
  sheet.appendRow([
    new Date(),
    payload.sample || "",
    payload.url || "",
    payload.note || "",
  ]);
}

function getProtocolSpreadsheet_(protocolUrl) {
  const id = getSpreadsheetIdFromUrl_(protocolUrl);
  if (!id) return null;
  return SpreadsheetApp.openById(id);
}

function getSpreadsheetIdFromUrl_(url) {
  const match = String(url || "").match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function getOrCreateSheet_(name, headers) {
  const spreadsheet = SpreadsheetApp.getActive();
  return getOrCreateSheetInSpreadsheet_(spreadsheet, name, headers);
}

function getOrCreateSheetInSpreadsheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  return sheet;
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
