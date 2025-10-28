/**
 * Debug/diagnostic helpers (safe to exclude from production).
 * Note: requires daxkoHeaders_(), CONFIG, UrlFetchApp, and Drive scope where indicated.
 */

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

/** Simple gzip sanity test (Drive access required). */
function _testGzipOnce() {
  var folder = getOrCreateFolderPath_('daxko-raw/_tests');
  var blob   = Utilities.newBlob('hello gzip', 'text/plain', 'hello.txt');
  var gz     = Utilities.gzip(blob, 'hello.txt.gz');
  folder.createFile(gz);
  Logger.log('Created test file: hello.txt.gz');
}