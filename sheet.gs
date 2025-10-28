/**
 * Sheet creation, formatting, upsert, and casting.
 */

function ensureSheetWithHeaders_(sheetName, desiredFields) {
  var fields = desiredFields || [];
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.create('Daxko Imports');
  var sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  if (sheet.getLastRow() === 0) {
    if (fields.length) {
      sheet.appendRow(fields);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, fields.length).setFontWeight('bold');
    }
    return sheet;
  }

  var lastCol = sheet.getLastColumn();
  var existing = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var missing = [];
  for (var i = 0; i < fields.length; i++) {
    if (indexOf_(existing, fields[i]) === -1) missing.push(fields[i]);
  }
  if (missing.length) {
    sheet.insertColumnsAfter(existing.length, missing.length);
    var newHeaderRow = existing.concat(missing);
    sheet.getRange(1, 1, 1, newHeaderRow.length).setValues([newHeaderRow]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function applyColumnFormats_(sheet) {
  if (!sheet) return;
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return;

  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var height = Math.max(0, sheet.getMaxRows() - 1);
  if (height === 0) return;

  for (var i = 0; i < header.length; i++) {
    var name = header[i];
    var col = i + 1;
    if (contains_(CONFIG && CONFIG.typesNumericFields, name)) {
      sheet.getRange(2, col, height, 1).setNumberFormat((CONFIG && CONFIG.formats && CONFIG.formats.numeric) || '0');
    } else if (contains_(CONFIG && CONFIG.typesDateFields, name)) {
      sheet.getRange(2, col, height, 1).setNumberFormat((CONFIG && CONFIG.formats && CONFIG.formats.date) || 'yyyy-MM-dd');
    }
  }
}

function upsertRowsToSheet_(records, sheetName, uniqueKey) {
  var recs = records || [];
  var ss = SpreadsheetApp.getActive();
  var sheet = ss && ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) throw new Error('Sheet has no header. Did you call ensureSheetWithHeaders_ first?');

  var lastRow = sheet.getLastRow();
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];

  var keyCol = indexOf_(header, uniqueKey) + 1;
  if (keyCol <= 0) throw new Error('Unique key column not found: ' + uniqueKey);

  var existingRows = Math.max(0, lastRow - 1);
  var idToRow = Object.create(null);
  if (existingRows > 0) {
    var idValues = sheet.getRange(2, keyCol, existingRows, 1).getValues();
    for (var i = 0; i < idValues.length; i++) {
      var v = idValues[i][0];
      if (v !== '' && v !== null && v !== undefined) idToRow[String(v)] = i + 2;
    }
  }

  var toAppend = [];
  var updates = [];

  for (var r = 0; r < recs.length; r++) {
    var rec = recs[r] || {};
    var id = rec[uniqueKey] != null ? String(rec[uniqueKey]) : '';
    if (!id) continue;
    var rowValues = getRowValuesWithCasting_(rec, header);
    if (Object.prototype.hasOwnProperty.call(idToRow, id)) {
      updates.push({ row: idToRow[id], values: rowValues });
    } else {
      toAppend.push(rowValues);
    }
  }

  updates.sort(function(a, b) { return a.row - b.row; });
  for (var u = 0; u < updates.length; u++) {
    var vals = updates[u].values || [];
    if (vals.length) sheet.getRange(updates[u].row, 1, 1, vals.length).setValues([vals]);
  }

  if (toAppend.length) {
    var width = (toAppend[0] && toAppend[0].length) || header.length || 1;
    sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, width).setValues(toAppend);
  }

  return { appended: toAppend.length, updated: updates.length };
}

function getRowValuesWithCasting_(rec, header) {
  var h = header || [];
  var out = new Array(h.length);
  for (var i = 0; i < h.length; i++) {
    out[i] = castValue_(h[i], rec ? rec[h[i]] : undefined);
  }
  return out;
}

