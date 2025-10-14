/**
 * Sheet creation, formatting, upsert, and casting.
 */

function ensureSheetWithHeaders_(sheetName, desiredFields) {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.create('Daxko Imports');
  var sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(desiredFields);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, desiredFields.length).setFontWeight('bold');
    return sheet;
  }

  var lastCol = sheet.getLastColumn();
  var existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var missing = [];
  for (var i = 0; i < desiredFields.length; i++) {
    if (indexOf_(existing, desiredFields[i]) === -1) missing.push(desiredFields[i]);
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
  var lastCol = sheet.getLastColumn();
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var height = Math.max(0, sheet.getMaxRows() - 1);

  for (var i = 0; i < header.length; i++) {
    var name = header[i];
    var col = i + 1;
    if (contains_(CONFIG.typesNumericFields, name)) {
      sheet.getRange(2, col, height, 1).setNumberFormat(CONFIG.formats.numeric);
    } else if (contains_(CONFIG.typesDateFields, name)) {
      sheet.getRange(2, col, height, 1).setNumberFormat(CONFIG.formats.date);
    }
  }
}

function upsertRowsToSheet_(records, sheetName, uniqueKey) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(sheetName);
  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

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
  var updates = []; // {row, values[]}

  for (var r = 0; r < records.length; r++) {
    var rec = records[r];
    var id = rec[uniqueKey] != null ? String(rec[uniqueKey]) : '';
    if (!id) continue;
    var rowValues = getRowValuesWithCasting_(rec, header);
    if (Object.prototype.hasOwnProperty.call(idToRow, id)) {
      updates.push({ row: idToRow[id], values: rowValues });
    } else {
      toAppend.push(rowValues);
    }
  }

  updates.sort(function(a,b){ return a.row - b.row; });
  for (var u = 0; u < updates.length; u++) {
    sheet.getRange(updates[u].row, 1, 1, updates[u].values.length).setValues([updates[u].values]);
  }

  if (toAppend.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, toAppend[0].length).setValues(toAppend);
  }

  return { appended: toAppend.length, updated: updates.length };
}

function getRowValuesWithCasting_(rec, header) {
  var out = new Array(header.length);
  for (var i = 0; i < header.length; i++) {
    out[i] = castValue_(header[i], rec[header[i]]);
  }
  return out;
}

function castValue_(fieldName, rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return '';

  if (contains_(CONFIG.typesDateFields, fieldName)) {
    var d = parseDateFlexible_(rawValue);
    return d || '';
  }

  if (contains_(CONFIG.typesNumericFields, fieldName)) {
    var n = Number(String(rawValue).replace(/,/g, '').trim());
    return isFinite(n) ? n : '';
  }

  if (typeof rawValue === 'object') return JSON.stringify(rawValue);
  return String(rawValue);
}

function parseDateFlexible_(v) {
  var s = String(v).trim();
  var mdy = /^(\d{1,2})\/\-\/\-(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
  var iso = /^(\d{4})-(\d{2})-(\d{2})/;

  var m;
  if ((m = s.match(mdy))) {
    var month = parseInt(m[1], 10) - 1;
    var day   = parseInt(m[2], 10);
    var year  = parseInt(m[3], 10);
    var hh    = m[4] ? parseInt(m[4], 10) : 0;
    var mm    = m[5] ? parseInt(m[5], 10) : 0;
    var ss    = m[6] ? parseInt(m[6], 10) : 0;
    var d = new Date(year, month, day, hh, mm, ss);
    return isNaN(d.getTime()) ? null : d;
  }
  if ((m = s.match(iso))) {
    var y  = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10) - 1;
    var da = parseInt(m[3], 10);
    var d2 = new Date(y, mo, da);
    return isNaN(d2.getTime()) ? null : d2;
  }
  var d3 = new Date(s);
  return isNaN(d3.getTime()) ? null : d3;
}