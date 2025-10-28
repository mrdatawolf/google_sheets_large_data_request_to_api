/**
 * Entrypoints + setup for all reports.
 */

// === Setup all daily triggers ===
function setupAll() {
  usersReportSetup();
  transactionsReportSetup();
  Logger.log('All daily triggers installed.');
}

// === Run all reports manually ===
function runAllReports() {
  runUsersReport();
  runTransactionsReport();
}

// === Individual report runners ===
function runUsersReport() {
  runReport(CONFIG);
}

function runTransactionsReport() {
  runReport(CONFIG_TX);
}

// === Individual report setups ===
function usersReportSetup() {
  setupReport(CONFIG, 'runUsersReport');
}

function transactionsReportSetup() {
  setupReport(CONFIG_TX, 'runTransactionsReport');
}

// === Optional debug helper ===
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
    var resp = UrlFetchApp.fetch(CONFIG.apiUrl, {
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