function castValue_(fieldName, rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return '';

  if (contains_(CONFIG && CONFIG.typesDateFields, fieldName)) {
    var d = parseDateFlexible_(rawValue);
    return d || '';
  }

  if (contains_(CONFIG && CONFIG.typesNumericFields, fieldName)) {
    var n = Number(String(rawValue).replace(/,/g, '').trim());
    return isFinite(n) ? n : '';
  }

  if (rawValue instanceof Date) return rawValue; // preserve Date objects
  if (typeof rawValue === 'object') return JSON.stringify(rawValue);
  return String(rawValue);
}

/**
 * Flexible parser for common date inputs.
 * Supports:
 *  - M/D/YYYY or MM/DD/YYYY with optional time and optional AM/PM
 *  - ISO 8601 YYYY-MM-DD with optional time, milliseconds, and Z/offset
 *  - Fallback to Date(s) where possible
 */
function parseDateFlexible_(v) {
  var s = String(v).trim();

  // M/D/YYYY[ HH:mm[:ss][ AM|PM]]
  var mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i;
  var m = s.match(mdy);
  if (m) {
    var month = parseInt(m[1], 10) - 1;
    var day   = parseInt(m[2], 10);
    var year  = parseInt(m[3], 10);
    if (year < 100) year += 2000; // simple 2-digit year handling
    var hh = m[4] ? parseInt(m[4], 10) : 0;
    var mm = m[5] ? parseInt(m[5], 10) : 0;
    var ss = m[6] ? parseInt(m[6], 10) : 0;
    var ampm = m[7] ? m[7].toUpperCase() : null;
    if (ampm) {
      if (hh === 12 && ampm === 'AM') hh = 0;
      else if (hh < 12 && ampm === 'PM') hh += 12;
    }
    var d = new Date(year, month, day, hh, mm, ss);
    return isNaN(d.getTime()) ? null : d;
  }

  // ISO 8601: YYYY-MM-DD[ T| ][HH:mm[:ss][.SSS]][Z|±HH:MM]
  var iso = /^(\d{4})-(\d{2})-(\d{2})(?:T :(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?(Z|[+\-]\d{2}:?\d{2})?)?$/;
  m = s.match(iso);
  if (m) {
    if (m[4] == null) {
      // Date only -> local date (no TZ)
      var y  = parseInt(m[1], 10);
      var mo = parseInt(m[2], 10) - 1;
      var da = parseInt(m[3], 10);
      var d2 = new Date(y, mo, da);
      return isNaN(d2.getTime()) ? null : d2;
    } else {
      // When a timezone exists, let JS parse it to preserve absolute time
      var d3 = new Date(s);
      if (!isNaN(d3.getTime())) return d3;

      // Fallback: build local date-time
      var y2  = parseInt(m[1], 10);
      var mo2 = parseInt(m[2], 10) - 1;
      var da2 = parseInt(m[3], 10);
      var hh2 = parseInt(m[4], 10);
      var mm2 = parseInt(m[5], 10);
      var ss2 = m[6] ? parseInt(m[6], 10) : 0;
      var d4 = new Date(y2, mo2, da2, hh2, mm2, ss2);
      return isNaN(d4.getTime()) ? null : d4;
    }
  }

  // Generic parse as a last resort
  var d5 = new Date(s);
  return isNaN(d5.getTime()) ? null : d5;
}

/** Utilities used internally by this file **/

/**
 * Return a sorted array with duplicates removed.
 */
function uniqueSorted_(arr) {
  arr.sort(function(a, b) { return a - b; });
  var out = [];
  var prev;
  for (var i = 0; i < arr.length; i++) {
    if (i === 0 || arr[i] !== prev) out.push(arr[i]);
    prev = arr[i];
  }
  return out;
}

/**
 * Compress sorted row numbers into contiguous [start..end] ranges.
 * Input: [3,4,5,9,10] -> [{start:3,end:5},{start:9,end:10}]
 */
function compressContiguousRows_(rows) {
  if (!rows.length) return [];
  var ranges = [];
  var start = rows[0];
  var prev = rows[0];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (r === prev + 1) {
      prev = r;
      continue;
    }
    ranges.push({ start: start, end: prev });
    start = prev = r;
  }
  ranges.push({ start: start, end: prev });
  return ranges;
}