/**
 * Contains helper functions specific to the User Group Dynamic Report (CONFIG_UGDR).
 */

/**
 * Fetches the entire UGDR report object once and wraps it in a single-item array.
 * This allows the runner to process a non-standard, two-part API response.
 *
 * @param {object} body The request body (unused for this report).
 * @param {number} page The page number (should only be 1).
 * @param {object} ctx The current config object.
 * @return {{records: Array<object>}} The entire parsed API response, wrapped in an array.
 */
function fetchUgdrOnce_(body, page, ctx) {
  if (page > 1) return { records: [] }; // Ensure we only run once

  // Call the low-level fetcher to get the raw text response
  var text = postWithRetry_(ctx.apiUrl, body, ctx);
  var parsed = JSON.parse(text || '{}');

  // Return the entire parsed object as a single "record"
  return { records: [parsed] };
}

/**
 * Flattens the raw API response for the UGDR report into two separate data structures:
 * one for the summary totals and one for the detailed results.
 *
 * @param {Array<object>} resultsArr An array containing the single, raw API object.
 * @return {{summary: Array<object>, details: Array<object>}} An object containing the two data arrays.
 */
function flattenUgdr_(resultsArr) {
  // The entire API response is passed as the first and only record.
  var rawApiObject = resultsArr[0] || {};
  var data = rawApiObject.data || {};
  var totals = data.totals || {};
  var details = data.results || [];

  // Convert the totals object into an array of key-value pairs for the sheet.
  var summary = [];
  for (var key in totals) {
    if (Object.prototype.hasOwnProperty.call(totals, key)) {
      summary.push({
        'Metric': key,
        'Value': totals[key]
      });
    }
  }

  return { summary: summary, details: details };
}