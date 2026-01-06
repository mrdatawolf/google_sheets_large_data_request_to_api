function setupUsers() {
  setupReport(CONFIG, 'runUsersReport',1);
}

function setupTransactions() {
  setupReport(CONFIG_TX, 'runTransactionsReport',24);
}

function setupUserGroupDynamicReport() {
  setupReport(CONFIG_UGDR, 'runUserGroupDynamicReport', 24);
}

function setupUserGroupStatisticsReport() {
  setupReport(CONFIG_UGSR, 'runUserGroupStatisticsReport', 24);
}

function setupAccountingAgingReport() {
  setupReport(CONFIG_AGING, 'runAccountingAgingReport', 24);
}

function setupDuesSummaryReport() {
  setupReport(CONFIG_DUES_SUMMARY, 'runDuesSummaryReport', 24);
}

function setupUserCancellationSync() {
  var triggerName = 'runUserCancellationSync';
  // Set up daily trigger at 2 AM (hour 2)
  setupReport({scheduleDaily: true}, triggerName, 2);
}

function setupCanceledStatusSync() {
  var triggerName = 'runCanceledStatusSync';
  // Set up daily trigger at 3 AM (hour 3)
  setupReport({scheduleDaily: true}, triggerName, 3);
}

function setupCanceledWithDatesSync() {
  var triggerName = 'runCanceledWithDatesSync';
  // Set up daily trigger at 4 AM (hour 4)
  setupReport({scheduleDaily: true}, triggerName, 4);
}

function setupScheduleEventsReport() {
  // Set up daily trigger at 6 AM (hour 6)
  setupReport(CONFIG_SCHEDULE_EVENTS, 'runScheduleEventsReport', 6);
}