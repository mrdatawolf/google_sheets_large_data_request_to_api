/**
 * Contains all logic for the User Group Statistics Report (CONFIG_UGSR).
 */

/**
 * Fetches the User Group Statistics Report data.
 * This report is not paginated, so we only fetch page 1.
 * @param {Object} body - The request body
 * @param {number} page - The page number (only page 1 is fetched)
 * @param {Object} ctx - The context object containing apiUrl and other config
 * @returns {Object} Object with records array containing the parsed response
 */
function fetchUgsrOnce_(body, page, ctx) {
  if (page > 1) return { records: [] }; // Ensure we only run once

  // Call the low-level fetcher to get the raw text response
  var text = postWithRetry_(ctx.apiUrl, body, ctx);
  var parsed = JSON.parse(text || '{}');

  // Return the entire parsed object as a single "record"
  return { records: [parsed] };
}

/**
 * Flattens the User Group Statistics Report data into two sheets:
 * one for summary totals and one for detailed results.
 * @param {Array} resultsArr - Array containing the raw API response
 * @returns {Array} Array of job objects for the runner to process
 */
function flattenUgsr_(resultsArr) {
  var rawApiObject = resultsArr[0] || {};
  var data = rawApiObject.data || {};
  var totals = data.totals || {};
  var details = data.results || [];

  // Create summary records
  var summaryRecords = [];
  for (var key in totals) {
    if (Object.prototype.hasOwnProperty.call(totals, key) && key !== '') {
      summaryRecords.push({ 'Metric': key, 'Value': totals[key] });
    }
  }

  // Define the two jobs
  var summaryJob = {
    sheetName: 'UserGSR_Summary',
    records: summaryRecords,
    keyField: 'Metric',
    fields: ['Metric', 'Value']
  };

  var detailsJob = {
    sheetName: 'UserGSR_Details',
    records: details,
    keyField: 'User Group',
    fields: [
      'User Group', 'User Group Billing Type', 'Total', 'Active', 'Canceled',
      'Inactive', 'Expired', 'On Hold', 'Online Review'
    ]
  };

  return [summaryJob, detailsJob];
}
