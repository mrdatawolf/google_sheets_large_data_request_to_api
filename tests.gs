/**
 * Tests the new "array of jobs" logic in the report runner.
 */
function testRunReport_multiSheetJobs() {
  // Save originals
  var _origEnsure = (typeof ensureSheetWithHeaders_ === 'function') ? ensureSheetWithHeaders_ : null;
  var _origUpsert = (typeof upsertRowsToSheet_ === 'function') ? upsertRowsToSheet_ : null;

  // Mock sheet helpers
  var upsertCalls = [];
  ensureSheetWithHeaders_ = function(sheetName, fields) { return { _mock: true, name: sheetName }; };
  upsertRowsToSheet_ = function(records, sheetName, keyField) {
    upsertCalls.push({ sheetName: sheetName, count: records.length });
    return { appended: records.length, updated: 0 };
  };

  try {
    // 1. Define a mock config for this test
    var cfg = {
      pageSize: 10,
      runtime: { msBudget: 10000 },
      audit: { writeLog: function() {} }, // no-op
      
      // 2. Mock fetchPage to return a single, complex object
      fetchPage: function(body, page) {
        if (page > 1) return { records: [] };
        return { records: [{ api: 'response' }] };
      },

      // 3. The key part: flatten returns an array of "jobs"
      flattenRecords: function(resultsArr) {
        return [
          {
            sheetName: 'JobSheet1',
            records: [{id: 1}, {id: 2}],
            keyField: 'id',
            fields: ['id'],
            applyFormats: function(s) {}
          },
          {
            sheetName: 'JobSheet2',
            records: [{id: 3}, {id: 4}, {id: 5}],
            keyField: 'id',
            fields: ['id'],
            applyFormats: function(s) {}
          }
        ];
      }
    };

    // 4. Execute the runner
    var result = runReport(cfg);

    // 5. Assertions
    assertEquals_('status should be SUCCESS', 'SUCCESS', result.status);
    assertEquals_('total appended should be 5', 5, result.appended);
    
    assertEquals_('upsertRowsToSheet_ should be called twice', 2, upsertCalls.length);

    assertEquals_('first upsert sheet should be JobSheet1', 'JobSheet1', upsertCalls[0].sheetName);
    assertEquals_('first upsert count should be 2', 2, upsertCalls[0].count);

    assertEquals_('second upsert sheet should be JobSheet2', 'JobSheet2', upsertCalls[1].sheetName);
    assertEquals_('second upsert count should be 3', 3, upsertCalls[1].count);

    _logPass_('testRunReport_multiSheetJobs');

  } catch (e) {
    _logFail_('testRunReport_multiSheetJobs', e);
    throw e;
  } finally {
    // Restore originals
    if (_origEnsure) ensureSheetWithHeaders_ = _origEnsure;
    if (_origUpsert) upsertRowsToSheet_ = _origUpsert;
  }
}
