/**
 * Configuration Validation Tests
 * Tests for configuration validation in reportRunner.gs
 */

/**
 * Test config validation - missing buildRequestBody
 */
function testConfigValidation_missingBuildRequestBody() {
  var invalidConfig = {
    fetchPage: function() {},
    pageSize: 50,
    sheetConfigs: [{
      sheetName: 'Test',
      fields: ['id'],
      keyField: 'id'
    }]
  };

  assertThrows_('should throw error for missing buildRequestBody', function() {
    _validateRunnerConfig_(invalidConfig);
  });
}

/**
 * Test config validation - missing fetchPage
 */
function testConfigValidation_missingFetchPage() {
  var invalidConfig = {
    buildRequestBody: function() {},
    pageSize: 50,
    sheetConfigs: [{
      sheetName: 'Test',
      fields: ['id'],
      keyField: 'id'
    }]
  };

  assertThrows_('should throw error for missing fetchPage', function() {
    _validateRunnerConfig_(invalidConfig);
  });
}

/**
 * Test config validation - invalid/empty sheetConfigs
 */
function testConfigValidation_invalidSheetConfigs() {
  var invalidConfig = {
    buildRequestBody: function() {},
    fetchPage: function() {},
    pageSize: 50,
    sheetConfigs: []  // Empty array is invalid
  };

  assertThrows_('should throw error for empty sheetConfigs', function() {
    _validateRunnerConfig_(invalidConfig);
  });
}

/**
 * Test config validation - missing sheetName in sheetConfig
 */
function testConfigValidation_missingSheetName() {
  var invalidConfig = {
    buildRequestBody: function() {},
    fetchPage: function() {},
    pageSize: 50,
    sheetConfigs: [{
      // Missing sheetName
      fields: ['id'],
      keyField: 'id'
    }]
  };

  assertThrows_('should throw error for missing sheetName', function() {
    _validateRunnerConfig_(invalidConfig);
  });
}

/**
 * Test config validation - missing keyField in sheetConfig
 */
function testConfigValidation_missingKeyField() {
  var invalidConfig = {
    buildRequestBody: function() {},
    fetchPage: function() {},
    pageSize: 50,
    sheetConfigs: [{
      sheetName: 'Test',
      fields: ['id']
      // Missing keyField
    }]
  };

  assertThrows_('should throw error for missing keyField', function() {
    _validateRunnerConfig_(invalidConfig);
  });
}

/**
 * Test config validation - invalid fields (not an array)
 */
function testConfigValidation_invalidFields() {
  var invalidConfig = {
    buildRequestBody: function() {},
    fetchPage: function() {},
    pageSize: 50,
    sheetConfigs: [{
      sheetName: 'Test',
      fields: 'not-an-array', // Should be array
      keyField: 'id'
    }]
  };

  assertThrows_('should throw error for non-array fields', function() {
    _validateRunnerConfig_(invalidConfig);
  });
}

/**
 * Test config validation - valid minimal config
 */
function testConfigValidation_validConfig() {
  var validConfig = {
    buildRequestBody: function() { return {}; },
    fetchPage: function() { return {}; },
    pageSize: 50,
    sheetConfigs: [{
      sheetName: 'Test',
      fields: ['id', 'name'],
      keyField: 'id'
    }]
  };

  // Should not throw
  _validateRunnerConfig_(validConfig);
  assertTrue_('valid config should pass validation', true);
}

/**
 * Test config validation - valid config with multiple sheets
 */
function testConfigValidation_multipleSheets() {
  var validConfig = {
    buildRequestBody: function() { return {}; },
    fetchPage: function() { return {}; },
    pageSize: 100,
    sheetConfigs: [
      {
        sheetName: 'Sheet1',
        fields: ['id', 'name'],
        keyField: 'id'
      },
      {
        sheetName: 'Sheet2',
        fields: ['invoiceId', 'amount'],
        keyField: 'invoiceId'
      }
    ]
  };

  // Should not throw
  _validateRunnerConfig_(validConfig);
  assertTrue_('valid multi-sheet config should pass', true);
}

