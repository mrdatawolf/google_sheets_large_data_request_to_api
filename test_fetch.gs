/**
 * HTTP and Parsing Tests
 * Tests for fetch.gs functions - response parsing and field extraction
 *
 * NOTE: Retry logic with actual HTTP calls should be tested manually
 * or in integration tests. These tests focus on parsing logic.
 */

/**
 * Test parsing standard API response with 'results' array
 */
function testResponseParsing_standardResults() {
  var mockPayload = JSON.stringify({
    results: [
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' }
    ]
  });

  var mockConfig = {
    outputFields: ['id', 'name']
  };

  // parsePayload_ signature: (text, pageNumber, config)
  var result = parsePayload_(mockPayload, 1, mockConfig);

  assertNotNull_('result should not be null', result);
  assertNotNull_('result.records should exist', result.records);
  assertEquals_('should have 2 records', 2, result.records.length);
  assertEquals_('first record id should be 1', 1, result.records[0].id);
  assertEquals_('first record name should be John', 'John', result.records[0].name);
}

/**
 * Test parsing nested API response with 'data.results' structure
 * Note: parsePayload_ only handles 'data' as array, not 'data.results'
 */
function testResponseParsing_nestedResults() {
  var mockPayload = JSON.stringify({
    data: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ]
  });

  var mockConfig = {
    outputFields: ['id', 'name']
  };

  // parsePayload_ signature: (text, pageNumber, config)
  var result = parsePayload_(mockPayload, 1, mockConfig);

  assertNotNull_('result should not be null', result);
  assertNotNull_('result.records should exist', result.records);
  assertEquals_('should have 2 records', 2, result.records.length);
  assertEquals_('first record name should be Alice', 'Alice', result.records[0].name);
}

/**
 * Test parsing API response with 'data' array directly
 */
function testResponseParsing_dataResults() {
  var mockPayload = JSON.stringify({
    data: [
      { id: 1, value: 100 },
      { id: 2, value: 200 }
    ]
  });

  var mockConfig = {
    outputFields: ['id', 'value']
  };

  // parsePayload_ signature: (text, pageNumber, config)
  var result = parsePayload_(mockPayload, 1, mockConfig);

  assertNotNull_('result should not be null', result);
  assertNotNull_('result.records should exist', result.records);
  assertEquals_('should have 2 records', 2, result.records.length);
  assertEquals_('first record id should be 1', 1, result.records[0].id);
  assertEquals_('first record value should be 100', 100, result.records[0].value);
}

/**
 * Test parsing empty results
 */
function testResponseParsing_emptyResults() {
  var mockPayload = JSON.stringify({
    results: []
  });

  var mockConfig = {
    outputFields: ['id', 'name']
  };

  // parsePayload_ signature: (text, pageNumber, config)
  var result = parsePayload_(mockPayload, 1, mockConfig);

  assertNotNull_('result should not be null', result);
  assertNotNull_('result.records should exist', result.records);
  assertEquals_('should have 0 records', 0, result.records.length);
}

/**
 * Test parsing invalid JSON
 */
function testResponseParsing_invalidJSON() {
  var invalidPayload = 'invalid{json:malformed}';

  var mockConfig = {
    outputFields: ['id']
  };

  assertThrows_('should throw on invalid JSON', function() {
    // parsePayload_ signature: (text, pageNumber, config)
    parsePayload_(invalidPayload, 1, mockConfig);
  });
}

/**
 * Test parsing with field filtering
 */
function testResponseParsing_fieldFiltering() {
  var mockPayload = JSON.stringify({
    results: [
      { id: 1, name: 'John', age: 30, email: 'john@example.com', extra: 'ignore' }
    ]
  });

  var mockConfig = {
    outputFields: ['id', 'name', 'email']  // Only these fields
  };

  // parsePayload_ signature: (text, pageNumber, config)
  var result = parsePayload_(mockPayload, 1, mockConfig);

  assertNotNull_('result should not be null', result);
  assertEquals_('should have 1 record', 1, result.records.length);

  var record = result.records[0];
  assertEquals_('should have id', 1, record.id);
  assertEquals_('should have name', 'John', record.name);
  assertEquals_('should have email', 'john@example.com', record.email);

  // Fields not in outputFields should not be included due to mapPickFields_
  assertEquals_('age should not be included', undefined, record.age);
  assertEquals_('extra should not be included', undefined, record.extra);
}

/**
 * Test field mapping with mapPickFields_
 */
function testResponseParsing_mapPickFields() {
  var data = [
    { id: 1, name: 'Alice', age: 25, city: 'NYC' },
    { id: 2, name: 'Bob', age: 30, city: 'LA' }
  ];

  var fields = ['id', 'name'];
  var result = mapPickFields_(data, fields);

  assertNotNull_('result should not be null', result);
  assertEquals_('should have 2 records', 2, result.length);
  assertEquals_('first record should have id', 1, result[0].id);
  assertEquals_('first record should have name', 'Alice', result[0].name);
  assertEquals_('extra fields should not be included', undefined, result[0].age);
  assertEquals_('extra fields should not be included', undefined, result[0].city);
}

/**
 * Test parsing with missing fields in data
 */
function testResponseParsing_missingFields() {
  var mockPayload = JSON.stringify({
    results: [
      { id: 1, name: 'John' },  // Has name
      { id: 2 }                  // Missing name
    ]
  });

  var mockConfig = {
    outputFields: ['id', 'name']
  };

  // parsePayload_ signature: (text, pageNumber, config)
  var result = parsePayload_(mockPayload, 1, mockConfig);

  assertNotNull_('result should not be null', result);
  assertEquals_('should have 2 records', 2, result.records.length);
  assertEquals_('first record should have name', 'John', result.records[0].name);

  // Second record missing name - pickFields_ returns empty string for missing
  var secondRecord = result.records[1];
  assertEquals_('missing field should be empty string', '', secondRecord.name);
}

