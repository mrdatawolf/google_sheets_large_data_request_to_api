/**
 * Transaction Search runner (flattened to 2 sheets):
 *   - Header: one row per invoice (unique key: invoice)
 *   - Charges: one row per charge line (unique key: InvoiceChargeKey = invoice#chargeId)
 *
 * Sheets:
 *   CONFIG_TX.sheetName                 -> 'daxko_transactions'
 *   CONFIG_TX.chargesSheetName          -> 'daxko_transactions_charges'
 *
 * Raw .json.gz saved in CONFIG_TX.raw.driveFolderPath
 * Audit -> CONFIG_TX.audit.sheetName
 * Digest email -> separate subject prefix (CONFIG.notifications.txSubjectPrefix)
 */

// ---- Public entrypoints ----

function runTransactionSearchDaily() {
  var t0 = Date.now();

  RUN_FLAGS.didRefresh = false;
  RUN_FLAGS.parseMode = 'json';
  RUN_FLAGS.csvSanitized = false;

  var status = 'SUCCESS';
  var errorMsg = '';
  var startPage;
  var lastNonEmptyPage = null;
  var pagesFetched = 0;
  var headerAppended = 0;
  var headerUpdated = 0;
  var chargeAppended = 0;
  var chargeUpdated = 0;
  var rawFilesSaved = 0;
  var resumeSavedPage = null;

  try {
    // Determine start page using saved state
    var state = getResumeStateTx_();
    var currentPageSize = Number(CONFIG_TX.request.pageSize);

    startPage = CONFIG_TX.request.startPage;
    if (state && typeof state.page === 'number' && state.page >= 1 &&
        state.pageSize === currentPageSize) {
      startPage = state.page; // re-scan last non-empty page (safe; we upsert)
    }

    var page = startPage;
    var headerRecords = [];
    var chargeRecords = [];

    while (true) {
      var body = buildTransactionBody_(page);
      var result = fetchTransactionsPagePost_(body, page);
      var payloadText = result.payloadText;
      var resultsArr = result.results;  // array of invoice-level objects
      var rowCount = resultsArr.length;
      pagesFetched++;

      if (CONFIG_TX.raw.enabled && payloadText) {
        saveRawPayloadTx_(payloadText, page);
        rawFilesSaved++;
      }

      if (rowCount === 0) break;

      // Flatten header + charges
      var flattened = flattenTransactions_(resultsArr, result.isCached);
      headerRecords = headerRecords.concat(flattened.headers);
      chargeRecords = chargeRecords.concat(flattened.charges);

      lastNonEmptyPage = page;
      if (rowCount < currentPageSize) break; // last page
      page++;
    }

    // Write sheets
    if (headerRecords.length > 0) {
      ensureSheetWithHeaders_(CONFIG_TX.sheetName, TX_HEADER_FIELDS);
      var resH = upsertRowsToSheet_(headerRecords, CONFIG_TX.sheetName, CONFIG_TX.uniqueKey);
      headerAppended = resH.appended;
      headerUpdated  = resH.updated;
      applyHeaderFormatsTx_(SpreadsheetApp.getActive().getSheetByName(CONFIG_TX.sheetName));
    }

    if (chargeRecords.length > 0) {
      ensureSheetWithHeaders_(CONFIG_TX.chargesSheetName, TX_CHARGE_FIELDS);
      var resC = upsertRowsToSheet_(chargeRecords, CONFIG_TX.chargesSheetName, 'InvoiceChargeKey');
      chargeAppended = resC.appended;
      chargeUpdated  = resC.updated;
      applyChargeFormatsTx_(SpreadsheetApp.getActive().getSheetByName(CONFIG_TX.chargesSheetName));
    }

    // Save resume state if we saw any data
    if (lastNonEmptyPage !== null) {
      setResumeStateTx_({
        page: lastNonEmptyPage,
        pageSize: Number(CONFIG_TX.request.pageSize),
        updatedAt: new Date().toISOString()
      });
      resumeSavedPage = lastNonEmptyPage;
    }

  } catch (err) {
    status = 'ERROR';
    errorMsg = (err && err.message) ? String(err.message).substring(0, 1000) : String(err);
  } finally {
    var durationMs = Date.now() - t0;

    // We’ll report header counts in the standard fields and tuck charge counts into error tail if needed.
    var info = {
      runTimestamp: new Date(),
      status: status,
      startPage: startPage,
      lastNonEmptyPage: lastNonEmptyPage,
      pagesFetched: pagesFetched,
      recordsFetched: headerAppended + headerUpdated, // header rows processed (approx)
      appended: headerAppended,
      updated: headerUpdated,
      rawFilesSaved: rawFilesSaved,
      durationMs: durationMs,
      resumeSavedPage: resumeSavedPage,
      format: 'json',
      pageSize: Number(CONFIG_TX.request.pageSize),
      error: errorMsg,  // will be blank on success
      refreshed: RUN_FLAGS.didRefresh ? 'yes' : 'no',
      parseMode: 'json',
      csvSanitized: 'no',

      // Extra (not written to standard audit, but used by custom TX email):
      txChargeAppended: chargeAppended,
      txChargeUpdated:  chargeUpdated
    };

    // Write TX audit row
    writeAuditLogTx_(info);

    // Send TX digest (shows header adds/updates; we’ll append charge counts in the body)
    sendRunDigestEmailFor_(info, {
      subjectPrefix: (CONFIG.notifications && CONFIG.notifications.txSubjectPrefix) || '[Daxko TX]',
      sheetName: CONFIG_TX.sheetName,
      auditSheet: CONFIG_TX.audit.sheetName
    });
  }
}

