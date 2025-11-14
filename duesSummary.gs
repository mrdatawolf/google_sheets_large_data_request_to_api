/**
 * Contains all logic for the Dues Summary Report.
 * This report fetches User Group Dynamics data (report 22) for specific user groups,
 * automatically tracking the last month retrieved and fetching new months as they become available.
 */

/**
 * Gets the last month that was successfully retrieved.
 * Returns a date string in YYYY-MM format, or null if never run.
 * @returns {string|null} Last retrieved month in YYYY-MM format
 */
function getLastDuesMonth_() {
  return PropertiesService.getScriptProperties().getProperty('DUES_SUMMARY_LAST_MONTH');
}

/**
 * Sets the last month that was successfully retrieved.
 * @param {string} month - Month in YYYY-MM format (e.g., "2025-09")
 */
function setLastDuesMonth_(month) {
  PropertiesService.getScriptProperties().setProperty('DUES_SUMMARY_LAST_MONTH', month);
}

/**
 * Clears the last month tracker (useful for testing or resets).
 */
function clearLastDuesMonth_() {
  PropertiesService.getScriptProperties().deleteProperty('DUES_SUMMARY_LAST_MONTH');
}

/**
 * Manually sets the last month tracker to a specific month.
 * Useful for backfilling data - set this to the month BEFORE you want to start fetching.
 * For example, to fetch starting from Jan 2024, set this to "2023-12".
 * @param {string} month - Month in YYYY-MM format (e.g., "2023-12")
 */
function setLastDuesMonthManual_(month) {
  PropertiesService.getScriptProperties().setProperty('DUES_SUMMARY_LAST_MONTH', month);
  Logger.log('Manually set DUES_SUMMARY_LAST_MONTH to: ' + month);
  Logger.log('Next run will fetch from: ' + addOneMonth_(month));
}

/**
 * Gets the previous month in YYYY-MM format.
 * @returns {string} Previous month in YYYY-MM format
 */
function getPreviousMonth_() {
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth(); // 0-11

  // If current month is January (0), go back to December of previous year
  if (month === 0) {
    year -= 1;
    month = 12;
  }

  // Format as YYYY-MM
  var monthStr = String(month).padStart(2, '0');
  return year + '-' + monthStr;
}

/**
 * Adds one month to a YYYY-MM date string.
 * @param {string} monthStr - Month in YYYY-MM format
 * @returns {string} Next month in YYYY-MM format
 */
function addOneMonth_(monthStr) {
  var parts = monthStr.split('-');
  var year = parseInt(parts[0]);
  var month = parseInt(parts[1]); // 1-12

  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }

  var monthPadded = String(month).padStart(2, '0');
  return year + '-' + monthPadded;
}

/**
 * Gets all months from startMonth (exclusive) to endMonth (inclusive).
 * @param {string} startMonth - Starting month in YYYY-MM format (not included)
 * @param {string} endMonth - Ending month in YYYY-MM format (included)
 * @returns {Array<string>} Array of month strings in YYYY-MM format
 */
function getMonthRange_(startMonth, endMonth) {
  var months = [];
  var current = addOneMonth_(startMonth);

  // Safety check to prevent infinite loops
  var maxIterations = 120; // 10 years
  var iterations = 0;

  while (current <= endMonth && iterations < maxIterations) {
    months.push(current);
    current = addOneMonth_(current);
    iterations++;
  }

  return months;
}

/**
 * Determines which months need to be fetched.
 * Returns all months from last fetched month + 1 through previous month.
 * @returns {Object} Object with {shouldFetch: boolean, months: Array<string>, reason: string}
 */
function shouldFetchDuesSummary_() {
  var lastMonth = getLastDuesMonth_();
  var previousMonth = getPreviousMonth_();

  if (!lastMonth) {
    return {
      shouldFetch: true,
      months: [previousMonth],
      reason: 'No previous data - initial fetch'
    };
  }

  // Get all months between lastMonth and previousMonth
  var monthsToFetch = getMonthRange_(lastMonth, previousMonth);

  if (monthsToFetch.length > 0) {
    return {
      shouldFetch: true,
      months: monthsToFetch,
      reason: 'Fetching ' + monthsToFetch.length + ' month(s): ' + monthsToFetch.join(', ')
    };
  }

  return {
    shouldFetch: false,
    months: [],
    reason: 'Already have current month data'
  };
}

/**
 * Converts YYYY-MM format to MM/DD/YYYY date range for the API.
 * Returns the first and last day of the month.
 * @param {string} monthStr - Month in YYYY-MM format
 * @returns {Object} Object with {from: string, to: string} in MM/DD/YYYY format
 */
function getMonthDateRange_(monthStr) {
  var parts = monthStr.split('-');
  var year = parseInt(parts[0]);
  var month = parseInt(parts[1]); // 1-12

  // First day of month
  var fromDate = month + '/01/' + year;

  // Last day of month
  var lastDay = new Date(year, month, 0).getDate(); // Day 0 of next month = last day of this month
  var toDate = month + '/' + lastDay + '/' + year;

  return {
    from: fromDate,
    to: toDate
  };
}

/**
 * Builds the request body for the Dues Summary report for a specific month.
 * @param {string} monthStr - Month in YYYY-MM format to fetch
 * @param {Object} ctx - Config context
 * @returns {Object} Request body
 */
function buildDuesSummaryBodyForMonth_(monthStr, ctx) {
  var dateRange = getMonthDateRange_(monthStr);

  // Get user groups from config (or use default if not specified)
  var userGroups = ctx.userGroups || ['1021', '1026', '1028'];

  // Convert all user group IDs to strings (API requires strings)
  var userGroupStrings = [];
  for (var i = 0; i < userGroups.length; i++) {
    userGroupStrings.push(String(userGroups[i]));
  }

  return {
    "format": "json",
    "pageSize": "50",
    "pageNumber": "1",
    "criteriaFields": {
      "usergroupdynamics": {
        "usergroup": userGroupStrings,
        "date": dateRange
      }
    }
  };
}

