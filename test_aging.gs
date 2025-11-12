/**
 * Accounting Aging Report Tests
 * Tests for accountingAgingReport.gs functions - statement period management
 */

/**
 * Test getCurrentStatementPeriod_ returns previous month in YYYY-MM format
 */
function testAgingReport_getCurrentStatementPeriod() {
  var period = getCurrentStatementPeriod_();

  assertNotNull_('period should not be null', period);
  assertTrue_('period should be a string', typeof period === 'string');

  // Should match YYYY-MM format
  var regex = /^\d{4}-\d{2}$/;
  assertTrue_('period should match YYYY-MM format', regex.test(period));

  // Should be a valid month (01-12)
  var parts = period.split('-');
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10);

  assertTrue_('year should be reasonable', year >= 2020 && year <= 2100);
  assertTrue_('month should be 1-12', month >= 1 && month <= 12);

  // Period should be in the past (previous month)
  var now = new Date();
  var currentYear = now.getFullYear();
  var currentMonth = now.getMonth() + 1; // 1-12

  // Calculate expected previous month
  var expectedYear = currentYear;
  var expectedMonth = currentMonth - 1;
  if (expectedMonth === 0) {
    expectedYear -= 1;
    expectedMonth = 12;
  }

  var expectedPeriod = expectedYear + '-' + String(expectedMonth).padStart(2, '0');
  assertEquals_('should return previous month', expectedPeriod, period);
}

/**
 * Test getCurrentStatementPeriod_ handles January correctly
 */
function testAgingReport_getCurrentStatementPeriod_january() {
  // This test documents expected behavior when current month is January
  // The function should return December of previous year

  var now = new Date();
  var currentMonth = now.getMonth() + 1; // 1-12

  if (currentMonth === 1) {
    // Only run this test in January
    var period = getCurrentStatementPeriod_();
    var parts = period.split('-');
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);

    assertEquals_('month should be December (12)', 12, month);
    assertEquals_('year should be previous year', now.getFullYear() - 1, year);
  } else {
    // Skip test when not in January
    Logger.log('testAgingReport_getCurrentStatementPeriod_january - skipped (not January)');
    assertTrue_('placeholder test', true);
  }
}

/**
 * Test setStatementPeriod_ and getStatementPeriod_ custom override
 */
function testAgingReport_setCustomStatementPeriod() {
  var testKey = 'AGING_STATEMENT_PERIOD';
  var testPeriod = '2025-06';

  // Save original value if exists
  var originalValue = PropertiesService.getScriptProperties().getProperty(testKey);

  try {
    // Set custom period
    setStatementPeriod_(testPeriod);

    // Verify it was saved
    var saved = PropertiesService.getScriptProperties().getProperty(testKey);
    assertEquals_('custom period should be saved', testPeriod, saved);

    // Verify getStatementPeriod_ returns the custom value
    var retrieved = getStatementPeriod_();
    assertEquals_('getStatementPeriod_ should return custom value', testPeriod, retrieved);

  } finally {
    // Cleanup - restore original value or delete
    if (originalValue) {
      PropertiesService.getScriptProperties().setProperty(testKey, originalValue);
    } else {
      PropertiesService.getScriptProperties().deleteProperty(testKey);
    }
  }
}

/**
 * Test clearStatementPeriod_ removes custom override
 */
function testAgingReport_clearStatementPeriod() {
  var testKey = 'AGING_STATEMENT_PERIOD';
  var testPeriod = '2025-03';

  // Save original value if exists
  var originalValue = PropertiesService.getScriptProperties().getProperty(testKey);

  try {
    // Set a custom period first
    setStatementPeriod_(testPeriod);

    // Verify it was set
    var beforeClear = PropertiesService.getScriptProperties().getProperty(testKey);
    assertEquals_('period should be set before clear', testPeriod, beforeClear);

    // Clear the custom period
    clearStatementPeriod_();

    // Verify it was cleared
    var afterClear = PropertiesService.getScriptProperties().getProperty(testKey);
    assertNull_('period should be null after clear', afterClear);

    // Verify getStatementPeriod_ now returns automatic period
    var period = getStatementPeriod_();
    var autoPeriod = getCurrentStatementPeriod_();
    assertEquals_('should return automatic period after clear', autoPeriod, period);

  } finally {
    // Cleanup - restore original value or delete
    if (originalValue) {
      PropertiesService.getScriptProperties().setProperty(testKey, originalValue);
    } else {
      PropertiesService.getScriptProperties().deleteProperty(testKey);
    }
  }
}