/** Install daily TX trigger */
function setupTransactions() {
  ensureAuditSheetTx_();
  ensureSheetWithHeaders_(CONFIG_TX.sheetName, TX_HEADER_FIELDS);
  ensureSheetWithHeaders_(CONFIG_TX.chargesSheetName, TX_CHARGE_FIELDS);

  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runTransactionSearchDaily') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('runTransactionSearchDaily').timeBased().everyDays(1).create();
  Logger.log('Transaction Search daily trigger created.');
}

// ---- Constants for column order ----
/** Header sheet columns */
var TX_HEADER_FIELDS = [
  'invoice','date','memberName','total',
  'enterType','creditCard','nameOnCard','orderNumber','referenceNumber','approvalCode',
  'isCached'
];

/** Charge sheet columns */
var TX_CHARGE_FIELDS = [
  'InvoiceChargeKey','invoice','chargeId','description','amount'
];

// ---- Body builder & HTTP fetch ----

function buildTransactionBody_(page) {
  // If you move dateFrom to a property TX_DATE_FROM, read it here.
  var dateFrom = CONFIG_TX.request.dateFrom;
  var dateTo = Utilities.formatDate(new Date(Date.now()), Session.getScriptTimeZone(), "yyyy-MM-dd");
  return {
    dateFrom: dateFrom,                     // "YYYY-MM-DD"
    dateTo: dateTo, // "YYYY-MM-DD"
    page: String(page),                     // pagination field name is "page"
    pageSize: String(CONFIG_TX.request.pageSize)
  };
}

