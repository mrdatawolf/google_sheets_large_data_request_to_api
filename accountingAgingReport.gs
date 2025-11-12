/**
 * Contains all logic for the Accounting Aging Report (CONFIG_AGING).
 */

/**
 * Gets the current statement period in YYYY-MM format for the aging report.
 * This returns the previous month's period (e.g., if today is 2025-11-11, returns "2025-10").
 *
 * @returns {string} The statement period in YYYY-MM format
 */
function getCurrentStatementPeriod_() {
  var now = new Date();

  // Get previous month (aging reports typically use the previous closed period)
  var year = now.getFullYear();
  var month = now.getMonth(); // 0-11

  // If current month is January (0), go back to December of previous year
  if (month === 0) {
    year -= 1;
    month = 12;
  }

  // Format as YYYY-MM (month is 1-12, so current month value is already the previous month)
  var monthStr = String(month).padStart(2, '0');

  return year + '-' + monthStr;
}

/**
 * Sets a custom statement period for the aging report.
 * Use this if you want to override the automatic previous-month logic.
 *
 * Example: setStatementPeriod_("2025-06")
 *
 * @param {string} period - The statement period in YYYY-MM format
 */
function setStatementPeriod_(period) {
  PropertiesService.getScriptProperties().setProperty('AGING_STATEMENT_PERIOD', period);
}

/**
 * Clears the custom statement period, reverting to automatic previous-month logic.
 */
function clearStatementPeriod_() {
  PropertiesService.getScriptProperties().deleteProperty('AGING_STATEMENT_PERIOD');
}

/**
 * Gets the statement period, checking for a custom override first.
 * This is called by the config to get the period for each request.
 *
 * @returns {string} The statement period in YYYY-MM format
 */
function getStatementPeriod_() {
  var customPeriod = PropertiesService.getScriptProperties().getProperty('AGING_STATEMENT_PERIOD');
  if (customPeriod) {
    return customPeriod;
  }
  return getCurrentStatementPeriod_();
}
