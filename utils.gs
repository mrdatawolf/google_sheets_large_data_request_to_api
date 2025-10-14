/**
 * Shared utilities (string/CSV safety, arrays, folders, debugging).
 */

function mapPickFields_(arr, fields) {
  var out = new Array(arr.length);
  for (var i = 0; i < arr.length; i++) out[i] = pickFields_(arr[i], fields);
  return out;
}

function pickFields_(obj, fields) {
  var out = {};
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    var has = obj && Object.prototype.hasOwnProperty.call(obj, f);
    var v = has ? obj[f] : '';
    out[f] = (v == null) ? '' : v;
  }
  return out;
}

function toTrimmedRow_(row) {
  var out = new Array(row.length);
  for (var i = 0; i < row.length; i++) {
    var cell = row[i];
    out[i] = (cell && cell.trim) ? cell.trim() : cell;
  }
  return out;
}

function indexOf_(arr, value) {
  for (var i = 0; i < arr.length; i++) if (arr[i] === value) return i;
  return -1;
}

function contains_(arr, value) {
  for (var i = 0; i < arr.length; i++) if (arr[i] === value) return true;
  return false;
}

function getOrCreateFolderPath_(path) {
  var parts = path.split('/').filter(function (x) { return x; });
  var folder = DriveApp.getRootFolder();
  for (var i = 0; i < parts.length; i++) {
    var it = folder.getFoldersByName(parts[i]);
    folder = it.hasNext() ? it.next() : folder.createFolder(parts[i]);
  }
  return folder;
}

/** Decode response to UTF‑8 and normalize newlines / BOM for CSV/JSON safety */
function safeGetText_(resp) {
  var bytes = resp.getContent();
  var text = Utilities.newBlob(bytes).getDataAsString('UTF-8');
  if (!text) text = resp.getContentText();
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/* ---- Optional debug helpers ---- */

function DebugTokens() {
  var p = PropertiesService.getScriptProperties();
  Logger.log('TOKEN_URL: ' + (p.getProperty('DAXKO_TOKEN_URL') || '(missing)'));
  Logger.log('CLIENT_ID present? ' + !!p.getProperty('DAXKO_CLIENT_ID'));
  Logger.log('CLIENT_SECRET present? ' + !!p.getProperty('DAXKO_CLIENT_SECRET'));
  Logger.log('SCOPE present? ' + !!p.getProperty('DAXKO_SCOPE'));
  Logger.log('Has REFRESH_TOKEN? ' + !!p.getProperty('DAXKO_REFRESH_TOKEN'));
  Logger.log('Has ACCESS_TOKEN? ' + !!p.getProperty('DAXKO_ACCESS_TOKEN'));
}

function DebugAuthOnce() {
  var headers = daxkoHeaders_();
  var body = {
    format: String(CONFIG.request.format).toLowerCase(),
    pageSize: '1',
    pageNumber: '1',
    outputFields: ['SystemId'],
    criteriaFields: CONFIG.request.criteriaFields
  };
  try {
    var resp = UrlFetchApp.fetch(CONFIG.daxko.url, {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
    Logger.log('Test call HTTP: ' + resp.getResponseCode());
    Logger.log('Snippet: ' + safeGetText_(resp).substring(0, 200));
  } catch (e) {
    Logger.log('Test call error: ' + e);
  }
}

/** Simple gzip sanity test */
function _testGzipOnce() {
  var folder = getOrCreateFolderPath_('daxko-raw/_tests');
  var blob   = Utilities.newBlob('hello gzip', 'text/plain', 'hello.txt');
  var gz     = Utilities.gzip(blob, 'hello.txt.gz');
  folder.createFile(gz);
  Logger.log('Created test file: hello.txt.gz');
}
/** Returns true if we still have time left in this execution. */
function hasTimeLeft_(startMs, budgetMs) {
  return (Date.now() - startMs) < Math.max(60000, budgetMs || 240000); // never run to the last minute
}

/** Schedule a quick continuation (1–2 minutes from now) and log it. */
function scheduleContinuation_() {
  // Avoid piling up duplicates: remove existing continuation triggers for this handler
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runDaxkoReport1Daily' &&
        triggers[i].getTriggerSource() === ScriptApp.TriggerSource.CLOCK) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  // Create an immediate continuation (~1 minute from now)
  ScriptApp.newTrigger('runDaxkoReport1Daily').timeBased().after(60 * 1000).create();
  Logger.log('Continuation scheduled to resume shortly.');
}