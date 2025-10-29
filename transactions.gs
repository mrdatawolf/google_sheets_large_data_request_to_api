/**
 * Contains helper functions specific to the Transaction Search report (CONFIG_TX).
 */

/**
 * Builds the request body for the Transaction Search API.
 * This is a custom body builder for CONFIG_TX.
 *
 * @param {number} page The page number to request.
 * @param {object} ctx The current config object.
 * @return {object} The request body.
 */
function buildTxBody_(page, ctx) {
  var p = String(page);
  var ps = String(ctx.pageSize);
  // Simple dateFrom: Jan 1 of current year.
  var dateFrom = Utilities.formatDate(new Date(new Date().getFullYear(), 0, 1), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return {
    format: ctx.format,
    dateFrom: dateFrom,
    page: p,
    pageNumber: p, // for compatibility
    pageSize: ps
  };
}

/**
 * Flattens the nested transaction data from the API into a single level
 * for the sheet. It extracts data from the nested 'info' object.
 * This is a custom flattener for CONFIG_TX.
 *
 * @param {Array<object>} resultsArr The array of records from the API.
 * @return {{main: Array<object>}} The flattened records wrapped in a 'main' object.
 */
function flattenTxInvoices_(resultsArr) {
  var invoices = [];
  for (var i = 0; i < resultsArr.length; i++) {
    var r = resultsArr[i] || {};
    invoices.push({
      uniqueID: r.invoice || '',
      invoice: r.invoice || '',
      date: r.date || '',
      memberName: r.memberName || '',
      total: r.total == null ? '' : r.total
    });
  }
  return { main: invoices };
}

/**
 * A custom fetcher for CONFIG_TX that bypasses the buggy parsePayload_
 * in fetch.gs. It returns the raw payload string to the runner.
 *
 * @param {object} body The request body.
 * @param {number} page The page number.
 * @param {object} ctx The current config object.
 * @return {{payload: string}} The raw response payload.
 */
function fetchTxPage_(body, page, ctx) {
  var text = postWithRetry_(ctx.apiUrl, body, ctx);
  return { payload: text };
}