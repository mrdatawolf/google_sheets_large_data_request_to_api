function runUsersReport() {
  runReport(CONFIG);
}

function setupUsers() {
  setupReport(CONFIG, 'runUsersReport',1);
}

function runTransactionsReport() {
  runReport(CONFIG_TX)
}

function setupTransactions() {
  setupReport(CONFIG_TX, 'runTransactionsReport',24);
}

function runUserGroupDynamicReport() {
  runReport(CONFIG_UGDR);
}

function setupUserGroupDynamicReport() {
  setupReport(CONFIG_UGDR, 'runUserGroupDynamicReport', 24);
}

function runUserGroupStatisticsReport() {
  runReport(CONFIG_UGSR);
}

function setupUserGroupStatisticsReport() {
  setupReport(CONFIG_UGSR, 'runUserGroupStatisticsReport', 24);
}

function runAccountingAgingReport() {
  runReport(CONFIG_AGING);
}

function setupAccountingAgingReport() {
  setupReport(CONFIG_AGING, 'runAccountingAgingReport', 24);
}

function runDuesSummaryReport() {
  runReport(CONFIG_DUES_SUMMARY);
}

function setupDuesSummaryReport() {
  setupReport(CONFIG_DUES_SUMMARY, 'runDuesSummaryReport', 24);
}

function runUserCancellationSync() {
  syncUserCancellations();
}

function setupUserCancellationSync() {
  var triggerName = 'runUserCancellationSync';
  // Set up daily trigger at 2 AM (hour 2)
  setupReport({scheduleDaily: true}, triggerName, 2);
}

function runCanceledStatusSync() {
  syncCanceledStatusUsers();
}

function setupCanceledStatusSync() {
  var triggerName = 'runCanceledStatusSync';
  // Set up daily trigger at 3 AM (hour 3)
  setupReport({scheduleDaily: true}, triggerName, 3);
}

function runCanceledWithDatesSync() {
  syncCanceledWithDates();
}

function setupCanceledWithDatesSync() {
  var triggerName = 'runCanceledWithDatesSync';
  // Set up daily trigger at 4 AM (hour 4)
  setupReport({scheduleDaily: true}, triggerName, 4);
}