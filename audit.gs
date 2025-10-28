/**
 * Audit sheet creation + one-row append per run.
 */
function ensureAuditSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(CONFIG.audit.sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.audit.sheetName);
    var header = [
      'RunTimestamp','Status','StartPage','LastNonEmptyPage','PagesFetched','RecordsFetched',
      'Appended','Updated','RawFilesSaved','DurationMs','ResumeSavedPage','Format','PageSize','Error',
      'Refreshed','ParseMode','CSVSanitized'
    ];
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
    // Optional: format timestamp column
    sheet.getRange('A:A').setNumberFormat('yyyy-MM-dd HH:mm:ss');
  }
  return sheet;
}
/**
 * Append a single audit row to the given sheet.
 * Expects 'info' from runReport(...).
 */
function appendAuditRow_(info, sheetName) {
  var headers = [
    'RunTimestamp','Status','StartPage','LastNonEmptyPage','PagesFetched','RecordsFetched',
    'Appended','Updated','RawFilesSaved','DurationMs','ResumeSavedPage','Format','PageSize','Error',
    'Refreshed','ParseMode','CSVSanitized'
  ];

  var sheet = ensureAuditSheet_(sheetName);
  // Ensure headers match and are bold/frozen if this is a new sheet
  var lastCol = sheet.getLastColumn();
  if (lastCol < headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  // Map info -> row (fill blanks for fields not provided)
  var row = [
    info.runTimestamp || new Date(),
    info.status || 'UNKNOWN',
    info.startPage || '',                 // not provided by runner; leave blank or extend runner if needed
    info.lastNonEmptyPage || '',
    info.pagesFetched || 0,
    info.recordsFetched || 0,
    info.appended || 0,
    info.updated || 0,
    info.rawFilesSaved || 0,              // if you track this in raw.saveRawPayload, add it to info
    info.durationMs || 0,
    info.resumeSavedPage || '',           // not provided by runner; leave blank
    info.format || 'json',
    info.pageSize || '',
    info.error || '',
    info.refreshed || 'no',
    info.parseMode || 'json',
    info.csvSanitized || 'no'
  ];

  sheet.appendRow(row);
}