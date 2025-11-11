/**
 * Main Test Runner
 *
 * This file serves as the entry point for all tests.
 * Run individual test suites or all tests from here.
 *
 * Quick Start:
 *   - runAllTests()           → Run all test suites
 *   - runStateTests()         → Test state management
 *   - runSheetTests()         → Test sheet operations
 *   - runUtilsTests()         → Test utility functions
 *   - runConfigTests()        → Test configuration validation
 *   - runAuthTests()          → Test authentication
 *   - runFetchTests()         → Test HTTP and parsing
 *   - runReportRunnerTests()  → Test report runner logic
 */

// ==============================================================================
// RUN ALL TESTS
// ==============================================================================

/**
 * Run all test suites
 * This is the main entry point to run the entire test suite
 */
function runAllTests() {
  _resetTestResults_();
  Logger.log('\n' + '='.repeat(60));
  Logger.log('RUNNING ALL TESTS');
  Logger.log('='.repeat(60) + '\n');

  runStateTests();
  runSheetTests();
  runUtilsTests();
  runConfigTests();
  runAuthTests();
  runFetchTests();
  runReportRunnerTests();

  _printTestSummary_();
}

// ==============================================================================
// INDIVIDUAL TEST SUITE RUNNERS
// ==============================================================================

/**
 * Run state management tests
 */
function runStateTests() {
  Logger.log('\n--- State Management Tests ---');
  _runSingleTest_(testStateManagement_saveAndLoad, 'testStateManagement_saveAndLoad');
  _runSingleTest_(testStateManagement_reset, 'testStateManagement_reset');
  _runSingleTest_(testStateManagement_invalidJSON, 'testStateManagement_invalidJSON');
  _runSingleTest_(testStateManagement_forceResume, 'testStateManagement_forceResume');
}

/**
 * Run sheet operation tests
 */
function runSheetTests() {
  Logger.log('\n--- Sheet Operation Tests ---');
  _runSingleTest_(testSheet_fieldMapping, 'testSheet_fieldMapping');
  _runSingleTest_(testSheet_castValue_date, 'testSheet_castValue_date');
  _runSingleTest_(testSheet_castValue_number, 'testSheet_castValue_number');
  _runSingleTest_(testSheet_castValue_string, 'testSheet_castValue_string');
  _runSingleTest_(testDateParsing_ISO8601, 'testDateParsing_ISO8601');
  _runSingleTest_(testDateParsing_slashFormat, 'testDateParsing_slashFormat');
  _runSingleTest_(testDateParsing_invalid, 'testDateParsing_invalid');
  _runSingleTest_(testDateParsing_null, 'testDateParsing_null');
  _runSingleTest_(testDateParsing_emptyString, 'testDateParsing_emptyString');
}

/**
 * Run utility function tests
 */
function runUtilsTests() {
  Logger.log('\n--- Utility Function Tests ---');
  _runSingleTest_(testFieldMapping_basic, 'testFieldMapping_basic');
  _runSingleTest_(testFieldMapping_missingField, 'testFieldMapping_missingField');
  _runSingleTest_(testFieldMapping_emptyArray, 'testFieldMapping_emptyArray');
  _runSingleTest_(testTimeBudget_withinBudget, 'testTimeBudget_withinBudget');
  _runSingleTest_(testTimeBudget_exceededBudget, 'testTimeBudget_exceededBudget');
  _runSingleTest_(testUtils_indexOf, 'testUtils_indexOf');
  _runSingleTest_(testUtils_contains, 'testUtils_contains');
}

/**
 * Run configuration validation tests
 */
function runConfigTests() {
  Logger.log('\n--- Configuration Validation Tests ---');
  _runSingleTest_(testConfigValidation_missingBuildRequestBody, 'testConfigValidation_missingBuildRequestBody');
  _runSingleTest_(testConfigValidation_missingFetchPage, 'testConfigValidation_missingFetchPage');
  _runSingleTest_(testConfigValidation_invalidSheetConfigs, 'testConfigValidation_invalidSheetConfigs');
  _runSingleTest_(testConfigValidation_validConfig, 'testConfigValidation_validConfig');
  _runSingleTest_(testConfigValidation_missingSheetName, 'testConfigValidation_missingSheetName');
  _runSingleTest_(testConfigValidation_missingKeyField, 'testConfigValidation_missingKeyField');
}

/**
 * Run authentication tests
 */
function runAuthTests() {
  Logger.log('\n--- Authentication Tests ---');
  _runSingleTest_(testAuth_tokenStructure, 'testAuth_tokenStructure');
  _runSingleTest_(testAuth_headerFormat, 'testAuth_headerFormat');
}

/**
 * Run HTTP and parsing tests
 */
function runFetchTests() {
  Logger.log('\n--- HTTP and Parsing Tests ---');
  _runSingleTest_(testResponseParsing_standardResults, 'testResponseParsing_standardResults');
  _runSingleTest_(testResponseParsing_nestedResults, 'testResponseParsing_nestedResults');
  _runSingleTest_(testResponseParsing_dataResults, 'testResponseParsing_dataResults');
  _runSingleTest_(testResponseParsing_emptyResults, 'testResponseParsing_emptyResults');
  _runSingleTest_(testResponseParsing_invalidJSON, 'testResponseParsing_invalidJSON');
}

/**
 * Run report runner tests (includes the original multi-sheet test)
 */
function runReportRunnerTests() {
  Logger.log('\n--- Report Runner Tests ---');
  _runSingleTest_(testRunReport_multiSheetJobs, 'testRunReport_multiSheetJobs');
  _runSingleTest_(testPagination_emptyFirstPage, 'testPagination_emptyFirstPage');
  _runSingleTest_(testPagination_partialLastPage, 'testPagination_partialLastPage');
}

