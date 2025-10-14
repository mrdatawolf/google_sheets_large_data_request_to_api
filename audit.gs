/**
 * Audit sheet creation + one-row append per run.
 */

function ensureAuditSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(CONFIG.audit.sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.audit.sheetName);
    sheet.appendRow([
      'RunTimestamp','Status','StartPage','LastNonEmptyPage','PagesFetched','RecordsFetched',
      'Appended','Updated','RawFilesSaved','DurationMs','ResumeSavedPage','Format','PageSize','Error',
      'Refreshed','ParseMode','CSVSanitized'
    ]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,17).setFontWeight('bold');
  }
  return sheet;
}

function writeAuditLog_(info) {
  var sheet = ensureAuditSheet_();
  sheet.appendRow([
    info.runTimestamp,
    info.status,
    info.startPage || '',
    info.lastNonEmptyPage || '',
    info.pagesFetched || 0,
    info.recordsFetched || 0,
    info.appended || 0,
    info.updated || 0,
    info.rawFilesSaved || 0,
    info.durationMs || 0,
    info.resumeSavedPage || '',
    info.format || '',
    info.pageSize || '',
    info.error || '',
    info.refreshed || 'no',
    info.parseMode || '',
    info.csvSanitized || 'no'
  ]);
}