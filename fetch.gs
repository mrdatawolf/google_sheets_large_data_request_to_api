/**
 * HTTP POST + parsing (JSON only; CSV not implemented).
 */

/**
 * Builds a request body for a given page number using the provided config.
 */
function buildRequestBody_(pageNumber, config) {
  return {
    format: String(config.request.format).toLowerCase(),
    pageSize: String(config.request.pageSize),
    pageNumber: String(pageNumber),
    outputFields: config.request.outputFields.slice(),
    criteriaFields: config.request.criteriaFields
  };
}

/**
 * Generic POST with retry/backoff and optional token refresh.
 */
function postWithRetry_(url, body, config) {
  var attempt = 0;
  var backoff = config.daxko.initialBackoffMs;
  var maxRetries = config.daxko.maxRetries;

  while (attempt <= maxRetries) {
    try {
      var resp = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        headers: daxkoHeaders_(),
        payload: JSON.stringify(body),
        muteHttpExceptions: true
      });

      var code = resp.getResponseCode();
      var text = safeGetText_(resp);

      if (code >= 200 && code < 300) return text;

      if ((code === 401 || code === 403) && attempt === 0) {
        refreshAccessToken_(); // try once
        attempt++;
        continue;
      }

      if ((code === 429 || code >= 500) && attempt < maxRetries) {
        Utilities.sleep(backoff);
        backoff *= 2;
        attempt++;
        continue;
      }

      throw new Error('HTTP ' + code + ': ' + (text ? text.substring(0, 500) : ''));

    } catch (err) {
      if (attempt < maxRetries) {
        Utilities.sleep(backoff);
        backoff *= 2;
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

/**
 * Fetches a single page of data using the given config and body.
 */
function fetchDaxkoPagePost_(body, pageNumber, config) {
  var text = postWithRetry_(config.apiUrl, body, config);
  return parsePayload_(text, pageNumber, config);
}

/**
 * Parses the response payload based on format (currently JSON only).
 * Accepts format/fields from config.request.* or top-level config.*
 */
function parsePayload_(text, pageNumber, config) {
  var fmt = String(((config && config.request && config.request.format) || config && config.format || 'json')).toLowerCase();
  config = config || {};
  config.RUN_FLAGS = config.RUN_FLAGS || {};
  config.RUN_FLAGS.parseMode = fmt;

  if (fmt === 'json') {
    var json;
    try { json = JSON.parse(text); }
    catch (e) { throw new Error('Invalid JSON on page ' + pageNumber + ': ' + e); }

    var arr = Array.isArray(json) ? json
            : (json && Array.isArray(json.results)) ? json.results
            : (json && Array.isArray(json.data)) ? json.data
            : [];

    var fields = (config.request && config.request.outputFields) || config.outputFields || [];
    var records = mapPickFields_(arr, fields);
    return { payloadText: text, records: records, rowCount: records.length };
  }

  throw new Error('CSV parsing not implemented. Expected JSON format.');
}