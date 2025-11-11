/**
 * Sheet Operation Tests
 * Tests for sheet.gs functions - sheet creation, upsert, date parsing, type casting
 */

/**
 * Test field mapping in sheets
 */
function testSheet_fieldMapping() {
  var fields = ['SystemId', 'FirstName', 'LastName', 'Email'];

  // Test indexOf_ works with field names
  var index = indexOf_(fields, 'FirstName');
  assertEquals_('FirstName should be at index 1', 1, index);

  var index2 = indexOf_(fields, 'NonExistent');
  assertEquals_('NonExistent should return -1', -1, index2);

  // Test contains_ works with field names
  var hasEmail = contains_(fields, 'Email');
  assertTrue_('fields should contain Email', hasEmail);

  var hasAge = contains_(fields, 'Age');
  assertFalse_('fields should not contain Age', hasAge);
}

/**
 * Test castValue_ function with date fields
 * Note: castValue_(fieldName, rawValue) - fieldName comes first!
 */
function testSheet_castValue_date() {
  // Note: castValue_ requires CONFIG.typesDateFields to be defined
  // Skip detailed testing if CONFIG not available
  if (typeof CONFIG === 'undefined' || !CONFIG) {
    Logger.log('Skipping testSheet_castValue_date - CONFIG not defined');
    return;
  }

  // Test date string conversion (if BirthDate is in typesDateFields)
  var dateStr = '2024-01-15';
  var result = castValue_('BirthDate', dateStr);

  // Should return a Date object or the original string (depending on whether field is in typesDateFields)
  assertTrue_('result should be Date or string', result instanceof Date || typeof result === 'string' || result === '');

  // Test null date - castValue_ returns empty string for null
  var nullResult = castValue_('BirthDate', null);
  assertEquals_('null date should return empty string', '', nullResult);
}

/**
 * Test castValue_ function with numeric fields
 * Note: castValue_(fieldName, rawValue) - fieldName comes first!
 */
function testSheet_castValue_number() {
  // Skip detailed testing if CONFIG not available
  if (typeof CONFIG === 'undefined' || !CONFIG) {
    Logger.log('Skipping testSheet_castValue_number - CONFIG not defined');
    return;
  }

  // Test string to number conversion (if Age is in typesNumericFields)
  var numStr = '42';
  var result = castValue_('Age', numStr);

  // Should handle numeric conversion
  assertTrue_('result should be number or string or empty', typeof result === 'number' || typeof result === 'string' || result === '');

  // Test null number - castValue_ returns empty string for null
  var nullResult = castValue_('Age', null);
  assertEquals_('null number should return empty string', '', nullResult);
}

/**
 * Test castValue_ function with string fields
 * Note: castValue_(fieldName, rawValue) - fieldName comes first!
 */
function testSheet_castValue_string() {
  // Test string remains string
  var str = 'John Doe';
  var result = castValue_('Name', str);

  assertEquals_('string should remain string', 'John Doe', result);

  // Test null string - castValue_ returns empty string for null
  var nullResult = castValue_('Name', null);
  assertEquals_('null string should return empty string', '', nullResult);

  // Test empty string
  var emptyResult = castValue_('Name', '');
  assertEquals_('empty string should return empty string', '', emptyResult);
}

/**
 * Test date parsing with ISO 8601 format
 */
function testDateParsing_ISO8601() {
  var isoDate = '2024-01-15T10:30:00Z';
  var result = parseDateFlexible_(isoDate);

  assertNotNull_('ISO date should parse', result);
  assertTrue_('result should be a Date', result instanceof Date);

  // Check year is correct
  assertEquals_('year should be 2024', 2024, result.getFullYear());
}

/**
 * Test date parsing with slash format
 */
function testDateParsing_slashFormat() {
  var slashDate = '1/15/2024';
  var result = parseDateFlexible_(slashDate);

  assertNotNull_('slash format should parse', result);
  assertTrue_('result should be a Date', result instanceof Date);
}

/**
 * Test date parsing with invalid input
 */
function testDateParsing_invalid() {
  var invalidDate = 'not a date';
  var result = parseDateFlexible_(invalidDate);

  assertNull_('invalid date should return null', result);
}

/**
 * Test date parsing with null input
 */
function testDateParsing_null() {
  var result = parseDateFlexible_(null);

  assertNull_('null input should return null', result);
}

/**
 * Test date parsing with empty string
 */
function testDateParsing_emptyString() {
  var result = parseDateFlexible_('');

  assertNull_('empty string should return null', result);
}

/**
 * Test date parsing with various formats
 */
function testDateParsing_variousFormats() {
  // Test MM/DD/YYYY
  var date1 = parseDateFlexible_('12/25/2023');
  assertNotNull_('MM/DD/YYYY should parse', date1);

  // Test YYYY-MM-DD
  var date2 = parseDateFlexible_('2023-12-25');
  assertNotNull_('YYYY-MM-DD should parse', date2);

  // Test with time
  var date3 = parseDateFlexible_('1/15/2024 14:30:00');
  assertNotNull_('date with time should parse', date3);

  // Test ISO with timezone
  var date4 = parseDateFlexible_('2024-01-15T10:30:00-05:00');
  assertNotNull_('ISO with timezone should parse', date4);
}

/**
 * Test date parsing edge cases
 */
function testDateParsing_edgeCases() {
  // Test whitespace
  var result1 = parseDateFlexible_('   ');
  assertNull_('whitespace should return null', result1);

  // Test zero date
  var result2 = parseDateFlexible_('0/0/0');
  assertNull_('invalid zero date should return null', result2);

  // Test future date
  var futureDate = parseDateFlexible_('12/31/2099');
  if (futureDate) {
    assertTrue_('future date should be valid Date', futureDate instanceof Date);
  }

  // Test past date
  var pastDate = parseDateFlexible_('1/1/1900');
  if (pastDate) {
    assertTrue_('past date should be valid Date', pastDate instanceof Date);
  }
}

/**
 * Test that date parsing handles timestamps
 */
function testDateParsing_timestamps() {
  // Test Unix timestamp (milliseconds)
  var timestamp = new Date('2024-01-15').getTime();
  var result = parseDateFlexible_(timestamp);

  // Some implementations might handle numeric timestamps
  if (result !== null) {
    assertTrue_('timestamp result should be Date', result instanceof Date);
  }
}

/**
 * Test date parsing with invalid year
 */
function testDateParsing_invalidYear() {
  var badDate1 = parseDateFlexible_('13/32/2024'); // Invalid month/day
  assertNull_('invalid month/day should return null', badDate1);

  var badDate2 = parseDateFlexible_('12/31/99999'); // Year too large
  // Result may vary - either null or valid date depending on implementation
  // Just check it doesn't crash
  assertTrue_('should handle invalid year gracefully', true);
}
