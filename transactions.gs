/**
 * Transaction Search runner (flattened to 2 sheets):
 *   - Header: one row per invoice (unique key: invoice)
 *   - Charges: one row per charge line (unique key: InvoiceChargeKey = invoice#chargeId)
 *
 * Sheets:
 *   CONFIG_TX.sheetName                 -> 'daxko_transactions'
 *   CONFIG_TX.chargesSheetName          -> 'daxko_transactions_charges'
 *
 * Raw .json/.json.gz saved in CONFIG_TX.raw.driveFolderPath
 * Audit -> CONFIG_TX.audit.sheetName
 * Digest email -> separate subject prefix (CONFIG.notifications.txSubjectPrefix)
 */

// ---- Public entrypoints ----

function runTransactionSearchDaily() {
  var t0 = Date.now();
  var status = 'SUCCESS';
  var errorMsg = '';

  // Initialize run flags (kept for diagnostics)
  RUN_FLAGS.didRefresh = false;
  RUN_FLAGS.parseMode = 'json';
  RUN_FLAGS.csvSanitized = false;

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
      // Re-scan last non-empty page (safe due to upsert)
      startPage = state.page;
    }

    var page = startPage;
    var headerRecords = [];
    var chargeRecords = [];

    while (true) {
      // Time budget guard (default ~4 min safety if not configured)
      var budgetMs = (CONFIG_TX.runtime && CONFIG_TX.runtime.msBudget) || 240000;
      if (!hasTimeLeft_(t0, budgetMs)) {
        Logger.log('Time budget reached; stopping at page ' + page);
        break;
      }

      var body = buildTransactionBody_(page);
      var result = fetchTransactionsPagePost_(body, page);
      var payloadText = result.payloadText;
      var resultsArr = result.results || [];
      var rowCount = resultsArr.length;

      if (CONFIG_TX.raw && CONFIG_TX.raw.enabled && payloadText) {
        saveRawPayloadTx_(payloadText, page);
        rawFilesSaved++;
      }

      if (rowCount === 0) {
        // No more results
        break;
      }

      pagesFetched++;

      // Flatten header + charges
      var flattened = flattenTransactions_(resultsArr, result.isCached);
      headerRecords = headerRecords.concat(flattened.headers || []);
      chargeRecords = chargeRecords.concat(flattened.charges || []);

      lastNonEmptyPage = page;
      if (rowCount < currentPageSize) {
        // Last page
        break;
      }
      page++;
    }

    // Write header sheet
    if (headerRecords.length > 0) {
      var headerSheet = ensureSheetWithHeaders_(CONFIG_TX.sheetName, TX_HEADER_FIELDS);
      var resH = upsertRowsToSheet_(headerRecords, CONFIG_TX.sheetName, CONFIG_TX.uniqueKey);
      headerAppended = resH.appended;
      headerUpdated  = resH.updated;
      applyHeaderFormatsTx_(headerSheet);
    }

    // Write charges sheet
    if (chargeRecords.length > 0) {
      var chargeSheet = ensureSheetWithHeaders_(CONFIG_TX.chargesSheetName, TX_CHARGE_FIELDS);
      var resC = upsertRowsToSheet_(chargeRecords, CONFIG_TX.chargesSheetName, 'InvoiceChargeKey');
      chargeAppended = resC.appended;
      chargeUpdated  = resC.updated;
      applyChargeFormatsTx_(chargeSheet);
    }

    // Save resume state if we saw any data
    if (lastNonEmptyPage !== null) {
      setResumeStateTx_({
        page: lastNonEmptyPage,
        pageSize: Number(CONFIG_TX.request.pageSize),
        // format: 'json', // optional parity with other modules
        updatedAt: new Date().toISOString()
      });
      resumeSavedPage = lastNonEmptyPage;
    }

  } catch (err) {
    status = 'ERROR';
    errorMsg = (err && err.message) ? String(err.message).substring(0, 1000) : String(err);
  } finally {
    var durationMs = Date.now() - t0;

    var info = {
      runTimestamp: new Date(),
      status: status,
      startPage: startPage,
      lastNonEmptyPage: lastNonEmptyPage,
      pagesFetched: pagesFetched,
      // Note: this is "rows written (header)" not "results fetched"
      recordsFetched: headerAppended + headerUpdated,
      appended: headerAppended,
      updated: headerUpdated,
      rawFilesSaved: rawFilesSaved,
      durationMs: durationMs,
      resumeSavedPage: resumeSavedPage,
      format: 'json',
      pageSize: Number(CONFIG_TX.request.pageSize),
      error: errorMsg,  // '' on success
      refreshed: RUN_FLAGS.didRefresh ? 'yes' : 'no',
      parseMode: 'json',
      csvSanitized: 'no',

      // Extra counts for notifications
      txChargeAppended: chargeAppended,
      txChargeUpdated:  chargeUpdated
    };

    // TX audit row
    try { writeAuditLogTx_(info); } catch (e1) { Logger.log('writeAuditLogTx_ failed: ' + e1); }

    // TX digest (plain text path; HTML/recipients handled by notifications.gs)
    try {
      sendRunDigestEmailFor_(info, {
        subjectPrefix: (CONFIG.notifications && CONFIG.notifications.txSubjectPrefix) || '[Daxko TX]',
        sheetName: CONFIG_TX.sheetName,
        auditSheet: CONFIG_TX.audit.sheetName
      });
    } catch (e2) {
      Logger.log('TX digest send failed: ' + e2);
    }
  }
}

