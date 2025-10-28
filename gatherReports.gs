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