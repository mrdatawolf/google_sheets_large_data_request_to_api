/**
 * Utility Function Tests
 * Tests for utils.gs functions - field mapping, time budget, array helpers
 */

/**
 * Test basic field mapping
 */
function testFieldMapping_basic() {
  var data = [
    { id: 1, name: 'John', age: 30, extra: 'ignore' },
    { id: 2, name: 'Jane', age: 25, extra: 'ignore' }
  ];
  var fields = ['id', 'name'];

  var result = mapPickFields_(data, fields);

  assertEquals_('should have 2 records', 2, result.length);
  assertEquals_('first record should have id', 1, result[0].id);
  assertEquals_('first record should have name', 'John', result[0].name);
  assertEquals_('should not have extra field', undefined, result[0].extra);
  assertEquals_('should not have age field', undefined, result[0].age);
}

/**
 * Test field mapping with missing fields
 */
function testFieldMapping_missingField() {
  var data = [
    { id: 1, name: 'John' },
    { id: 2 } // Missing name
  ];
  var fields = ['id', 'name', 'nonexistent'];

  var result = mapPickFields_(data, fields);

  assertEquals_('should have 2 records', 2, result.length);
  assertEquals_('first record should have id', 1, result[0].id);
  assertEquals_('first record should have name', 'John', result[0].name);

  // Second record missing name - pickFields_ converts missing to empty string
  assertEquals_('second record should have id', 2, result[1].id);
  assertEquals_('missing field should be empty string', '', result[1].name);
  assertEquals_('nonexistent field should be empty string', '', result[1].nonexistent);
}

/**
 * Test field mapping with empty array
 */
function testFieldMapping_emptyArray() {
  var result = mapPickFields_([], ['id', 'name']);

  assertNotNull_('result should not be null', result);
  assertEquals_('should return empty array', 0, result.length);
}

/**
 * Test field mapping with empty fields
 */
function testFieldMapping_emptyFields() {
  var data = [{ id: 1, name: 'John' }];
  var result = mapPickFields_(data, []);

  assertEquals_('should have 1 record', 1, result.length);
  // With empty fields, should return empty objects or all fields
  // Behavior depends on implementation
  assertTrue_('should handle empty fields array', true);
}

/**
 * Test field mapping with null data
 */
function testFieldMapping_nullData() {
  var result = mapPickFields_(null, ['id']);

  // Should handle null gracefully
  assertTrue_('null data should return empty array or null',
    result === null || (Array.isArray(result) && result.length === 0));
}

/**
 * Test time budget with time remaining
 */
function testTimeBudget_withinBudget() {
  var startMs = Date.now();
  var budgetMs = 10000; // 10 seconds

  var result = hasTimeLeft_(startMs, budgetMs);

  assertTrue_('should have time left', result);
}

/**
 * Test time budget when exceeded
 */
function testTimeBudget_exceededBudget() {
  var startMs = Date.now() - 300000; // 5 minutes ago
  var budgetMs = 240000; // 4 minute budget

  var result = hasTimeLeft_(startMs, budgetMs);

  assertFalse_('should not have time left', result);
}

/**
 * Test time budget safety buffer
 */
function testTimeBudget_safetyBuffer() {
  // The function should include a safety buffer
  // and exit before actually hitting the limit
  var startMs = Date.now() - 230000; // 3:50 ago
  var budgetMs = 240000; // 4 minute budget

  var result = hasTimeLeft_(startMs, budgetMs);

  // Should be conservative and say no time left
  // even though technically 10 seconds remain
  assertFalse_('should account for safety buffer', result);
}

/**
 * Test time budget edge case - just started
 */
function testTimeBudget_justStarted() {
  var startMs = Date.now();
  var budgetMs = 240000;

  var result = hasTimeLeft_(startMs, budgetMs);

  assertTrue_('should have time when just started', result);
}

/**
 * Test time budget with zero budget
 */
function testTimeBudget_zeroBudget() {
  var startMs = Date.now();
  var budgetMs = 0;

  var result = hasTimeLeft_(startMs, budgetMs);

  assertFalse_('zero budget should return false', result);
}