function fetchTransactionsPagePost_(body, page) {
  var attempt = 0;
  var backoff = CONFIG_TX.daxko.initialBackoffMs;

  while (true) {
    try {
      var resp = UrlFetchApp.fetch(CONFIG_TX.daxko.url, {
        method: 'post',
        contentType: 'application/json',
        headers: daxkoHeaders_(),
        payload: JSON.stringify(body),
        muteHttpExceptions: true
      });

      var code = resp.getResponseCode();
      var text = safeGetText_(resp);

      if (code >= 200 && code < 300) {
        var json;
        try { json = JSON.parse(text); } catch (e) { throw new Error('Invalid JSON on page ' + page + ': ' + e); }
        // Expect { data: { results: [...] , isCached, cacheDate }, success: true }
        var data = json && json.data ? json.data : {};
        var results = (data && data.results && Object.prototype.toString.call(data.results) === '[object Array]') ? data.results : [];
        var isCached = !!data.isCached;
        return { payloadText: text, results: results, isCached: isCached };
      }

      // Auth retry (401/403)
      if (code === 401 || code === 403) {
        try {
          refreshAccessToken_();
          var retry = UrlFetchApp.fetch(CONFIG_TX.daxko.url, {
            method: 'post',
            contentType: 'application/json',
            headers: daxkoHeaders_(),
            payload: JSON.stringify(body),
            muteHttpExceptions: true
          });
          var retryCode = retry.getResponseCode();
          var retryText = safeGetText_(retry);
          if (retryCode >= 200 && retryCode < 300) {
            var j2 = JSON.parse(retryText);
            var d2 = j2 && j2.data ? j2.data : {};
            var a2 = (d2 && d2.results && Object.prototype.toString.call(d2.results) === '[object Array]') ? d2.results : [];
            var isC = !!(d2 && d2.isCached);
            return { payloadText: retryText, results: a2, isCached: isC };
          }
        } catch (e) { /* fall through */ }
      }

      // 429/5xx retry with backoff
      if ((code === 429 || code >= 500) && attempt < CONFIG_TX.daxko.maxRetries) {
        Utilities.sleep(backoff);
        attempt++;
        backoff = backoff * 2;
        continue;
      }

      var snippet = text ? text.substring(0, 500) : '';
      throw new Error('HTTP ' + code + ': ' + snippet);

    } catch (err) {
      if (attempt < CONFIG_TX.daxko.maxRetries) {
        Utilities.sleep(backoff);
        attempt++;
        backoff = backoff * 2;
        continue;
      }
      throw err;
    }
  }
}

// ---- Flattening & casting ----

/** Convert API results[] array into header rows + charge rows */
function flattenTransactions_(resultsArr, isCached) {
  var headers = [];
  var charges = [];

  for (var i = 0; i < resultsArr.length; i++) {
    var r = resultsArr[i] || {};
    var info = r.info || {};
    var ch  = r.charges || [];

    // Header row object matches TX_HEADER_FIELDS order
    headers.push({
      invoice: String(r.invoice || ''),
      date: castTxDate_(r.date),                    // Date object or ''
      memberName: castStr_(r.memberName),
      total: castNum_(r.total),
      enterType: castStr_(info.enterType),
      creditCard: castStr_(info.creditCard),
      nameOnCard: castStr_(info.nameOnCard),
      orderNumber: castStr_(info.orderNumber),
      referenceNumber: castStr_(info.referenceNumber),
      approvalCode: castStr_(info.approvalCode),
      isCached: isCached ? 'true' : 'false'
    });

    // Detail charge rows
    for (var j = 0; j < ch.length; j++) {
      var line = ch[j] || {};
      var cid = (line.id != null ? String(line.id) : '');
      var key = String(r.invoice || '') + '#' + cid;

      charges.push({
        InvoiceChargeKey: key,
        invoice: String(r.invoice || ''),
        chargeId: cid,
        description: castStr_(line.description),
        amount: castNum_(line.amount)
      });
    }
  }
  return { headers: headers, charges: charges };
}

/** Casts for fields */
function castStr_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
function castNum_(v) {
  if (v === null || v === undefined || v === '') return '';
  var n = Number(String(v).replace(/,/g, '').trim());
  return isFinite(n) ? n : '';
}
/** Parse 'MM/DD/YYYY HH:MMam' or 'MM/DD/YYYY HH:MMpm' into Date */
function castTxDate_(s) {
  if (!s) return '';
  var str = String(s).trim();
  // Example: 01/01/2025 08:48am
  var m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(am|pm)$/i);
  if (!m) {
    // Fallback try: Date(...)
    var d = new Date(str);
    return isNaN(d.getTime()) ? '' : d;
  }
  var month = parseInt(m[1], 10) - 1;
  var day   = parseInt(m[2], 10);
  var year  = parseInt(m[3], 10);
  var hh    = parseInt(m[4], 10);
  var mm    = parseInt(m[5], 10);
  var ampm  = m[6].toLowerCase();
  if (ampm === 'pm' && hh < 12) hh += 12;
  if (ampm === 'am' && hh === 12) hh = 0;
  var dt = new Date(year, month, day, hh, mm, 0);
  return isNaN(dt.getTime()) ? '' : dt;
}

