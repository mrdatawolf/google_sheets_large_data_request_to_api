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

/**
 * Debug function to check/refresh token and display it for copy/paste.
 * This will automatically reauthenticate if the token is expired.
 * View the token in Execution log (Ctrl+Enter or View > Logs).
 */
function DebugGetToken() {
  try {
    // This call automatically checks expiration and reauthenticates if needed
    var token = getAccessToken_();
    var expAt = getProp_('DAXKO_ACCESS_EXPIRES_AT');
    var expiresDate = expAt ? new Date(Number(expAt)) : null;

    // Log to Logger for easy copy/paste
    Logger.log('========================================');
    Logger.log('ACCESS TOKEN (copy from below):');
    Logger.log('========================================');
    Logger.log(token);
    Logger.log('========================================');
    if (expiresDate) {
      Logger.log('Expires at: ' + expiresDate.toLocaleString());
    }
    Logger.log('========================================');

    return token;
  } catch (e) {
    Logger.log('========================================');
    Logger.log('ERROR getting token: ' + e);
    Logger.log('========================================');
    throw e;
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