/**
 * Test config validation - missing pageSize
 */
function testConfigValidation_missingPageSize() {
  var invalidConfig = {
    buildRequestBody: function() {},
    fetchPage: function() {},
    // Missing pageSize
    sheetConfigs: [{
      sheetName: 'Test',
      fields: ['id'],
      keyField: 'id'
    }]
  };

  assertThrows_('should throw error for missing pageSize', function() {
    _validateRunnerConfig_(invalidConfig);
  });
}

/**
 * Test config validation - null config
 */
function testConfigValidation_nullConfig() {
  assertThrows_('should throw error for null config', function() {
    _validateRunnerConfig_(null);
  });
}

/**
 * Test config validation - undefined config
 */
function testConfigValidation_undefinedConfig() {
  assertThrows_('should throw error for undefined config', function() {
    _validateRunnerConfig_(undefined);
  });
}

/**
 * Test that CONFIG_TEST has valid structure
 */
function testConfigValidation_testConfig() {
  // Skip if CONFIG_TEST not available
  if (typeof CONFIG_TEST === 'undefined') {
    Logger.log('Skipping testConfigValidation_testConfig - CONFIG_TEST not defined');
    return;
  }

  // Should not throw
  _validateRunnerConfig_(CONFIG_TEST);
  assertTrue_('CONFIG_TEST should be valid', true);
}

/**
 * Test that CONFIG (Users) has valid structure
 */
function testConfigValidation_usersConfig() {
  // Skip if CONFIG not available
  if (typeof CONFIG === 'undefined') {
    Logger.log('Skipping testConfigValidation_usersConfig - CONFIG not defined');
    return;
  }

  // Should not throw
  _validateRunnerConfig_(CONFIG);
  assertTrue_('CONFIG (Users) should be valid', true);
}

/**
 * Test that CONFIG_TX (Transactions) has valid structure
 */
function testConfigValidation_transactionsConfig() {
  // Skip if CONFIG_TX not available
  if (typeof CONFIG_TX === 'undefined') {
    Logger.log('Skipping testConfigValidation_transactionsConfig - CONFIG_TX not defined');
    return;
  }

  // Should not throw
  _validateRunnerConfig_(CONFIG_TX);
  assertTrue_('CONFIG_TX (Transactions) should be valid', true);
}

/**
 * Test config validation - empty fields array
 */
function testConfigValidation_emptyFields() {
  var configWithEmptyFields = {
    buildRequestBody: function() {},
    fetchPage: function() {},
    pageSize: 50,
    sheetConfigs: [{
      sheetName: 'Test',
      fields: [], // Empty but valid array
      keyField: 'id'
    }]
  };

  // Should not throw - empty fields array might be valid
  _validateRunnerConfig_(configWithEmptyFields);
  assertTrue_('empty fields array should be allowed', true);
}

/**
 * Test config validation - buildRequestBody not a function
 */
function testConfigValidation_buildRequestBodyNotFunction() {
  var invalidConfig = {
    buildRequestBody: 'not a function',
    fetchPage: function() {},
    pageSize: 50,
    sheetConfigs: [{
      sheetName: 'Test',
      fields: ['id'],
      keyField: 'id'
    }]
  };

  assertThrows_('should throw when buildRequestBody is not a function', function() {
    _validateRunnerConfig_(invalidConfig);
  });
}

/**
 * Test config validation - fetchPage not a function
 */
function testConfigValidation_fetchPageNotFunction() {
  var invalidConfig = {
    buildRequestBody: function() {},
    fetchPage: 'not a function',
    pageSize: 50,
    sheetConfigs: [{
      sheetName: 'Test',
      fields: ['id'],
      keyField: 'id'
    }]
  };

  assertThrows_('should throw when fetchPage is not a function', function() {
    _validateRunnerConfig_(invalidConfig);
  });
}