// ---- Raw snapshots for TX ----

function saveRawPayloadTx_(payloadText, page) {
  var folder = getOrCreateFolderPath_(CONFIG_TX.raw.driveFolderPath);
  var ts   = new Date().toISOString().replace(/[:.]/g, '-');
  var base = 'transaction_search_' + ts + '_p' + page + '.json';

  if (CONFIG_TX.raw.gzip) {
    var blob = Utilities.newBlob(payloadText, 'application/json', base);
    var gzBlob = Utilities.gzip(blob, base + '.json.gz');
    folder.createFile(gzBlob);
  } else {
    folder.createFile(base, payloadText, MimeType.PLAIN_TEXT);
  }
}

// ---- Resume state for TX ----

function getResumeStateTx_() {
  var s = PropertiesService.getScriptProperties().getProperty(CONFIG_TX.stateKey);
  if (!s) return null;
  try { return JSON.parse(s); } catch (_) { return null; }
}
function setResumeStateTx_(obj) {
  PropertiesService.getScriptProperties().setProperty(CONFIG_TX.stateKey, JSON.stringify(obj));
}
function resetResumeStateTx_() {
  PropertiesService.getScriptProperties().deleteProperty(CONFIG_TX.stateKey);
  Logger.log('TX resume state cleared.');
}

// ---- TX-specific formatting ----

function applyHeaderFormatsTx_(sheet) {
  if (!sheet) return;
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rows = Math.max(0, sheet.getMaxRows() - 1);
  for (var i = 0; i < header.length; i++) {
    var c = i + 1;
    var name = header[i];
    if (name === 'date') {
      sheet.getRange(2, c, rows, 1).setNumberFormat('m/d/yyyy h:mm am/pm');
    } else if (name === 'total') {
      sheet.getRange(2, c, rows, 1).setNumberFormat('0.00');
    }
  }
}

function applyChargeFormatsTx_(sheet) {
  if (!sheet) return;
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rows = Math.max(0, sheet.getMaxRows() - 1);
  for (var i = 0; i < header.length; i++) {
    var c = i + 1;
    var name = header[i];
    if (name === 'amount') {
      sheet.getRange(2, c, rows, 1).setNumberFormat('0.00');
    }
  }
}

// ---- TX Audit (mirrors standard audit shape) ----

function ensureAuditSheetTx_() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(CONFIG_TX.audit.sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_TX.audit.sheetName);
    sheet.appendRow([
      'RunTimestamp','Status','StartPage','LastNonEmptyPage','PagesFetched','RecordsFetched',
      'Appended','Updated','RawFilesSaved','DurationMs','ResumeSavedPage','Format','PageSize','Error',
      'Refreshed','ParseMode','CSVSanitized'
    ]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,17).setFontWeight('bold');
  }
  return sheet;
}

function writeAuditLogTx_(info) {
  var sheet = ensureAuditSheetTx_();
  sheet.appendRow([
    info.runTimestamp,
    info.status,
    info.startPage || '',
    info.lastNonEmptyPage || '',
    info.pagesFetched || 0,
    info.recordsFetched || 0,
    info.appended || 0,         // header added
    info.updated || 0,          // header updated
    info.rawFilesSaved || 0,
    info.durationMs || 0,
    info.resumeSavedPage || '',
    info.format || 'json',
    info.pageSize || '',
    // include charge stats in the error column if success, so you can see it in the grid
    (info.error ? info.error :
      ('charges: +' + (info.txChargeAppended||0) + ', ~' + (info.txChargeUpdated||0))
    ),
    info.refreshed || 'no',
    info.parseMode || 'json',
    info.csvSanitized || 'no'
  ]);
}