/**
 * Test getStatementPeriod_ returns automatic period when no override
 */
function testAgingReport_getStatementPeriod_noOverride() {
  var testKey = 'AGING_STATEMENT_PERIOD';

  // Save original value if exists
  var originalValue = PropertiesService.getScriptProperties().getProperty(testKey);

  try {
    // Ensure no custom period is set
    PropertiesService.getScriptProperties().deleteProperty(testKey);

    // Get period without override
    var period = getStatementPeriod_();
    var autoPeriod = getCurrentStatementPeriod_();

    assertEquals_('should return automatic period', autoPeriod, period);

  } finally {
    // Cleanup - restore original value or delete
    if (originalValue) {
      PropertiesService.getScriptProperties().setProperty(testKey, originalValue);
    } else {
      PropertiesService.getScriptProperties().deleteProperty(testKey);
    }
  }
}

/**
 * Test setStatementPeriod_ with different period formats
 */
function testAgingReport_setStatementPeriod_formats() {
  var testKey = 'AGING_STATEMENT_PERIOD';

  // Save original value if exists
  var originalValue = PropertiesService.getScriptProperties().getProperty(testKey);

  try {
    // Test various formats
    var testPeriods = [
      '2025-01',  // January
      '2025-12',  // December
      '2024-06',  // Mid-year
      '2023-11'   // Past year
    ];

    for (var i = 0; i < testPeriods.length; i++) {
      var testPeriod = testPeriods[i];
      setStatementPeriod_(testPeriod);

      var retrieved = getStatementPeriod_();
      assertEquals_('period should match for ' + testPeriod, testPeriod, retrieved);
    }

  } finally {
    // Cleanup - restore original value or delete
    if (originalValue) {
      PropertiesService.getScriptProperties().setProperty(testKey, originalValue);
    } else {
      PropertiesService.getScriptProperties().deleteProperty(testKey);
    }
  }
}

/**
 * Test CONFIG_AGING buildRequestBody includes correct criteriaFields
 */
function testAgingReport_configBuildBody() {
  // Test that CONFIG_AGING exists
  assertTrue_('CONFIG_AGING should be defined', typeof CONFIG_AGING !== 'undefined');

  if (typeof CONFIG_AGING === 'undefined') {
    return;  // Skip rest of test if config not available
  }

  // Test buildRequestBody function
  assertTrue_('CONFIG_AGING should have buildBody function',
    typeof CONFIG_AGING.buildRequestBody === 'function');

  var testKey = 'AGING_STATEMENT_PERIOD';
  var originalValue = PropertiesService.getScriptProperties().getProperty(testKey);

  try {
    // Clear any custom period for consistent test
    PropertiesService.getScriptProperties().deleteProperty(testKey);

    // Build request body for page 1
    var body = CONFIG_AGING.buildRequestBody(1);

    // Assertions
    assertNotNull_('body should not be null', body);
    assertEquals_('format should be json', 'json', body.format);
    assertEquals_('pageSize should be 50', '50', body.pageSize);
    assertEquals_('pageNumber should be 1', '1', body.pageNumber);

    // Check outputFields
    assertNotNull_('outputFields should exist', body.outputFields);
    assertTrue_('outputFields should be array', Array.isArray(body.outputFields));
    assertTrue_('outputFields should include SystemId',
      body.outputFields.indexOf('SystemId') >= 0);

    // Check criteriaFields structure
    assertNotNull_('criteriaFields should exist', body.criteriaFields);
    assertNotNull_('criteriaFields.aging should exist', body.criteriaFields.aging);

    var aging = body.criteriaFields.aging;
    assertNotNull_('statement_period should exist', aging.statement_period);
    assertEquals_('combined should be individual', 'individual', aging.combined);
    assertEquals_('transaction_type should be 0', '0', aging.transaction_type);

    // statement_period should be in YYYY-MM format
    var regex = /^\d{4}-\d{2}$/;
    assertTrue_('statement_period should match YYYY-MM format',
      regex.test(aging.statement_period));

  } finally {
    // Cleanup
    if (originalValue) {
      PropertiesService.getScriptProperties().setProperty(testKey, originalValue);
    } else {
      PropertiesService.getScriptProperties().deleteProperty(testKey);
    }
  }
}