// ==============================================================================
// ORIGINAL MULTI-SHEET TEST (preserved from original tests.gs)
// ==============================================================================

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
      },

      // 4. Add buildRequestBody for validation
      buildRequestBody: function(page) {
        return { pageNumber: page };
      },

      // 5. Add sheetConfigs for validation
      sheetConfigs: [
        { sheetName: 'JobSheet1', fields: ['id'], keyField: 'id' },
        { sheetName: 'JobSheet2', fields: ['id'], keyField: 'id' }
      ]
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

  } catch (e) {
    throw e;
  } finally {
    // Restore originals
    if (_origEnsure) ensureSheetWithHeaders_ = _origEnsure;
    if (_origUpsert) upsertRowsToSheet_ = _origUpsert;
  }
}

// ==============================================================================
// PAGINATION TESTS
// ==============================================================================

/**
 * Test pagination with empty first page
 */
function testPagination_emptyFirstPage() {
  // Save originals
  var _origEnsure = (typeof ensureSheetWithHeaders_ === 'function') ? ensureSheetWithHeaders_ : null;
  var _origUpsert = (typeof upsertRowsToSheet_ === 'function') ? upsertRowsToSheet_ : null;

  // Mock sheet helpers
  ensureSheetWithHeaders_ = function(sheetName, fields) { return { _mock: true, name: sheetName }; };
  upsertRowsToSheet_ = function(records, sheetName, keyField) {
    return { appended: 0, updated: 0 };
  };

  try {
    var cfg = {
      pageSize: 10,
      runtime: { msBudget: 10000 },
      audit: { writeLog: function() {} },

      // Return empty results on first page
      fetchPage: function(body, page) {
        return { records: [] };  // Empty first page
      },

      flattenRecords: function(resultsArr) {
        return [{
          sheetName: 'TestSheet',
          records: resultsArr,
          keyField: 'id',
          fields: ['id'],
          applyFormats: function(s) {}
        }];
      },

      buildRequestBody: function(page) {
        return { pageNumber: page };
      },

      sheetConfigs: [
        { sheetName: 'TestSheet', fields: ['id'], keyField: 'id' }
      ]
    };

    var result = runReport(cfg);

    // Should complete successfully even with no data
    assertEquals_('status should be SUCCESS', 'SUCCESS', result.status);
    assertEquals_('should have 0 records fetched', 0, result.recordsFetched || 0);

  } finally {
    if (_origEnsure) ensureSheetWithHeaders_ = _origEnsure;
    if (_origUpsert) upsertRowsToSheet_ = _origUpsert;
  }
}

/**
 * Test pagination with partial last page
 */
function testPagination_partialLastPage() {
  // Save originals
  var _origEnsure = (typeof ensureSheetWithHeaders_ === 'function') ? ensureSheetWithHeaders_ : null;
  var _origUpsert = (typeof upsertRowsToSheet_ === 'function') ? upsertRowsToSheet_ : null;

  var fetchCount = 0;

  // Mock sheet helpers
  ensureSheetWithHeaders_ = function(sheetName, fields) { return { _mock: true, name: sheetName }; };
  upsertRowsToSheet_ = function(records, sheetName, keyField) {
    return { appended: records.length, updated: 0 };
  };

  try {
    var cfg = {
      pageSize: 50,
      runtime: { msBudget: 10000 },
      audit: { writeLog: function() {} },

      // First page: full (50 records)
      // Second page: partial (25 records) - should detect end
      fetchPage: function(body, page) {
        fetchCount++;
        if (page === 1) {
          // Full page
          var records = [];
          for (var i = 1; i <= 50; i++) {
            records.push({ id: i });
          }
          return { records: records };
        } else if (page === 2) {
          // Partial page (less than pageSize)
          var records = [];
          for (var i = 51; i <= 75; i++) {
            records.push({ id: i });
          }
          return { records: records };
        } else {
          // Should not reach page 3
          return { records: [] };
        }
      },

      flattenRecords: function(resultsArr) {
        return [{
          sheetName: 'TestSheet',
          records: resultsArr,
          keyField: 'id',
          fields: ['id'],
          applyFormats: function(s) {}
        }];
      },

      buildRequestBody: function(page) {
        return { pageNumber: page };
      },

      sheetConfigs: [
        { sheetName: 'TestSheet', fields: ['id'], keyField: 'id' }
      ]
    };

    var result = runReport(cfg);

    // Should complete successfully
    assertEquals_('status should be SUCCESS', 'SUCCESS', result.status);
    assertEquals_('should fetch 2 pages', 2, fetchCount);
    assertEquals_('should have 75 records total', 75, result.recordsFetched || 0);

  } finally {
    if (_origEnsure) ensureSheetWithHeaders_ = _origEnsure;
    if (_origUpsert) upsertRowsToSheet_ = _origUpsert;
  }
}

// ==============================================================================
// QUICK TEST SHORTCUTS
// ==============================================================================

/**
 * Quick test - just run state tests
 */
function quickTestState() {
  _resetTestResults_();
  runStateTests();
  _printTestSummary_();
}

/**
 * Quick test - just run sheet tests
 */
function quickTestSheet() {
  _resetTestResults_();
  runSheetTests();
  _printTestSummary_();
}

/**
 * Quick test - just run utils tests
 */
function quickTestUtils() {
  _resetTestResults_();
  runUtilsTests();
  _printTestSummary_();
}

/**
 * Quick test - just run config tests
 */
function quickTestConfig() {
  _resetTestResults_();
  runConfigTests();
  _printTestSummary_();
}
