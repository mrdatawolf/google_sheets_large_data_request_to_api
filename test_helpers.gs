/**
 * Test framework helper functions
 * Provides assertion utilities and test result tracking
 */

// Global test results tracking
var TEST_RESULTS = {
  passed: 0,
  failed: 0,
  tests: []
};

/**
 * Assert that two values are equal
 * @param {string} message - Descriptive message about what is being tested
 * @param {*} expected - Expected value
 * @param {*} actual - Actual value
 * @throws {Error} If values don't match
 */
function assertEquals_(message, expected, actual) {
  if (expected !== actual) {
    throw new Error(message + '\n  Expected: ' + JSON.stringify(expected) + '\n  Actual: ' + JSON.stringify(actual));
  }
}

/**
 * Assert that a value is truthy
 * @param {string} message - Descriptive message
 * @param {*} value - Value to check
 * @throws {Error} If value is falsy
 */
function assertTrue_(message, value) {
  if (!value) {
    throw new Error(message + ' - Expected truthy value, got: ' + JSON.stringify(value));
  }
}

/**
 * Assert that a value is falsy
 * @param {string} message - Descriptive message
 * @param {*} value - Value to check
 * @throws {Error} If value is truthy
 */
function assertFalse_(message, value) {
  if (value) {
    throw new Error(message + ' - Expected falsy value, got: ' + JSON.stringify(value));
  }
}

/**
 * Assert that a value is null
 * @param {string} message - Descriptive message
 * @param {*} value - Value to check
 * @throws {Error} If value is not null
 */
function assertNull_(message, value) {
  if (value !== null) {
    throw new Error(message + ' - Expected null, got: ' + JSON.stringify(value));
  }
}

/**
 * Assert that a value is not null
 * @param {string} message - Descriptive message
 * @param {*} value - Value to check
 * @throws {Error} If value is null
 */
function assertNotNull_(message, value) {
  if (value === null) {
    throw new Error(message + ' - Expected non-null value');
  }
}

/**
 * Assert that an array contains a specific value
 * @param {string} message - Descriptive message
 * @param {Array} array - Array to search
 * @param {*} value - Value to find
 * @throws {Error} If value not in array
 */
function assertContains_(message, array, value) {
  if (!array || indexOf_(array, value) === -1) {
    throw new Error(message + ' - Array does not contain: ' + JSON.stringify(value));
  }
}

/**
 * Assert that a function throws an error
 * @param {string} message - Descriptive message
 * @param {Function} fn - Function that should throw
 * @throws {Error} If function doesn't throw
 */
function assertThrows_(message, fn) {
  var didThrow = false;
  try {
    fn();
  } catch (e) {
    didThrow = true;
  }
  if (!didThrow) {
    throw new Error(message + ' - Expected function to throw an error');
  }
}

/**
 * Log a passing test
 * @param {string} testName - Name of the test that passed
 */
function _logPass_(testName) {
  TEST_RESULTS.passed++;
  TEST_RESULTS.tests.push({ name: testName, status: 'PASS' });
  Logger.log('✓ PASS: ' + testName);
}

/**
 * Log a failing test
 * @param {string} testName - Name of the test that failed
 * @param {Error} error - Error object with details
 */
function _logFail_(testName, error) {
  TEST_RESULTS.failed++;
  TEST_RESULTS.tests.push({
    name: testName,
    status: 'FAIL',
    error: error.toString()
  });
  Logger.log('✗ FAIL: ' + testName);
  Logger.log('  Error: ' + error.toString());
}

/**
 * Reset test results (call before running test suite)
 */
function _resetTestResults_() {
  TEST_RESULTS = {
    passed: 0,
    failed: 0,
    tests: []
  };
}

/**
 * Print test summary
 */
function _printTestSummary_() {
  Logger.log('\n' + '='.repeat(60));
  Logger.log('TEST SUMMARY');
  Logger.log('='.repeat(60));
  Logger.log('Total Tests: ' + (TEST_RESULTS.passed + TEST_RESULTS.failed));
  Logger.log('Passed: ' + TEST_RESULTS.passed);
  Logger.log('Failed: ' + TEST_RESULTS.failed);

  if (TEST_RESULTS.failed > 0) {
    Logger.log('\nFailed Tests:');
    TEST_RESULTS.tests.forEach(function(test) {
      if (test.status === 'FAIL') {
        Logger.log('  - ' + test.name);
        if (test.error) {
          Logger.log('    ' + test.error);
        }
      }
    });
  }

  Logger.log('='.repeat(60));

  return TEST_RESULTS.failed === 0;
}

/**
 * Run a single test with error handling
 * @param {Function} testFn - Test function to run
 * @param {string} testName - Name of the test
 */
function _runSingleTest_(testFn, testName) {
  try {
    testFn();
    _logPass_(testName);
  } catch (e) {
    _logFail_(testName, e);
  }
}