/** Install daily TX trigger */
function setupTransactions() {
  setupReport(CONFIG_TX, 'runTransactionSearchDaily');
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
  var dateFrom = CONFIG_TX.request.dateFrom; // "YYYY-MM-DD"
  var dateTo = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return {
    dateFrom: dateFrom,
    dateTo: dateTo,
    page: String(page),
    pageSize: String(CONFIG_TX.request.pageSize)
  };
}

function fetchTransactionsPagePost_(body, page) {
  var attempt = 0;
  var backoff = Number(CONFIG_TX.daxko && CONFIG_TX.daxko.initialBackoffMs) || 500;
  var maxRetries = Number(CONFIG_TX.daxko && CONFIG_TX.daxko.maxRetries) || 3;

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
        return parseTxResponse_(text, page);
      }

      // Auth retry (401/403)
      if (code === 401 || code === 403) {
        try {
          refreshAccessToken_();
          RUN_FLAGS.didRefresh = true;
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
            return parseTxResponse_(retryText, page);
          }
          // Fall through with new code/text to error handling
          code = retryCode;
          text = retryText;
        } catch (e) {
          // Fall through to retry/backoff below
        }
      }

      // 429/5xx retry with backoff
      if ((code === 429 || code >= 500) && attempt < maxRetries) {
        Utilities.sleep(backoff);
        attempt++;
        backoff = Math.min(backoff * 2, 30000); // cap at 30s
        continue;
      }

      var snippet = text ? text.substring(0, 500) : '';
      throw new Error('HTTP ' + code + ' on page ' + page + ': ' + snippet);

    } catch (err) {
      if (attempt < maxRetries) {
        Utilities.sleep(backoff);
        attempt++;
        backoff = Math.min(backoff * 2, 30000);
        continue;
      }
      throw err;
    }
  }
}

/** Single JSON parsing path for both initial and retry responses */
function parseTxResponse_(text, page) {
  var json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error('Invalid JSON on page ' + page + ': ' + e);
  }
  var data = json && json.data ? json.data : {};
  var results = Array.isArray(data.results) ? data.results : [];
  var isCached = !!data.isCached;
  return { payloadText: text, results: results, isCached: isCached };
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
/** Parse 'MM/DD/YYYY HH:MMam' or 'MM/DD/YYYY HH:MM pm' into Date */
function castTxDate_(s) {
  if (!s) return '';
  var str = String(s).trim();
  // Examples: 01/01/2025 08:48am  |  01/01/2025 08:48 am
  var m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) {
    // Fallback: native Date
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
  var baseName = 'transaction_search_' + ts + '_p' + page;
  if (CONFIG_TX.raw.gzip) {
    var blob  = Utilities.newBlob(payloadText, 'application/json', baseName + '.json');
    var gzBlob = Utilities.gzip(blob, baseName + '.json.gz'); // keep your existing pattern
    folder.createFile(gzBlob);
  } else {
    folder.createFile(baseName + '.json', payloadText, MimeType.JSON);
  }
}

// ---- Resume state for TX (DRY via JSON prop helpers) ----

function getResumeStateTx_() {
  return getJSONProp_(CONFIG_TX.stateKey);
}
function setResumeStateTx_(obj) {
  setJSONProp_(CONFIG_TX.stateKey, obj);
}
function resetResumeStateTx_() {
  PropertiesService.getScriptProperties().deleteProperty(CONFIG_TX.stateKey);
  Logger.log('TX resume state cleared.');
}

// ---- TX-specific formatting ----

function applyHeaderFormatsTx_(sheet) {
  if (!sheet) return;
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return;
  var rows = Math.max(0, sheet.getMaxRows() - 1);
  if (rows === 0) return;

  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
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
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return;
  var rows = Math.max(0, sheet.getMaxRows() - 1);
  if (rows === 0) return;

  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
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
    var header = [
      'RunTimestamp','Status','StartPage','LastNonEmptyPage','PagesFetched','RecordsFetched',
      'Appended','Updated','RawFilesSaved','DurationMs','ResumeSavedPage','Format','PageSize','Error',
      'Refreshed','ParseMode','CSVSanitized'
    ];
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,header.length).setFontWeight('bold');
    // Optional: apply timestamp format
    sheet.getRange('A:A').setNumberFormat('yyyy-MM-dd HH:mm:ss');
  }
  return sheet;
}

function writeAuditLogTx_(info) {
  var sheet = ensureAuditSheetTx_();
  // Maintain same order as header
  sheet.appendRow([
    info.runTimestamp || new Date(),
    info.status || 'UNKNOWN',
    info.startPage || '',
    info.lastNonEmptyPage || '',
    info.pagesFetched || 0,
    info.recordsFetched || 0,
    info.appended || 0,
    info.updated || 0,
    info.rawFilesSaved || 0,
    info.durationMs || 0,
    info.resumeSavedPage || '',
    info.format || 'json',
    info.pageSize || '',
    info.error || '',
    info.refreshed || 'no',
    info.parseMode || 'json',
    info.csvSanitized || 'no'
  ]);
}