/**
 * Test CONFIG_AGING buildRequestBody respects custom statement period
 */
function testAgingReport_configBuildBody_customPeriod() {
  if (typeof CONFIG_AGING === 'undefined') {
    Logger.log('testAgingReport_configBuildBody_customPeriod - skipped (CONFIG_AGING not defined)');
    return;
  }

  var testKey = 'AGING_STATEMENT_PERIOD';
  var testPeriod = '2024-08';
  var originalValue = PropertiesService.getScriptProperties().getProperty(testKey);

  try {
    // Set custom period
    setStatementPeriod_(testPeriod);

    // Build request body
    var body = CONFIG_AGING.buildRequestBody(1);

    // Verify the custom period is used
    assertNotNull_('body should not be null', body);
    assertNotNull_('criteriaFields.aging should exist', body.criteriaFields.aging);
    assertEquals_('statement_period should match custom value',
      testPeriod, body.criteriaFields.aging.statement_period);

  } finally {
    // Cleanup
    if (originalValue) {
      PropertiesService.getScriptProperties().setProperty(testKey, originalValue);
    } else {
      PropertiesService.getScriptProperties().deleteProperty(testKey);
    }
  }
}

/**
 * Test CONFIG_AGING has correct configuration
 */
function testAgingReport_configStructure() {
  assertTrue_('CONFIG_AGING should be defined', typeof CONFIG_AGING !== 'undefined');

  if (typeof CONFIG_AGING === 'undefined') {
    return;
  }

  // Check basic config properties
  assertEquals_('apiUrl should be correct',
    'https://api.partners.daxko.com/api/v1/reports/22', CONFIG_AGING.apiUrl);
  assertEquals_('pageSize should be 50', 50, CONFIG_AGING.pageSize);
  assertEquals_('format should be json', 'json', CONFIG_AGING.format);

  // Check sheetConfigs
  assertNotNull_('sheetConfigs should exist', CONFIG_AGING.sheetConfigs);
  assertTrue_('sheetConfigs should be array', Array.isArray(CONFIG_AGING.sheetConfigs));
  assertTrue_('sheetConfigs should have at least 1 config', CONFIG_AGING.sheetConfigs.length > 0);

  var mainSheet = CONFIG_AGING.sheetConfigs[0];
  assertEquals_('main sheet should be AccountingAging', 'AccountingAging', mainSheet.sheetName);
  assertEquals_('keyField should be SystemId', 'SystemId', mainSheet.keyField);

  // Check required functions
  assertTrue_('buildRequestBody should be function',
    typeof CONFIG_AGING.buildRequestBody === 'function');
  assertTrue_('fetchPage should be function',
    typeof CONFIG_AGING.fetchPage === 'function');
  assertTrue_('flattenRecords should be function',
    typeof CONFIG_AGING.flattenRecords === 'function');
}

/**
 * Test CONFIG_AGING buildRequestBody with different page numbers
 */
function testAgingReport_configBuildBody_pagination() {
  if (typeof CONFIG_AGING === 'undefined') {
    Logger.log('testAgingReport_configBuildBody_pagination - skipped (CONFIG_AGING not defined)');
    return;
  }

  var testKey = 'AGING_STATEMENT_PERIOD';
  var originalValue = PropertiesService.getScriptProperties().getProperty(testKey);

  try {
    // Clear any custom period
    PropertiesService.getScriptProperties().deleteProperty(testKey);

    // Test page 1
    var body1 = CONFIG_AGING.buildRequestBody(1);
    assertEquals_('page 1 should have pageNumber 1', '1', body1.pageNumber);

    // Test page 5
    var body5 = CONFIG_AGING.buildRequestBody(5);
    assertEquals_('page 5 should have pageNumber 5', '5', body5.pageNumber);

    // Test page 100
    var body100 = CONFIG_AGING.buildRequestBody(100);
    assertEquals_('page 100 should have pageNumber 100', '100', body100.pageNumber);

    // All should have same criteriaFields
    assertEquals_('all pages should have same statement_period',
      body1.criteriaFields.aging.statement_period,
      body5.criteriaFields.aging.statement_period);

  } finally {
    // Cleanup
    if (originalValue) {
      PropertiesService.getScriptProperties().setProperty(testKey, originalValue);
    } else {
      PropertiesService.getScriptProperties().deleteProperty(testKey);
    }
  }
}
