function runGetAccessToken() {
  try {
    // This call automatically checks expiration and reauthenticates if needed
    var token = getAccessToken_();
    var expAt = getProp_('DAXKO_ACCESS_EXPIRES_AT');
    var expiresDate = expAt ? new Date(Number(expAt)) : null;
    if (expiresDate) {
      Logger.log('Expires at: ' + expiresDate.toLocaleString());
    }

    return token;
  } catch (e) {
    Logger.log('========================================');
    Logger.log('ERROR getting token: ' + e);
    Logger.log('========================================');
    throw e;
  }
}

function runUsersReport() {
  runReport(CONFIG);
}

function runTransactionsReport() {
  runReport(CONFIG_TX)
}

function runUserGroupDynamicReport() {
  runReport(CONFIG_UGDR);
}

function runUserGroupStatisticsReport() {
  runReport(CONFIG_UGSR);
}

function runAccountingAgingReport() {
  runReport(CONFIG_AGING);
}

function runDuesSummaryReport() {
  runReport(CONFIG_DUES_SUMMARY);
}

function runUserCancellationSync() {
  syncUserCancellations();
}

function runCanceledStatusSync() {
  syncCanceledStatusUsers();
}

function runCanceledWithDatesSync() {
  syncCanceledWithDates();
}

function runScheduleEventsReport() {
  runReport(CONFIG_SCHEDULE_EVENTS);
}

function runUserPhonesReport() {
  runReport(CONFIG_PHONES);
}