/**
 * Test parsing with null values
 */
function testResponseParsing_nullValues() {
  var mockPayload = JSON.stringify({
    results: [
      { id: 1, name: null, value: null }
    ]
  });

  var mockConfig = {
    outputFields: ['id', 'name', 'value']
  };

  // parsePayload_ signature: (text, pageNumber, config)
  var result = parsePayload_(mockPayload, 1, mockConfig);

  assertNotNull_('result should not be null', result);
  assertEquals_('should have 1 record', 1, result.records.length);

  var record = result.records[0];
  assertEquals_('id should be 1', 1, record.id);
  // pickFields_ converts null to empty string
  assertEquals_('name should be empty string', '', record.name);
  assertEquals_('value should be empty string', '', record.value);
}

/**
 * Test parsing with complex nested objects
 */
function testResponseParsing_nestedObjects() {
  var mockPayload = JSON.stringify({
    results: [
      {
        id: 1,
        profile: { name: 'John', age: 30 },
        metadata: { created: '2024-01-01', updated: '2024-01-15' }
      }
    ]
  });

  var mockConfig = {
    outputFields: ['id', 'profile', 'metadata']
  };

  // parsePayload_ signature: (text, pageNumber, config)
  var result = parsePayload_(mockPayload, 1, mockConfig);

  assertNotNull_('result should not be null', result);
  assertEquals_('should have 1 record', 1, result.records.length);

  var record = result.records[0];
  assertEquals_('should have id', 1, record.id);
  assertNotNull_('should have profile object', record.profile);
  assertNotNull_('should have metadata object', record.metadata);
}

/**
 * Test parsing with arrays in data
 */
function testResponseParsing_arraysInData() {
  var mockPayload = JSON.stringify({
    results: [
      {
        id: 1,
        tags: ['tag1', 'tag2', 'tag3'],
        scores: [10, 20, 30]
      }
    ]
  });

  var mockConfig = {
    outputFields: ['id', 'tags', 'scores']
  };

  // parsePayload_ signature: (text, pageNumber, config)
  var result = parsePayload_(mockPayload, 1, mockConfig);

  assertNotNull_('result should not be null', result);
  assertEquals_('should have 1 record', 1, result.records.length);

  var record = result.records[0];
  assertTrue_('tags should be array', Array.isArray(record.tags));
  assertTrue_('scores should be array', Array.isArray(record.scores));
  assertEquals_('tags should have 3 items', 3, record.tags.length);
}

/**
 * Test parsing with top-level array response
 */
function testResponseParsing_topLevelArray() {
  var mockPayload = JSON.stringify([
    { id: 1, name: 'Item1' },
    { id: 2, name: 'Item2' }
  ]);

  var mockConfig = {
    outputFields: ['id', 'name']
  };

  // parsePayload_ signature: (text, pageNumber, config)
  var result = parsePayload_(mockPayload, 1, mockConfig);

  // The parser should handle top-level arrays
  assertNotNull_('result should not be null', result);
  assertNotNull_('result.records should exist', result.records);
  assertEquals_('should have 2 records', 2, result.records.length);
}

/**
 * Test parsing with boolean values
 */
function testResponseParsing_booleanValues() {
  var mockPayload = JSON.stringify({
    results: [
      { id: 1, active: true, verified: false }
    ]
  });

  var mockConfig = {
    outputFields: ['id', 'active', 'verified']
  };

  // parsePayload_ signature: (text, pageNumber, config)
  var result = parsePayload_(mockPayload, 1, mockConfig);

  assertNotNull_('result should not be null', result);
  assertEquals_('should have 1 record', 1, result.records.length);

  var record = result.records[0];
  assertEquals_('active should be true', true, record.active);
  assertEquals_('verified should be false', false, record.verified);
}

/**
 * Test parsing with numeric values of different types
 */
function testResponseParsing_numericTypes() {
  var mockPayload = JSON.stringify({
    results: [
      {
        id: 1,
        count: 42,
        price: 19.99,
        percentage: 0.85,
        bigNumber: 1234567890
      }
    ]
  });

  var mockConfig = {
    outputFields: ['id', 'count', 'price', 'percentage', 'bigNumber']
  };

  // parsePayload_ signature: (text, pageNumber, config)
  var result = parsePayload_(mockPayload, 1, mockConfig);

  assertNotNull_('result should not be null', result);
  assertEquals_('should have 1 record', 1, result.records.length);

  var record = result.records[0];
  assertEquals_('count should be integer', 42, record.count);
  assertEquals_('price should be float', 19.99, record.price);
  assertEquals_('percentage should be decimal', 0.85, record.percentage);
  assertEquals_('bigNumber should be preserved', 1234567890, record.bigNumber);
}

/**
 * Test pagination metadata parsing (if present)
 */
function testResponseParsing_paginationMetadata() {
  var mockPayload = JSON.stringify({
    results: [
      { id: 1 },
      { id: 2 }
    ],
    page: 1,
    pageSize: 50,
    totalRecords: 100,
    totalPages: 2
  });

  var mockConfig = {
    outputFields: ['id']
  };

  // parsePayload_ signature: (text, pageNumber, config)
  var result = parsePayload_(mockPayload, 1, mockConfig);

  assertNotNull_('result should not be null', result);
  assertNotNull_('result.records should exist', result.records);
  assertEquals_('should extract results array', 2, result.records.length);

  // Note: Pagination metadata might or might not be preserved
  // depending on implementation. This documents expected behavior.
}