/**
 * Builds the request body for the Dues Summary report.
 * This is called by the config and returns body for first month.
 * The actual fetching happens in fetchDuesSummaryOnce_ which handles multiple months.
 * @param {number} page - Page number (always 1 for this report)
 * @param {Object} ctx - Config context
 * @returns {Object} Request body
 */
function buildDuesSummaryBody_(page, ctx) {
  var checkResult = shouldFetchDuesSummary_();
  if (checkResult.months.length > 0) {
    return buildDuesSummaryBodyForMonth_(checkResult.months[0], ctx);
  }
  // Return empty body if nothing to fetch
  return {
    "format": "json",
    "pageSize": "50",
    "pageNumber": "1",
    "criteriaFields": {}
  };
}

/**
 * Fetches the Dues Summary data for all missing months.
 * Loops through each month that needs to be fetched and accumulates results.
 * @param {Object} body - Request body (not used, we build our own)
 * @param {number} page - Page number (only page 1 is fetched)
 * @param {Object} ctx - Config context
 * @returns {Object} Object with records array containing one object per month
 */
function fetchDuesSummaryOnce_(body, page, ctx) {
  if (page > 1) return { records: [] }; // Only run once

  // Determine which months to fetch
  var checkResult = shouldFetchDuesSummary_();

  if (!checkResult.shouldFetch || checkResult.months.length === 0) {
    Logger.log('No new months to fetch');
    return { records: [] };
  }

  Logger.log('Fetching ' + checkResult.months.length + ' month(s): ' + checkResult.months.join(', '));

  var allRecords = [];
  var lastSuccessfulMonth = null;

  // Fetch data for each month
  for (var i = 0; i < checkResult.months.length; i++) {
    var monthToFetch = checkResult.months[i];
    Logger.log('Fetching data for month: ' + monthToFetch);

    try {
      // Build request body for this specific month
      var monthBody = buildDuesSummaryBodyForMonth_(monthToFetch, ctx);

      // Fetch the data
      var text = postWithRetry_(ctx.apiUrl, monthBody, ctx);
      var parsed = JSON.parse(text || '{}');

      if (parsed.success && parsed.data) {
        // Tag this record with the month it represents
        parsed._monthTag = monthToFetch;
        allRecords.push(parsed);
        lastSuccessfulMonth = monthToFetch;
        Logger.log('Successfully fetched data for: ' + monthToFetch);
      } else {
        Logger.log('WARNING: Failed to fetch data for month ' + monthToFetch + ': ' + (parsed.error || 'Unknown error'));
        // Continue with next month
      }
    } catch (e) {
      Logger.log('ERROR fetching month ' + monthToFetch + ': ' + e);
      // Continue with next month
    }
  }

  // Update the tracker to the last successfully fetched month
  if (lastSuccessfulMonth) {
    setLastDuesMonth_(lastSuccessfulMonth);
    Logger.log('Updated last dues month to: ' + lastSuccessfulMonth);
  }

  return { records: allRecords };
}

/**
 * Flattens the Dues Summary data into sheet jobs.
 * Creates two sheets: one for totals, one for details.
 * Handles multiple months of data in a single run.
 * @param {Array} resultsArr - Array with multiple API response objects (one per month)
 * @returns {Array} Array of sheet job objects
 */
function flattenDuesSummary_(resultsArr) {
  var allSummaryRecords = [];
  var allDetailRecords = [];

  // Process each month's data
  for (var i = 0; i < resultsArr.length; i++) {
    var rawApiObject = resultsArr[i] || {};
    var data = rawApiObject.data || {};
    var totals = data.totals || {};
    var details = data.results || [];
    var monthTag = rawApiObject._monthTag || '';

    // Create summary record for this month with all metrics as columns
    var summaryRecord = {
      'ReportMonth': monthTag
    };

    // Add all totals as columns
    for (var key in totals) {
      if (Object.prototype.hasOwnProperty.call(totals, key) && key !== '') {
        summaryRecord[key] = totals[key];
      }
    }

    allSummaryRecords.push(summaryRecord);

    // Process detail records for this month
    for (var j = 0; j < details.length; j++) {
      var detail = details[j] || {};
      detail.ReportMonth = monthTag;
      // Create composite key for uniqueness across months
      detail.UniqueKey = (detail['User Group'] || '') + '_' + monthTag;
      allDetailRecords.push(detail);
    }
  }

  // Define the summary job - one row per month
  var summaryJob = {
    sheetName: 'DuesSummary_Totals',
    records: allSummaryRecords,
    keyField: 'ReportMonth',
    fields: [
      'ReportMonth', 'Start Total', 'New', 'Canceled', 'Reactivate',
      'Changed To', 'Changed From', 'On Hold', 'Off Hold', 'Removed', 'End Total', 'Net'
    ]
  };

  // Define the details job - multiple rows per month (one per user group)
  var detailsJob = {
    sheetName: 'DuesSummary_Details',
    records: allDetailRecords,
    keyField: 'UniqueKey',  // Composite key: UserGroup_YYYY-MM
    fields: [
      'UniqueKey', 'ReportMonth', 'User Group', 'User Group Billing Type',
      'Start Total', 'End Total', 'Net', 'New', 'Canceled', 'Inactive', 'Expired',
      'Changed To', 'Changed From', 'On Hold', 'Off Hold', 'Reactivate', 'Renewed'
    ]
  };

  return [summaryJob, detailsJob];
}
