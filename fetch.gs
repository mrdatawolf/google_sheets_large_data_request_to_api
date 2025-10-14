/**
 * HTTP POST + parsing (JSON or CSV with fallback/sanitization).
 */

function buildRequestBody_(pageNumber) {
  return {
    format: String(CONFIG.request.format).toLowerCase(),
    pageSize: String(CONFIG.request.pageSize),
    pageNumber: String(pageNumber),
    outputFields: CONFIG.request.outputFields.slice(),
    criteriaFields: CONFIG.request.criteriaFields
  };
}

function fetchDaxkoPagePost_(body, pageNumber) {
  var attempt = 0;
  var backoff = CONFIG.daxko.initialBackoffMs;

  while (true) {
    try {
      var resp = UrlFetchApp.fetch(CONFIG.daxko.url, {
        method: 'post',
        contentType: 'application/json',
        headers: daxkoHeaders_(),
        payload: JSON.stringify(body),
        muteHttpExceptions: true
      });

      var code = resp.getResponseCode();
      var text = safeGetText_(resp);

      if (code >= 200 && code < 300) {
        return parsePayload_(text, pageNumber);
      }

      // If unauthorized/forbidden, refresh once then retry
      if (code === 401 || code === 403) {
        try {
          refreshAccessToken_();
          var retry = UrlFetchApp.fetch(CONFIG.daxko.url, {
            method: 'post',
            contentType: 'application/json',
            headers: daxkoHeaders_(),
            payload: JSON.stringify(body),
            muteHttpExceptions: true
          });
          var retryCode = retry.getResponseCode();
          var retryText = safeGetText_(retry);
          if (retryCode >= 200 && retryCode < 300) {
            return parsePayload_(retryText, pageNumber);
          }
        } catch (e) {
          // fall through to backoff below
        }
      }

      // 429/5xx backoff
      if ((code === 429 || code >= 500) && attempt < CONFIG.daxko.maxRetries) {
        Utilities.sleep(backoff);
        attempt++;
        backoff = backoff * 2;
        continue;
      }

      var snippet = text ? text.substring(0, 500) : '';
      throw new Error('HTTP ' + code + ': ' + snippet);

    } catch (err) {
      if (attempt < CONFIG.daxko.maxRetries) {
        Utilities.sleep(backoff);
        attempt++;
        backoff = backoff * 2;
        continue;
      }
      throw err;
    }
  }
}

function parsePayload_(text, pageNumber) {
  var fmt = String(CONFIG.request.format).toLowerCase();

  if (fmt === 'json') {
    RUN_FLAGS.parseMode = 'json';
    var json;
    try { json = JSON.parse(text); } catch (e) { throw new Error('Invalid JSON on page ' + pageNumber + ': ' + e); }
    var arr = (Object.prototype.toString.call(json) === '[object Array]') ? json
            : (json && json.data && Object.prototype.toString.call(json.data) === '[object Array]') ? json.data : [];
    var records = mapPickFields_(arr, CONFIG.request.outputFields);
    return { payloadText: text, records: records, rowCount: records.length };
  }

  // CSV path with auto-detect + sanitization
  RUN_FLAGS.parseMode = 'csv';
  var textTrim = text.trim();

  // If body is actually JSON (error page), handle as JSON
  if (textTrim.indexOf('{') === 0 || textTrim.indexOf('[') === 0) {
    try {
      var j = JSON.parse(textTrim);
      var arr2 = (Object.prototype.toString.call(j) === '[object Array]') ? j :
                 (j && j.data && Object.prototype.toString.call(j.data) === '[object Array]') ? j.data : [];
      var recs2 = mapPickFields_(arr2, CONFIG.request.outputFields);
      RUN_FLAGS.parseMode = 'json';
      return { payloadText: text, records: recs2, rowCount: recs2.length };
    } catch (ejson) {
      // fall through to CSV attempts
    }
  }

  var grid;
  try {
    grid = Utilities.parseCsv(textTrim);
  } catch (e1) {
    // flatten embedded newlines within quoted regions
    var sanitized = textTrim.replace(/(["'])(?:(?=(\\?))\2[\s\S])*?\1/g, function (quoted) {
      return quoted.replace(/\n/g, ' ');
    });
    try {
      grid = Utilities.parseCsv(sanitized);
      RUN_FLAGS.csvSanitized = true;
    } catch (e2) {
      var snippet = textTrim.substring(0, 300);
      Logger.log('CSV parse failed. Snippet: ' + snippet);
      throw new Error('CSV parse failed after sanitization.');
    }
  }

  if (!grid || grid.length === 0) return { payloadText: text, records: [], rowCount: 0 };

  var header = toTrimmedRow_(grid[0]);
  var rows = grid.slice(1);
  var recordsCsv = [];
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var obj = {};
    for (var c = 0; c < header.length; c++) {
      obj[header[c]] = (c < row.length && row[c] != null) ? String(row[c]) : '';
    }
    recordsCsv.push(obj);
  }
  var normalized = mapPickFields_(recordsCsv, CONFIG.request.outputFields);
  return { payloadText: text, records: normalized, rowCount: normalized.length };
}