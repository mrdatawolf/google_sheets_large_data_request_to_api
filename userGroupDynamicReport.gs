/**
 * Contains the custom flattening logic for the User Group Dynamic Report (CONFIG_UGDR).
 */

/**
 * Flattens the raw API response for the UGDR report into two separate data structures:
 * one for the summary totals and one for the detailed results.
 *
 * @param {object} rawApiObject The raw, parsed JSON object from the API response.
 * @return {{summary: Array<object>, details: Array<object>}} An object containing the two data arrays.
 */
function flattenUgdr_(rawApiObject) {
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