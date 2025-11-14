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