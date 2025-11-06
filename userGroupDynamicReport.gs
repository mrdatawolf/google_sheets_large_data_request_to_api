/**
 * Contains all logic for the User Group Dynamic Report (CONFIG_UGDR).
 */

/**
 * The main runner function for the User Group Dynamic Report.
 * This report has a unique data structure and is not paginated, so it uses this
 * dedicated runner instead of the generic runReport function.
 */
function flattenUgdr_(resultsArr) {
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
    sheetName: 'UserGDR_Summary',
    records: summaryRecords,
    keyField: 'Metric',
    fields: ['Metric', 'Value']
  };

  var detailsJob = {
    sheetName: 'UserGDR_Details',
    records: details,
    keyField: 'User Group',
    fields: [
      'User Group', 'User Group Billing Type', 'Start Total', 'End Total', 'Net', 'New',
      'Canceled', 'Inactive', 'Expired', 'Changed To', 'Changed From', 'On Hold',
      'Off Hold', 'Reactivate', 'Renewed'
    ]
  };

  return [summaryJob, detailsJob];
}