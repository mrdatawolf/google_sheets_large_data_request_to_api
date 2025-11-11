/**
 * State Management Tests
 * Tests for state.gs functions - state persistence and retrieval
 */

/**
 * Test saving and loading state using JSON properties
 */
function testStateManagement_saveAndLoad() {
  var testKey = 'test_state_key_save_load';
  var state = {
    page: 5,
    pageSize: 50,
    format: 'json',
    updatedAt: new Date().toISOString()
  };

  // Save state
  setJSONProp_(testKey, state);

  // Load state
  var loaded = getJSONProp_(testKey);

  // Assertions
  assertNotNull_('loaded state should not be null', loaded);
  assertEquals_('page should match', 5, loaded.page);
  assertEquals_('pageSize should match', 50, loaded.pageSize);
  assertEquals_('format should match', 'json', loaded.format);
  assertNotNull_('updatedAt should exist', loaded.updatedAt);

  // Cleanup
  deleteProp_(testKey);
}

/**
 * Test resetting/clearing state
 */
function testStateManagement_reset() {
  var testKey = 'test_state_key_reset';

  // Create state
  setJSONProp_(testKey, { page: 10, pageSize: 100 });

  // Verify it exists
  var beforeDelete = getJSONProp_(testKey);
  assertNotNull_('state should exist before delete', beforeDelete);

  // Delete state
  deleteProp_(testKey);

  // Verify it's gone
  var afterDelete = getJSONProp_(testKey);
  assertNull_('state should be null after delete', afterDelete);
}

/**
 * Test handling of corrupted/invalid JSON in properties
 */
function testStateManagement_invalidJSON() {
  var testKey = 'test_state_key_invalid';

  // Manually set invalid JSON string
  PropertiesService.getScriptProperties().setProperty(testKey, 'invalid{json:malformed}');

  // Should return null for invalid JSON
  var result = getJSONProp_(testKey);
  assertNull_('invalid JSON should return null', result);

  // Cleanup
  deleteProp_(testKey);
}

/**
 * Test force resume to specific page
 * Note: This test requires CONFIG to be defined with stateKey
 */
function testStateManagement_forceResume() {
  // Skip if CONFIG not available or stateKey not defined
  if (typeof CONFIG === 'undefined' || !CONFIG || !CONFIG.stateKey) {
    Logger.log('Skipping testStateManagement_forceResume - CONFIG or CONFIG.stateKey not defined');
    return;
  }

  // Save original state
  var originalState = getJSONProp_(CONFIG.stateKey);

  try {
    // Force resume to page 42
    forceResumePage_(42);

    // Load and verify
    var state = getJSONProp_(CONFIG.stateKey);
    assertNotNull_('state should exist after force resume', state);
    assertEquals_('page should be 42', 42, state.page);
    assertTrue_('pageSize should be positive', state.pageSize > 0);
    assertNotNull_('format should exist', state.format);
    assertNotNull_('updatedAt should exist', state.updatedAt);

  } finally {
    // Restore original state
    if (originalState) {
      setJSONProp_(CONFIG.stateKey, originalState);
    } else {
      deleteProp_(CONFIG.stateKey);
    }
  }
}

/**
 * Test state with edge case values
 */
function testStateManagement_edgeCases() {
  var testKey = 'test_state_key_edge';

  // Test with page 0 (should be normalized to 1 in some functions)
  var state1 = { page: 0, pageSize: 50, format: 'json' };
  setJSONProp_(testKey, state1);
  var loaded1 = getJSONProp_(testKey);
  assertEquals_('page 0 should be stored as-is', 0, loaded1.page);

  // Test with very large page number
  var state2 = { page: 999999, pageSize: 100, format: 'json' };
  setJSONProp_(testKey, state2);
  var loaded2 = getJSONProp_(testKey);
  assertEquals_('large page number should be stored', 999999, loaded2.page);

  // Test with different formats
  var state3 = { page: 1, pageSize: 50, format: 'csv' };
  setJSONProp_(testKey, state3);
  var loaded3 = getJSONProp_(testKey);
  assertEquals_('csv format should be stored', 'csv', loaded3.format);

  // Cleanup
  deleteProp_(testKey);
}

/**
 * Test multiple state keys don't interfere
 */
function testStateManagement_multipleKeys() {
  var key1 = 'test_state_multi_1';
  var key2 = 'test_state_multi_2';

  var state1 = { page: 10, pageSize: 50, format: 'json' };
  var state2 = { page: 20, pageSize: 100, format: 'csv' };

  // Save both
  setJSONProp_(key1, state1);
  setJSONProp_(key2, state2);

  // Load and verify they don't interfere
  var loaded1 = getJSONProp_(key1);
  var loaded2 = getJSONProp_(key2);

  assertEquals_('key1 page should be 10', 10, loaded1.page);
  assertEquals_('key2 page should be 20', 20, loaded2.page);
  assertEquals_('key1 pageSize should be 50', 50, loaded1.pageSize);
  assertEquals_('key2 pageSize should be 100', 100, loaded2.pageSize);

  // Cleanup
  deleteProp_(key1);
  deleteProp_(key2);
}
