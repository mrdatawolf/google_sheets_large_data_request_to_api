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
 * Debug function to inspect the CONFIG_AGING configuration structure
 */
function DebugAgingConfig() {
  Logger.log('=== Testing CONFIG_AGING structure ===');

  if (typeof CONFIG_AGING === 'undefined') {
    Logger.log('ERROR: CONFIG_AGING is undefined!');
    return;
  }

  Logger.log('CONFIG_AGING exists: true');
  Logger.log('sheetName: ' + CONFIG_AGING.sheetName);
  Logger.log('uniqueKey: ' + CONFIG_AGING.uniqueKey);
  Logger.log('apiUrl: ' + CONFIG_AGING.apiUrl);

  Logger.log('Has request object: ' + (CONFIG_AGING.request != null));
  if (CONFIG_AGING.request) {
    Logger.log('request.format: ' + CONFIG_AGING.request.format);
    Logger.log('request.pageSize: ' + CONFIG_AGING.request.pageSize);
    Logger.log('request.outputFields exists: ' + (CONFIG_AGING.request.outputFields != null));
    if (CONFIG_AGING.request.outputFields) {
      Logger.log('request.outputFields: ' + JSON.stringify(CONFIG_AGING.request.outputFields));
    }
  }

  Logger.log('Has sheetConfigs: ' + (CONFIG_AGING.sheetConfigs != null));
  if (CONFIG_AGING.sheetConfigs) {
    Logger.log('sheetConfigs length: ' + CONFIG_AGING.sheetConfigs.length);
    for (var i = 0; i < CONFIG_AGING.sheetConfigs.length; i++) {
      var sc = CONFIG_AGING.sheetConfigs[i];
      Logger.log('sheetConfig[' + i + '] sheetName: ' + sc.sheetName);
      Logger.log('sheetConfig[' + i + '] keyField: ' + sc.keyField);
      Logger.log('sheetConfig[' + i + '] fields exists: ' + (sc.fields != null));
      if (sc.fields) {
        Logger.log('sheetConfig[' + i + '] fields: ' + JSON.stringify(sc.fields));
      }
    }
  }

  Logger.log('Has buildRequestBody: ' + (typeof CONFIG_AGING.buildRequestBody === 'function'));
  if (typeof CONFIG_AGING.buildRequestBody === 'function') {
    try {
      var testBody = CONFIG_AGING.buildRequestBody(1);
      Logger.log('buildRequestBody(1) result: ' + JSON.stringify(testBody, null, 2));
    } catch (e) {
      Logger.log('ERROR calling buildRequestBody: ' + e);
    }
  }

  Logger.log('=== Test complete ===');
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

/**
 * Debug function for Dues Summary Report.
 * Shows the current state and what will be fetched next.
 */
function DebugDuesSummary() {
  Logger.log('=== Dues Summary Debug ===');

  var lastMonth = getLastDuesMonth_();
  Logger.log('Last month retrieved: ' + (lastMonth || '(never run)'));

  var checkResult = shouldFetchDuesSummary_();
  Logger.log('Should fetch new data: ' + checkResult.shouldFetch);
  Logger.log('Reason: ' + checkResult.reason);

  if (checkResult.months && checkResult.months.length > 0) {
    Logger.log('Months to fetch (' + checkResult.months.length + '):');
    for (var i = 0; i < checkResult.months.length; i++) {
      var month = checkResult.months[i];
      var dateRange = getMonthDateRange_(month);
      Logger.log('  ' + month + ': ' + dateRange.from + ' to ' + dateRange.to);
    }

    // Show what the request body will look like for the first month
    Logger.log('\nRequest body preview (first month):');
    var body = buildDuesSummaryBody_(1, CONFIG_DUES_SUMMARY);
    Logger.log(JSON.stringify(body, null, 2));
  } else {
    Logger.log('No months to fetch');
  }

  Logger.log('=== End Debug ===');
}