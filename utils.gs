/**
 * Shared utilities (string/CSV safety, arrays, folders, scheduling, timers).
 */

function mapPickFields_(arr, fields) {
  var a = arr || [];
  var out = new Array(a.length);
  for (var i = 0; i < a.length; i++) out[i] = pickFields_(a[i], fields);
  return out;
}

function pickFields_(obj, fields) {
  var out = {};
  var fs = fields || [];
  for (var i = 0; i < fs.length; i++) {
    var f = fs[i];
    var has = obj && Object.prototype.hasOwnProperty.call(obj, f);
    var v = has ? obj[f] : '';
    out[f] = (v == null) ? '' : v;
  }
  return out;
}

function toTrimmedRow_(row) {
  var r = row || [];
  var out = new Array(r.length);
  for (var i = 0; i < r.length; i++) {
    var cell = r[i];
    out[i] = (cell && cell.trim) ? cell.trim() : cell;
  }
  return out;
}

function indexOf_(arr, value) {
  if (!arr || !arr.length) return -1;
  for (var i = 0; i < arr.length; i++) if (arr[i] === value) return i;
  return -1;
}

function contains_(arr, value) {
  if (!arr || !arr.length) return false; // null-safe
  for (var i = 0; i < arr.length; i++) if (arr[i] === value) return true;
  return false;
}

function getOrCreateFolderPath_(path) {
  var parts = String(path || '').split('/').filter(function (x) { return x; });
  var folder = DriveApp.getRootFolder();
  for (var i = 0; i < parts.length; i++) {
    var it = folder.getFoldersByName(parts[i]);
    folder = it.hasNext() ? it.next() : folder.createFolder(parts[i]);
  }
  return folder;
}

/**
 * Decode HTTP response body as UTF‑8 and normalize:
 *  - Strip BOM
 *  - Normalize CRLF/CR to LF
 */
function safeGetText_(resp) {
  if (!resp) return '';
  var text = '';
  try {
    if (resp.getContentText) text = resp.getContentText('UTF-8');
  } catch (_) {}
  if (!text) {
    try {
      var bytes = resp.getContent ? resp.getContent() : null;
      if (bytes) text = Utilities.newBlob(bytes).getDataAsString('UTF-8');
    } catch (_) {}
  }
  if (!text && resp.getContentText) {
    try { text = resp.getContentText(); } catch (_) {}
  }
  text = text || '';
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Returns true if we still have time left in this execution. */
function hasTimeLeft_(startMs, budgetMs) {
  return (Date.now() - startMs) < Math.max(60000, budgetMs || 240000); // avoid running into the last minute
}

/**
 * Schedule a continuation run and avoid duplicate CLOCK triggers for the same handler.
 * Backward compatible: if called with no args, uses the legacy defaults:
 *  - handlerName: 'runDaxkoReport1Daily'
 *  - afterMs: 60*1000
 */
function scheduleContinuation_(handlerName, afterMs) {
  var handler = handlerName || 'runDaxkoReport1Daily';
  var delay = Math.max(10000, (afterMs == null ? 60 * 1000 : Number(afterMs) || 60 * 1000));

  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var t = triggers[i];
    var getFn = t.getHandlerFunction ? t.getHandlerFunction() : null;
    var src = t.getTriggerSource ? t.getTriggerSource() : null;
    if (getFn === handler && src === ScriptApp.TriggerSource.CLOCK) {
      ScriptApp.deleteTrigger(t);
    }
  }

  ScriptApp.newTrigger(handler).timeBased().after(delay).create();
  Logger.log('Continuation scheduled for handler "' + handler + '" in ' + Math.round(delay/1000) + 's.');
}

function listTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    Logger.log(
      `Trigger ID: ${trigger.getUniqueId()}, Function: ${trigger.getHandlerFunction()}, Type: ${trigger.getEventType()}`
    );
  });
}
function selfTest_CONFIG_TX_flatten() {
  var sample = {
    "data": {
      "results": [
        {
          "invoice": "E-926591",
          "date": "01/01/2025 08:48am",
          "memberName": "Cassandra Hesseltine",
          "total": 10.3,
          "info": {
            "enterType": "manual",
            "creditCard": "4***********5730",
            "nameOnCard": "Cassandra Hesseltine",
            "orderNumber": "GN-1596-662336399982903296",
            "referenceNumber": "GN-1596-662336399982903296",
            "approvalCode": null
          },
          "charges": [
            {"id": 2115405, "description": "Service Fee", "amount": 0.3},
            {"id": 2115313, "description": "Hold membership \"Arc - Dues- Business Partner\" (12/31/2024)", "amount": 10}
          ]
        },
        {
          "invoice": "E-926592",
          "date": "01/01/2025 08:48am",
          "memberName": "Teagan Hesseltine",
          "total": 57.68,
          "info": {
            "enterType": "manual",
            "creditCard": "4***********5730",
            "nameOnCard": "Cassandra Hesseltine",
            "orderNumber": "GN-1596-662336399982903296",
            "referenceNumber": "GN-1596-662336399982903296",
            "approvalCode": null
          },
          "charges": [
            {"id": 2115406, "description": "Service Fee", "amount": 1.68},
            {"id": 2113897, "description": "Membership for \"Arc - Dues- Business Partner Sub Member\" (January 2025)", "amount": 56}
          ]
        }
      ],
      "isCached": false, "cacheDate": null
    },
    "success": true, "error": null, "formErrors": null
  };

  var flattened = CONFIG_TX.flattenRecords(sample);
  Logger.log('Invoices: ' + flattened.invoices.length);
  Logger.log('Charges: ' + flattened.charges.length);
  Logger.log(JSON.stringify(flattened.invoices[0], null, 2));
  Logger.log(JSON.stringify(flattened.charges[0], null, 2));
}



// Optional: set TX dateFrom via state without changing code
function setTxDateFrom_(yyyyMmDd) {
  var stateKey = 'TX_STATE';
  var raw = PropertiesService.getScriptProperties().getProperty(stateKey);
  var st = raw ? JSON.parse(raw) : {};
  st.dateFrom = yyyyMmDd; // e.g., "2025-01-01"
  PropertiesService.getScriptProperties().setProperty(stateKey, JSON.stringify(st));
}