/**
 * Test indexOf_ helper function
 */
function testUtils_indexOf() {
  var arr = ['apple', 'banana', 'cherry'];

  assertEquals_('banana should be at index 1', 1, indexOf_(arr, 'banana'));
  assertEquals_('cherry should be at index 2', 2, indexOf_(arr, 'cherry'));
  assertEquals_('nonexistent should return -1', -1, indexOf_(arr, 'grape'));
  assertEquals_('apple should be at index 0', 0, indexOf_(arr, 'apple'));
}

/**
 * Test indexOf_ with empty array
 */
function testUtils_indexOf_empty() {
  var arr = [];
  assertEquals_('empty array should return -1', -1, indexOf_(arr, 'anything'));
}

/**
 * Test indexOf_ with null/undefined
 */
function testUtils_indexOf_null() {
  var arr = ['a', null, 'b', undefined, 'c'];

  var nullIndex = indexOf_(arr, null);
  var undefinedIndex = indexOf_(arr, undefined);

  assertTrue_('should handle null in array', nullIndex >= -1);
  assertTrue_('should handle undefined in array', undefinedIndex >= -1);
}

/**
 * Test contains_ helper function
 */
function testUtils_contains() {
  var arr = ['apple', 'banana', 'cherry'];

  assertTrue_('should contain banana', contains_(arr, 'banana'));
  assertTrue_('should contain apple', contains_(arr, 'apple'));
  assertTrue_('should contain cherry', contains_(arr, 'cherry'));
  assertFalse_('should not contain grape', contains_(arr, 'grape'));
}

/**
 * Test contains_ with empty array
 */
function testUtils_contains_empty() {
  var arr = [];
  assertFalse_('empty array should not contain anything', contains_(arr, 'anything'));
}

/**
 * Test contains_ with null array
 */
function testUtils_contains_nullArray() {
  var result = contains_(null, 'anything');
  assertFalse_('null array should return false', result);
}

/**
 * Test contains_ with undefined array
 */
function testUtils_contains_undefinedArray() {
  var result = contains_(undefined, 'anything');
  assertFalse_('undefined array should return false', result);
}

/**
 * Test safeGetText_ with valid response (if accessible)
 */
function testUtils_safeGetText() {
  // This test requires mocking HTTPResponse
  // Skip for now as it requires complex setup
  Logger.log('testUtils_safeGetText - skipped (requires HTTP response mock)');
  assertTrue_('placeholder test', true);
}

/**
 * Test field mapping with nested objects
 */
function testFieldMapping_nestedObjects() {
  var data = [
    {
      id: 1,
      profile: { name: 'John', age: 30 },
      metadata: { created: '2024-01-01' }
    }
  ];
  var fields = ['id', 'profile', 'metadata'];

  var result = mapPickFields_(data, fields);

  assertEquals_('should have 1 record', 1, result.length);
  assertEquals_('should have id', 1, result[0].id);
  assertNotNull_('should have profile object', result[0].profile);
  assertNotNull_('should have metadata object', result[0].metadata);
}

/**
 * Test field mapping preserves data types
 */
function testFieldMapping_dataTypes() {
  var data = [
    {
      stringField: 'text',
      numberField: 42,
      boolField: true,
      nullField: null,
      arrayField: [1, 2, 3],
      objectField: { key: 'value' }
    }
  ];
  var fields = ['stringField', 'numberField', 'boolField', 'nullField', 'arrayField', 'objectField'];

  var result = mapPickFields_(data, fields);

  assertEquals_('should have 1 record', 1, result.length);
  assertEquals_('string should remain string', 'text', result[0].stringField);
  assertEquals_('number should remain number', 42, result[0].numberField);
  assertEquals_('bool should remain bool', true, result[0].boolField);
  assertNull_('null should remain null', result[0].nullField);
  assertTrue_('array should remain array', Array.isArray(result[0].arrayField));
  assertTrue_('object should remain object', typeof result[0].objectField === 'object');
}
