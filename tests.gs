function __hello__() { Logger.log('hello at ' + new Date()); }


/** =========================
 * Minimal test harness
 * ========================= */

function assertEquals_(msg, expected, actual) {
  if (expected !== actual) throw new Error(msg + ' | expected=' + expected + ' actual=' + actual);
}
function assertTrue_(msg, cond) {
  if (!cond) throw new Error(msg + ' | condition was false');
}
function assertDeepEqual_(msg, expected, actual) {
  var e = JSON.stringify(expected);
  var a = JSON.stringify(actual);
  if (e !== a) throw new Error(msg + ' | expected=' + e + ' actual=' + a);
}

function _logPass_(name) { Logger.log('PASS ' + name); }
function _logFail_(name, e) { Logger.log('FAIL ' + name + ' — ' + e); }

/** =========================
 * Tests
 * ========================= */

/** =========================
 * Test runner (append to existing list)
 * ========================= */

function runAllTests() {
  var testFns = [
    testRunReport_CONFIG_TEST_basic,
    testParsePayload_JSON_array,
    test_escapeHtml_basic,
    test_buildDigestSubject_andBody,
    test_notificationsEnabled_and_recipients,
    test_safeGetText_bom_and_newlines,
    test_getOrCreateFolderPath_idempotent,
    test_scheduleContinuation_dedup,
    test_state_set_get_reset_and_force,
    test_parseDateFlexible_various,
    test_castValue_and_getRowValuesWithCasting,
    test_notifications_html_realTags_and_recipients,
    testParsePayload_JSON_objectWithData,
    test_ensureSheetWithHeaders_addsMissing,
    test_applyColumnFormats_zeroHeight_and_formats,
    test_runReport_responseParsing,
    test_fetchDaxkoPagePost_with_CONFIG_TEST,
    test_fetchDaxkoPagePost_malformedJSON,
    test_runReport_multiplePages
  ];
  var passed = 0, failed = 0, errors = [];

  testFns.forEach(function(fn, idx) {
    var name = fn.name || ('test#' + idx);
    try { fn(); passed++;  }
    catch (e) { failed++; var msg = String(e); errors.push({ name: name, error: msg }); Logger.log('FAIL ' + name + ': ' + msg); }
  });

  Logger.log('======= Test Summary =======');
  Logger.log('Passed: ' + passed + '  Failed: ' + failed);
  if (errors.length) {
    for (var j = 0; j < errors.length; j++) {
      Logger.log(' - ' + errors[j].name + ': ' + errors[j].error);
    }
  }
  return { passed: passed, failed: failed, errors: errors };
}

/**
 * Integration-ish test for runReport with CONFIG_TEST:
 * - Mocks fetchPage to return JSON payload (page 1 has 2 rows, page 2 empty).
 * - Mocks sheet helpers to avoid touching Sheets.
 * - Asserts totals, pagesFetched, and resume.setState behavior.
 */
function testRunReport_CONFIG_TEST_basic() {
  // Save originals so we can restore after the test
  var _origEnsure = (typeof ensureSheetWithHeaders_ === 'function') ? ensureSheetWithHeaders_ : null;
  var _origUpsert = (typeof upsertRowsToSheet_ === 'function') ? upsertRowsToSheet_ : null;
  var _origFormats = (typeof applyColumnFormats_ === 'function') ? applyColumnFormats_ : null;

  // Mocks / fakes
  var ensureCalls = [];
  ensureSheetWithHeaders_ = function(sheetName, fields) {
    ensureCalls.push({ sheetName: sheetName, fields: fields.slice() });
    return { _mock: true, name: sheetName };
  };

  var lastUpsert = { appended: 0, updated: 0 };
  upsertRowsToSheet_ = function(records, sheetName, uniqueKey) {
    lastUpsert.appended += (records ? records.length : 0);
    return { appended: (records ? records.length : 0), updated: 0 };
  };

  applyColumnFormats_ = function(sheet) { /* no-op */ };

  try {
    // Clone CONFIG_TEST shallowly and override only what we need for this test
    var cfg = {};
    for (var k in CONFIG_TEST) if (Object.prototype.hasOwnProperty.call(CONFIG_TEST, k)) cfg[k] = CONFIG_TEST[k];

    // Provide fresh RUN_FLAGS so we don't mutate global CONFIG_TEST
    cfg.RUN_FLAGS = { parseMode: undefined, csvSanitized: 'no' };

    // Stub resume handlers to capture calls
    var resumeCalls = [];
    cfg.resume = {
      setState: function(s) { resumeCalls.push(s); },
      resetState: function() {} // no-op
    };

    // Simulate pages: page 1 has exactly 2 results (== pageSize), page 2 is empty
    var pageMap = {
      1: JSON.stringify({ results: [
        { SystemId: '1', Name: 'Alice', Email: 'alice@example.com', Extra: 'x' },
        { SystemId: '2', Name: 'Bob',   Email: 'bob@example.com' }
      ] }),
      2: JSON.stringify({ results: [] })
    };

    // Ensure pageSize is 2 so we trigger a second iteration
    cfg.pageSize = 2;
    cfg.startPage = 1;

    // Runner supports either {payload} or {records}. We'll use {payload}.
    cfg.fetchPage = function(body, page) {
      var text = pageMap[page] || JSON.stringify({ results: [] });
      return { payload: text };
    };

    // Keep sheetConfigs from CONFIG_TEST; ensure fields are the 3 columns we care about
    assertDeepEqual_(
      'CONFIG_TEST fields must be SystemId/Name/Email',
      ['SystemId','Name','Email'],
      cfg.sheetConfigs[0].fields
    );

    // Execute
    var result = runReport(cfg);

    // Assertions
    assertEquals_('status should be SUCCESS', 'SUCCESS', result.status);
    assertEquals_('recordsFetched should be 2', 2, result.recordsFetched);
    assertEquals_('pagesFetched should be 1 (only the non-empty page counted)', 1, result.pagesFetched);
    assertEquals_('appended should equal number of records', 2, result.appended);
    assertEquals_('updated should be 0', 0, result.updated);

    // RUN_FLAGS should indicate JSON mode
    assertEquals_('RUN_FLAGS.parseMode should be json', 'json', cfg.RUN_FLAGS.parseMode);

    // Resume should have been set once (after page 1) for the next page (2)
    assertEquals_('resume.setState should be called once', 1, resumeCalls.length);
    assertEquals_('resume.setState page should be 2', 2, resumeCalls[0].page);

    // Ensure sheet helper was called with TestSheet and correct headers
    assertTrue_('ensureSheetWithHeaders_ should be called at least once', ensureCalls.length >= 1);
    assertEquals_('ensureSheetWithHeaders_ sheet name should be TestSheet', 'TestSheet', ensureCalls[0].sheetName);
    assertDeepEqual_('ensureSheetWithHeaders_ headers should match',
      ['SystemId','Name','Email'], ensureCalls[0].fields);

    _logPass_('testRunReport_CONFIG_TEST_basic');
  } catch (e) {
    _logFail_('testRunReport_CONFIG_TEST_basic', e);
    throw e; // rethrow so the test runner marks failure
  } finally {
    // Restore originals
    if (_origEnsure) ensureSheetWithHeaders_ = _origEnsure;
    if (_origUpsert) upsertRowsToSheet_ = _origUpsert;
    if (_origFormats) applyColumnFormats_ = _origFormats;
  }
}

/**
 * Unit test for parsePayload_ with a JSON array:
 * - Ensures only requested fields are picked.
 * - Confirms RUN_FLAGS.parseMode is set to 'json'.
 */
function testParsePayload_JSON_array() {
  try {
    var cfg = {
      request: {
        format: 'json',
        outputFields: ['SystemId','Name','Email']
      },
      RUN_FLAGS: {}
    };

    var text = JSON.stringify([
      { SystemId: 'A1', Name: 'Zelda', Email: 'z@example.com', Extra: 'ignored' }
    ]);

    var out = parsePayload_(text, 1, cfg);

    assertEquals_('rowCount should be 1', 1, out.rowCount);
    assertEquals_('RUN_FLAGS.parseMode should be json', 'json', cfg.RUN_FLAGS.parseMode);

    // Only the requested fields should be present (order preserved)
    var row = out.records[0];
    assertDeepEqual_(
      'record keys should be the requested fields',
      ['SystemId','Name','Email'],
      Object.keys(row)
    );
    assertEquals_('SystemId preserved', 'A1', row.SystemId);
    assertEquals_('Name preserved', 'Zelda', row.Name);
    assertEquals_('Email preserved', 'z@example.com', row.Email);

    _logPass_('testParsePayload_JSON_array');
  } catch (e) {
    _logFail_('testParsePayload_JSON_array', e);
    throw e;
  }
}

/**
 * Covers the {records} path (helper returns parsed records, as parsePayload_ does).
 */
function testRunReport_recordsPath_viaParsePayload() {
  // Save originals
  var _origEnsure = (typeof ensureSheetWithHeaders_ === 'function') ? ensureSheetWithHeaders_ : null;
  var _origUpsert = (typeof upsertRowsToSheet_ === 'function') ? upsertRowsToSheet_ : null;
  var _origFormats = (typeof applyColumnFormats_ === 'function') ? applyColumnFormats_ : null;

  // Mocks
  var ensureCalls = [];
  ensureSheetWithHeaders_ = function(name, fields) {
    ensureCalls.push({ name: name, fields: fields.slice() });
    return { _mock: true, name: name };
  };
  var totalAppended = 0;
  upsertRowsToSheet_ = function(records, name, keyField) {
    totalAppended += (records ? records.length : 0);
    return { appended: (records ? records.length : 0), updated: 0 };
  };
  applyColumnFormats_ = function() {};

  try {
    // Fresh config seeded from CONFIG_TEST
    var cfg = {};
    for (var k in CONFIG_TEST) if (Object.prototype.hasOwnProperty.call(CONFIG_TEST, k)) cfg[k] = CONFIG_TEST[k];

    cfg.RUN_FLAGS = { parseMode: undefined, csvSanitized: 'no' };
    cfg.pageSize = 2;
    cfg.startPage = 1;

    // Use {records} path instead of {payload}
    var page1Records = [
      { SystemId: '10', Name: 'Carol', Email: 'carol@example.com' },
      { SystemId: '11', Name: 'Dan',   Email: 'dan@example.com' }
    ];
    cfg.fetchPage = function(body, page) {
      if (page === 1) return { records: page1Records };
      return { records: [] }; // terminates
    };

    var result = runReport(cfg);

    assertEquals_('status', 'SUCCESS', result.status);
    assertEquals_('pagesFetched', 1, result.pagesFetched);
    assertEquals_('recordsFetched', 2, result.recordsFetched);
    assertEquals_('appended', 2, result.appended);
    assertEquals_('updated', 0, result.updated);
    assertEquals_('RUN_FLAGS.parseMode should be json by default', 'json', cfg.RUN_FLAGS.parseMode);
    assertTrue_('ensureSheetWithHeaders_ called', ensureCalls.length >= 1);

    _logPass_('testRunReport_recordsPath_viaParsePayload');
  } catch (e) {
    _logFail_('testRunReport_recordsPath_viaParsePayload', e);
    throw e;
  } finally {
    if (_origEnsure) ensureSheetWithHeaders_ = _origEnsure;
    if (_origUpsert) upsertRowsToSheet_ = _origUpsert;
    if (_origFormats) applyColumnFormats_ = _origFormats;
  }
}

/**
 * Ensures time budget cutoff stops after first page even if next page would exist.
 */
function testRunReport_budgetStops() {
  // Save original budget checker
  var _origHasTimeLeft = (typeof hasTimeLeft_ === 'function') ? hasTimeLeft_ : null;

  try {
    var cfg = {};
    for (var k in CONFIG_TEST) if (Object.prototype.hasOwnProperty.call(CONFIG_TEST, k)) cfg[k] = CONFIG_TEST[k];
    cfg.RUN_FLAGS = { parseMode: undefined, csvSanitized: 'no' };
    cfg.pageSize = 1; // full pages to tempt a second pass

    // First loop: allow; Second loop: deny
    var calls = 0;
    hasTimeLeft_ = function(startMs, budgetMs) {
      calls++;
      return calls === 1; // true on first check, false afterwards
    };

    // Always return a single record on page 1; runner should stop before page 2
    cfg.fetchPage = function(body, page) {
      if (page === 1) return { payload: JSON.stringify({ results: [{ SystemId: 'X', Name: 'One', Email: '1@x.com' }] }) };
      return { payload: JSON.stringify({ results: [{ SystemId: 'Y', Name: 'Two', Email: '2@x.com' }] }) };
    };

    // Mock sheet ops
    var _origEnsure = ensureSheetWithHeaders_;
    var _origUpsert = upsertRowsToSheet_;
    var _origFormats = applyColumnFormats_;
    ensureSheetWithHeaders_ = function() { return { _mock: true }; };
    upsertRowsToSheet_ = function(records) { return { appended: records.length, updated: 0 }; };
    applyColumnFormats_ = function() {};

    var result = runReport(cfg);

    assertEquals_('pagesFetched should be 1 due to budget cutoff', 1, result.pagesFetched);
    assertEquals_('recordsFetched should be 1', 1, result.recordsFetched);

    _logPass_('testRunReport_budgetStops');
  } catch (e) {
    _logFail_('testRunReport_budgetStops', e);
    throw e;
  } finally {
    if (_origHasTimeLeft) hasTimeLeft_ = _origHasTimeLeft;
  }
}

/**
 * Invalid JSON should set ERROR status and still call resume.resetState().
 */
function testRunReport_errorInvalidJson_and_resumeReset() {
  // Save originals
  var _origEnsure = (typeof ensureSheetWithHeaders_ === 'function') ? ensureSheetWithHeaders_ : null;
  var _origUpsert = (typeof upsertRowsToSheet_ === 'function') ? upsertRowsToSheet_ : null;
  var _origFormats = (typeof applyColumnFormats_ === 'function') ? applyColumnFormats_ : null;

  ensureSheetWithHeaders_ = function() { return { _mock: true }; };
  upsertRowsToSheet_ = function() { return { appended: 0, updated: 0 }; };
  applyColumnFormats_ = function() {};

  try {
    var cfg = {};
    for (var k in CONFIG_TEST) if (Object.prototype.hasOwnProperty.call(CONFIG_TEST, k)) cfg[k] = CONFIG_TEST[k];
    cfg.RUN_FLAGS = { parseMode: undefined, csvSanitized: 'no' };
    cfg.fetchPage = function(body, page) {
      return { payload: 'not-json at all' };
    };

    var resetCalled = 0;
    cfg.resume = {
      setState: function() {},
      resetState: function() { resetCalled++; }
    };

    var result = runReport(cfg);

    assertEquals_('status should be ERROR', 'ERROR', result.status);
    assertEquals_('pagesFetched should be 0 on JSON error', 0, result.pagesFetched);
    assertTrue_('error message should be present', !!result.error);
    assertEquals_('resume.resetState should be called once', 1, resetCalled);

    _logPass_('testRunReport_errorInvalidJson_and_resumeReset');
  } catch (e) {
    _logFail_('testRunReport_errorInvalidJson_and_resumeReset', e);
    throw e;
  } finally {
    if (_origEnsure) ensureSheetWithHeaders_ = _origEnsure;
    if (_origUpsert) upsertRowsToSheet_ = _origUpsert;
    if (_origFormats) applyColumnFormats_ = _origFormats;
  }
}

/**
 * Verifies scheduling and audit/digest hooks are invoked.
 */
function testRunReport_scheduleAndAuditDigest() {
  // Save originals
  var _origEnsure = (typeof ensureSheetWithHeaders_ === 'function') ? ensureSheetWithHeaders_ : null;
  var _origUpsert = (typeof upsertRowsToSheet_ === 'function') ? upsertRowsToSheet_ : null;
  var _origFormats = (typeof applyColumnFormats_ === 'function') ? applyColumnFormats_ : null;

  ensureSheetWithHeaders_ = function() { return { _mock: true }; };
  upsertRowsToSheet_ = function(records) { return { appended: records.length, updated: 0 }; };
  applyColumnFormats_ = function() {};

  try {
    var cfg = {};
    for (var k in CONFIG_TEST) if (Object.prototype.hasOwnProperty.call(CONFIG_TEST, k)) cfg[k] = CONFIG_TEST[k];
    cfg.RUN_FLAGS = { parseMode: undefined, csvSanitized: 'no' };

    // One non-empty page then empty
    cfg.fetchPage = function(body, page) {
      if (page === 1) return { payload: JSON.stringify({ results: [{ SystemId: '7', Name: 'Gus', Email: 'g@ex.com' }] }) };
      return { payload: JSON.stringify({ results: [] }) };
    };

    var auditInfo = null, digestInfo = null, scheduled = 0;
    cfg.audit = { writeLog: function(info) { auditInfo = info; } };
    cfg.digest = { sendEmail: function(info) { digestInfo = info; } };
    cfg.scheduleDaily = true;
    cfg.scheduleContinuation = function() { scheduled++; };

    var result = runReport(cfg);

    assertEquals_('status', 'SUCCESS', result.status);
    assertEquals_('scheduled continuation called once', 1, scheduled);
    assertTrue_('audit.writeLog called', !!auditInfo);
    assertTrue_('digest.sendEmail called', !!digestInfo);
    assertEquals_('audit info appended should be 1', 1, auditInfo.appended);
    assertEquals_('digest info appended should be 1', 1, digestInfo.appended);

    _logPass_('testRunReport_scheduleAndAuditDigest');
  } catch (e) {
    _logFail_('testRunReport_scheduleAndAuditDigest', e);
    throw e;
  } finally {
    if (_origEnsure) ensureSheetWithHeaders_ = _origEnsure;
    if (_origUpsert) upsertRowsToSheet_ = _origUpsert;
    if (_origFormats) applyColumnFormats_ = _origFormats;
  }
}
/** =========================
 * Minimal test harness (same as before)
 * ========================= */

function assertEquals_(msg, expected, actual) {
  if (expected !== actual) throw new Error(msg + ' | expected=' + expected + ' actual=' + actual);
}
function assertTrue_(msg, cond) {
  if (!cond) throw new Error(msg + ' | condition was false');
}
function assertDeepEqual_(msg, expected, actual) {
  var e = JSON.stringify(expected);
  var a = JSON.stringify(actual);
  if (e !== a) throw new Error(msg + ' | expected=' + e + ' actual=' + a);
}
function _logPass_(name) { Logger.log('PASS ' + name); }
function _logFail_(name, e) { Logger.log('FAIL ' + name + ' — ' + e); }

/** =========================
 * Helper used by tests
 * ========================= */

function withSilencedLogger_(fn) {
  var orig = Logger.log;
  try {
    Logger.log = function(){};
    return fn();
  } finally {
    Logger.log = orig;
  }
}

/** =========================
 * Tests: Notifications / HTML escaping
 * ========================= */

function test_escapeHtml_basic() {
  try {
    var s = `<div a="1">Tom & 'Jerry'</div>`;
    var out = escapeHtml_(s);
    assertEquals_('escape "<"', true, out.indexOf('&lt;div') === 0);
    assertTrue_('escape &', out.indexOf('&amp;') !== -1);
    assertTrue_('escape quotes', out.indexOf('&quot;1&quot;') !== -1);
    assertTrue_('escape single quote', out.indexOf('&#39;') !== -1);
    _logPass_('test_escapeHtml_basic');
  } catch (e) {
    _logFail_('test_escapeHtml_basic', e); throw e;
  }
}

function test_buildDigestSubject_andBody() {
  try {
    var info = {
      status: 'SUCCESS',
      appended: 5,
      updated: 2,
      pagesFetched: 3,
      durationMs: 125000, // ~2.08 min
      txChargeAppended: 1,
      txChargeUpdated: 0,
      rawFilesSaved: 2,
      resumeSavedPage: 4
    };
    var subj = buildDigestSubject_(info, '[Daxko]');
    assertEquals_('subject format', '[Daxko] SUCCESS · +5 / ~2 · pgs 3', subj);

    var body = buildDigestBodyText_(info, 'Users', 'daxko_audit');
    assertTrue_('body has Sheet', body.indexOf('Sheet: Users') >= 0);
    assertTrue_('body has counts', body.indexOf('Header rows: +5, ~2') >= 0);
    assertTrue_('body includes duration minutes', body.indexOf('Duration: 2.08 min') >= 0);
    _logPass_('test_buildDigestSubject_andBody');
  } catch (e) {
    _logFail_('test_buildDigestSubject_andBody', e); throw e;
  }
}

function test_notificationsEnabled_and_recipients() {
  // Save/restore properties & CONFIG.notifications
  var sp = PropertiesService.getScriptProperties();
  var oldTo = sp.getProperty('DIGEST_TO');
  var oldCfgNotif = CONFIG.notifications;

  try {
    sp.setProperty('DIGEST_TO', 'a@example.com, b@example.com');
    CONFIG.notifications = {
      enabled: true,
      sendOnError: true,
      sendOnSuccess: true,
      subjectPrefix: '[Daxko]',
      useHtml: false
    };

    var infoOK = { status: 'SUCCESS' };
    var infoERR = { status: 'ERROR' };

    assertEquals_('recipients length 2', 2, getDigestRecipients_().length);
    assertTrue_('enabled on success', notificationsEnabled_(infoOK));
    assertTrue_('enabled on error', notificationsEnabled_(infoERR));

    CONFIG.notifications.sendOnSuccess = false;
    assertEquals_('disabled on success when sendOnSuccess=false', false, notificationsEnabled_(infoOK));
    CONFIG.notifications.sendOnSuccess = true;
    CONFIG.notifications.sendOnError = false;
    assertEquals_('disabled on error when sendOnError=false', false, notificationsEnabled_(infoERR));

    _logPass_('test_notificationsEnabled_and_recipients');
  } catch (e) {
    _logFail_('test_notificationsEnabled_and_recipients', e); throw e;
  } finally {
    if (oldTo == null) sp.deleteProperty('DIGEST_TO'); else sp.setProperty('DIGEST_TO', oldTo);
    CONFIG.notifications = oldCfgNotif;
  }
}

/** =========================
 * Tests: HTTP text safety
 * ========================= */

function test_safeGetText_bom_and_newlines() {
  try {
    var fakeResp = {
      getContentText: function(enc) {
        if (enc !== 'UTF-8') throw new Error('enc required'); // simulate needing encoding
        // Include BOM and CRLF + CR
        return '\uFEFFLine1\r\nLine2\rLine3';
      },
      getContent: function() { return Utilities.newBlob('unused').getBytes(); }
    };
    var out = safeGetText_(fakeResp);
    assertEquals_('BOM removed + normalized LF', 'Line1\nLine2\nLine3', out);
    _logPass_('test_safeGetText_bom_and_newlines');
  } catch (e) {
    _logFail_('test_safeGetText_bom_and_newlines', e); throw e;
  }
}

/** =========================
 * Tests: Drive / folders
 * ========================= */

function test_getOrCreateFolderPath_idempotent() {
  // Creates a unique test folder path, ensures idempotency, then trashes it.
  var stamp = 'unit_' + Date.now();
  var path = 'daxko-raw/_tests/' + stamp;
  var folder = null;
  try {
    folder = getOrCreateFolderPath_(path);
    assertTrue_('folder created', !!folder && typeof folder.getId === 'function');
    var id1 = folder.getId();
    var again = getOrCreateFolderPath_(path);
    assertEquals_('same folder id on second call', id1, again.getId());
    _logPass_('test_getOrCreateFolderPath_idempotent');
  } catch (e) {
    _logFail_('test_getOrCreateFolderPath_idempotent', e); throw e;
  } finally {
    if (folder) { try { folder.setTrashed(true); } catch (_) {} }
  }
}

/** =========================
 * Tests: Scheduling / triggers
 * ========================= */

function test_scheduleContinuation_dedup() {
  var handler = 'unitTestHandler_' + Math.floor(Math.random() * 1e6);

  // Clean any pre-existing triggers for this handler (paranoia)
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === handler) ScriptApp.deleteTrigger(triggers[i]);
  }

  try {
    scheduleContinuation_(handler, 15000); // create one
    scheduleContinuation_(handler, 15000); // should dedupe back to one
    var list = ScriptApp.getProjectTriggers().filter(function(t){ return t.getHandlerFunction() === handler; });
    assertEquals_('only one trigger exists after dedupe', 1, list.length);
    _logPass_('test_scheduleContinuation_dedup');
  } catch (e) {
    _logFail_('test_scheduleContinuation_dedup', e); throw e;
  } finally {
    // cleanup
    var list2 = ScriptApp.getProjectTriggers();
    for (var j = 0; j < list2.length; j++) {
      if (list2[j].getHandlerFunction() === handler) ScriptApp.deleteTrigger(list2[j]);
    }
  }
}

/** =========================
 * Tests: State management
 * ========================= */

function test_state_set_get_reset_and_force() {
  var sp = PropertiesService.getScriptProperties();
  var oldConfig = CONFIG;
  var testKey = 'UNIT_STATE_' + Date.now();
  // Create a lean CONFIG with only what's required by state functions
  CONFIG = {
    stateKey: testKey,
    request: { pageSize: 123, format: 'json' }
  };
  try {
    // Start clean
    sp.deleteProperty(testKey);

    // set/get
    var obj = { page: 5, pageSize: 99, format: 'json' };
    setResumeState_(obj);
    var got = getResumeState_();
    assertDeepEqual_('get after set', obj, got);

    // force page uses CONFIG.request to normalize
    if (typeof forceResumePage_ === 'function') {
      forceResumePage_(7);
      var got2 = getResumeState_();
      assertEquals_('forced page number', 7, got2.page);
      assertEquals_('forced pageSize from CONFIG.request', 123, got2.pageSize);
      assertEquals_('forced format lowercased', 'json', got2.format);
      assertTrue_('updatedAt present', !!got2.updatedAt);
    }

    // reset
    resetResumeState_();
    var gone = getResumeState_();
    assertEquals_('state after reset is null', null, gone);

    _logPass_('test_state_set_get_reset_and_force');
  } catch (e) {
    _logFail_('test_state_set_get_reset_and_force', e); throw e;
  } finally {
    // cleanup and restore CONFIG
    PropertiesService.getScriptProperties().deleteProperty(testKey);
    CONFIG = oldConfig;
  }
}

/** =========================
 * Tests: Casting & Date parsing
 * ========================= */

function test_parseDateFlexible_various() {
  try {
    var d1 = parseDateFlexible_('1/2/2024 1:02 PM');
    assertTrue_('mdy am/pm parsed', d1 instanceof Date && !isNaN(d1.getTime()));
    assertEquals_('mdy month (0-based) = Jan', 0, d1.getMonth());
    assertEquals_('mdy day = 2', 2, d1.getDate());
    assertEquals_('mdy 24h hour = 13', 13, d1.getHours());

    var d2 = parseDateFlexible_('2024-08-15');
    assertTrue_('iso date parsed', d2 instanceof Date && !isNaN(d2.getTime()));
    assertEquals_('iso month (0-based) = Aug', 7, d2.getMonth());
    assertEquals_('iso day = 15', 15, d2.getDate());

    var d3 = parseDateFlexible_('2024-12-31T23:59:58Z');
    assertTrue_('iso zulu parsed', d3 instanceof Date && !isNaN(d3.getTime()));

    var bad = parseDateFlexible_('not a date');
    assertEquals_('invalid returns null', null, bad);

    _logPass_('test_parseDateFlexible_various');
  } catch (e) {
    _logFail_('test_parseDateFlexible_various', e); throw e;
  }
}

function test_castValue_and_getRowValuesWithCasting() {
  // Save & stub CONFIG type maps
  var oldConfig = CONFIG;
  CONFIG = {
    typesDateFields: ['Joined','BirthDate'],
    typesNumericFields: ['Age','GuestVisits'],
    formats: { date: 'yyyy-mm-dd', numeric: '0' }
  };
  try {
    var rec = {
      SystemId: '42',
      Name: 'Zoe',
      Age: ' 30 ',
      BirthDate: '2/3/2023 12:00 AM',
      Joined: '2024-01-15',
      GuestVisits: '1,234'
    };
    var header = ['SystemId','Name','Age','BirthDate','Joined','GuestVisits'];

    var row = getRowValuesWithCasting_(rec, header);

    assertEquals_('SystemId string', '42', row[0]);
    assertEquals_('Name string', 'Zoe', row[1]);
    assertEquals_('Age numeric', 30, row[2]);
    assertTrue_('BirthDate Date', row[3] instanceof Date && !isNaN(row[3].getTime()));
    assertTrue_('Joined Date', row[4] instanceof Date && !isNaN(row[4].getTime()));
    assertEquals_('GuestVisits numeric decomma', 1234, row[5]);

    _logPass_('test_castValue_and_getRowValuesWithCasting');
  } catch (e) {
    _logFail_('test_castValue_and_getRowValuesWithCasting', e); throw e;
  } finally {
    CONFIG = oldConfig;
  }
}
function test_notifications_html_realTags_and_recipients() {
  var origSend = MailApp.sendEmail;
  var sent = null;
  MailApp.sendEmail = function(opts) { sent = opts; };

  try {
    var info = {
      status: 'SUCCESS',
      appended: 1,
      updated: 0,
      pagesFetched: 1,
      runTimestamp: new Date(),
      durationMs: 1000
    };

    // Ensure recipients are configured
    var sp = PropertiesService.getScriptProperties();
    var oldTo = sp.getProperty('DIGEST_TO');
    sp.setProperty('DIGEST_TO', 'a@example.com');

    // Force HTML path
    var oldNotif = CONFIG.notifications;
    CONFIG.notifications = { enabled: true, sendOnSuccess: true, sendOnError: true, useHtml: true, subjectPrefix: '[Test]' };

    sendDigestNotification_(info);

    // Assertions
    if (!sent) throw new Error('sendEmail was not called');
    if (!sent.htmlBody || sent.htmlBody.indexOf('<table') === -1) {
      throw new Error('Expected real <table> tags in htmlBody, but did not find them');
    }
    if ((sent.to || '').indexOf('a@example.com') === -1) {
      throw new Error('Expected recipients from DIGEST_TO, but got: ' + sent.to);
    }

    Logger.log('PASS test_notifications_html_realTags_and_recipients');
  } catch (e) {
    Logger.log('FAIL test_notifications_html_realTags_and_recipients — ' + e);
    throw e;
  } finally {
    MailApp.sendEmail = origSend;
    // restore props
    var sp2 = PropertiesService.getScriptProperties();
    var oldTo2 = sp2.getProperty('DIGEST_TO');
    if (oldTo2 === 'a@example.com') sp2.deleteProperty('DIGEST_TO');
    CONFIG.notifications = oldNotif;
  }
}
function testParsePayload_JSON_objectWithData() {
  try {
    var cfg = {
      request: {
        format: 'json',
        outputFields: ['SystemId','Name','Email']
      },
      RUN_FLAGS: {}
    };

    var text = JSON.stringify({
      data: [
        { SystemId: 'D1', Name: 'Dana', Email: 'd@example.com', Ignore: 'x' }
      ]
    });

    var out = parsePayload_(text, 1, cfg);

    assertEquals_('rowCount should be 1', 1, out.rowCount);
    assertEquals_('parseMode should be json', 'json', cfg.RUN_FLAGS.parseMode);
    assertDeepEqual_('picked fields only',
      ['SystemId','Name','Email'], Object.keys(out.records[0]));

    _logPass_('testParsePayload_JSON_objectWithData');
  } catch (e) {
    _logFail_('testParsePayload_JSON_objectWithData', e); throw e;
  }
}
function test_ensureSheetWithHeaders_addsMissing() {
  var ss = null, file = null;
  try {
    ss = SpreadsheetApp.create('unit_tmp_' + Date.now());
    file = DriveApp.getFileById(ss.getId());

    // Make it the active spreadsheet so ensureSheetWithHeaders_ operates on it
    if (SpreadsheetApp.setActiveSpreadsheet) {
      SpreadsheetApp.setActiveSpreadsheet(ss);
    } else {
      throw new Error('SpreadsheetApp.setActiveSpreadsheet not available in this context');
    }

    var sheet = ss.insertSheet('Users');
    sheet.appendRow(['SystemId']); // start with partial headers

    var desired = ['SystemId','Name','Email'];
    var got = ensureSheetWithHeaders_('Users', desired);

    // Validate headers are extended and bold + frozen
    var header = got.getRange(1,1,1,got.getLastColumn()).getValues()[0];
    assertDeepEqual_('headers extended', desired, header);

    var bolds = got.getRange(1,1,1,got.getLastColumn()).getFontWeights()[0];
    assertTrue_('all header cells bold', bolds.every(function(b){ return b === 'bold'; }));

    assertEquals_('frozenRows = 1', 1, got.getFrozenRows());

    _logPass_('test_ensureSheetWithHeaders_addsMissing');
  } catch (e) {
    _logFail_('test_ensureSheetWithHeaders_addsMissing', e); throw e;
  } finally {
    if (file) { try { file.setTrashed(true); } catch(_){} }
  }
}
function test_applyColumnFormats_zeroHeight_and_formats() {
  var ss = null, file = null;
  var oldConfig = CONFIG;
  try {
    ss = SpreadsheetApp.create('unit_tmp_' + Date.now());
    file = DriveApp.getFileById(ss.getId());
    if (SpreadsheetApp.setActiveSpreadsheet) SpreadsheetApp.setActiveSpreadsheet(ss);

    // Fake type maps
    CONFIG = {
      typesDateFields: ['Joined'],
      typesNumericFields: ['Age'],
      formats: { date: 'yyyy-mm-dd', numeric: '0' }
    };

    var sh = ss.insertSheet('Fmt');
    sh.appendRow(['Name','Age','Joined']); // header only, no data rows
    // Should not throw
    applyColumnFormats_(sh);

    // Add some data and ensure formats are applied
    sh.appendRow(['Zoe','30','2024-01-15']);
    applyColumnFormats_(sh);

    var rangeAge = sh.getRange(2, 2);
    var rangeJoined = sh.getRange(2, 3);
    assertEquals_('numeric format applied', CONFIG.formats.numeric, rangeAge.getNumberFormat());
    assertEquals_('date format applied', CONFIG.formats.date, rangeJoined.getNumberFormat());

    _logPass_('test_applyColumnFormats_zeroHeight_and_formats');
  } catch (e) {
    _logFail_('test_applyColumnFormats_zeroHeight_and_formats', e); throw e;
  } finally {
    CONFIG = oldConfig;
    if (file) { try { file.setTrashed(true); } catch(_){} }
  }
}
function test_upsertRowsToSheet_insert_and_update() {
  var ss = null, file = null;
  try {
    ss = SpreadsheetApp.create('unit_tmp_' + Date.now());
    file = DriveApp.getFileById(ss.getId());
    if (SpreadsheetApp.setActiveSpreadsheet) SpreadsheetApp.setActiveSpreadsheet(ss);

    var sh = ss.insertSheet('Users');
    // Ensure headers
    var header = ['SystemId','Name','Email','Age'];
    sh.appendRow(header);

    // Initial insert: 2 rows
    var res1 = upsertRowsToSheet_([
      { SystemId:'1', Name:'Alice', Email:'a@x.com', Age:30 },
      { SystemId:'2', Name:'Bob',   Email:'b@x.com', Age:40 }
    ], 'Users', 'SystemId');

    assertEquals_('first appended=2', 2, res1.appended);
    assertEquals_('first updated=0', 0, res1.updated);
    assertEquals_('rows now 3 (header + 2)', 3, sh.getLastRow());

    // Update one, add one new
    var res2 = upsertRowsToSheet_([
      { SystemId:'2', Name:'Bobby', Email:'bob@x.com', Age:41 }, // update
      { SystemId:'3', Name:'Cara',  Email:'c@x.com',   Age:25 }  // insert
    ], 'Users', 'SystemId');

    assertEquals_('second appended=1', 1, res2.appended);
    assertEquals_('second updated=1', 1, res2.updated);
    assertEquals_('rows now 4 (header + 3)', 4, sh.getLastRow());

    // Verify updated cell
    var data = sh.getRange(2,1,3,4).getValues(); // rows 2..4, cols 1..4
    // Find row with SystemId '2'
    var row2 = data.filter(function(r){ return String(r[0])==='2'; })[0];
    assertEquals_('updated name', 'Bobby', row2[1]);
    assertEquals_('updated email', 'bob@x.com', row2[2]);
    assertEquals_('updated age', 41, row2[3]);

    _logPass_('test_upsertRowsToSheet_insert_and_update');
  } catch (e) {
    _logFail_('test_upsertRowsToSheet_insert_and_update', e); throw e;
  } finally {
    if (file) { try { file.setTrashed(true); } catch(_){} }
  }
}

function test_runReport_responseParsing() {
  var testCases = [
    {
      name: 'records array directly',
      response: { records: [{ SystemId: '1' }, { SystemId: '2' }] },
      expectedCount: 2
    },
    {
      name: 'payload with data array',
      response: { payload: JSON.stringify({ data: [{ SystemId: '3' }] }) },
      expectedCount: 1
    },
    {
      name: 'payload with results array',
      response: { payload: JSON.stringify({ results: [{ SystemId: '4' }] }) },
      expectedCount: 1
    },
    {
      name: 'payload with raw array',
      response: { payload: JSON.stringify([{ SystemId: '5' }, { SystemId: '6' }]) },
      expectedCount: 2
    },
    {
      name: 'payload with invalid JSON',
      response: { payload: 'not json' },
      expectError: true
    },
    {
      name: 'payload with no array',
      response: { payload: JSON.stringify({ message: 'no data' }) },
      expectedCount: 0
    }
  ];

  testCases.forEach(function(tc) {
    var config = {
      buildRequestBody: function(page) { return {}; },
      fetchPage: function(body, page) { return tc.response; },
      sheetConfigs: [{
        sheetName: 'Dummy',
        fields: ['SystemId'],
        keyField: 'SystemId',
        getRecords: function(flattened) { return flattened.main; },
        applyFormats: function() {}
      }],
      pageSize: 10,
      startPage: 1,
      flattenRecords: function(results) { return { main: results }; },
      resume: { setState: function() {}, resetState: function() {} },
      audit: { writeLog: function() {} },
      digest: { sendEmail: function() {} },
      runtime: { msBudget: 10000 },
      RUN_FLAGS: {}
    };

    try {
      var result = runReport(config);
      if (tc.expectError) {
        throw new Error('Expected error but got success');
      }
      assertEquals_('Test ' + tc.name + ' record count', tc.expectedCount, result.recordsFetched);
      _logPass_('test_runReport_responseParsing: ' + tc.name);
    } catch (e) {
      if (tc.expectError) {
        _logPass_('test_runReport_responseParsing: ' + tc.name + ' (expected error)');
      } else {
        _logFail_('test_runReport_responseParsing: ' + tc.name, e);
        throw e;
      }
    }
  });
}

function test_fetchDaxkoPagePost_with_CONFIG_TEST() {
  var called = {
    post: null,
    parse: null
  };

  // Save originals
  var _origPost = postWithRetry_;
  var _origParse = parsePayload_;

  // Mock postWithRetry_
  postWithRetry_ = function(url, body, config) {
    called.post = { url: url, body: body, config: config };
    return '{"results":[{"SystemId":"123","Name":"Test","Email":"test@example.com"}]}';
  };

  // Mock parsePayload_
  parsePayload_ = function(text, pageNumber, config) {
    called.parse = { text: text, pageNumber: pageNumber, config: config };
    return {
      payloadText: text,
      records: [{ SystemId: '123', Name: 'Test', Email: 'test@example.com' }],
      rowCount: 1
    };
  };

  try {
    var body = CONFIG_TEST.buildRequestBody(1);
    var result = fetchDaxkoPagePost_(body, 1, CONFIG_TEST);

    assertEquals_('Should return 1 record', 1, result.rowCount);
    assertEquals_('Record SystemId should be 123', '123', result.records[0].SystemId);
    assertTrue_('postWithRetry_ should be called', called.post !== null);
    assertTrue_('parsePayload_ should be called', called.parse !== null);

    _logPass_('test_fetchDaxkoPagePost_with_CONFIG_TEST');
  } catch (e) {
    _logFail_('test_fetchDaxkoPagePost_with_CONFIG_TEST', e);
    throw e;
  } finally {
    postWithRetry_ = _origPost;
    parsePayload_ = _origParse;
  }
}

function test_fetchDaxkoPagePost_malformedJSON() {
  var _origPost = postWithRetry_;
  var _origParse = parsePayload_;

  postWithRetry_ = function(url, body, config) {
    return 'not valid json';
  };

  parsePayload_ = function(text, pageNumber, config) {
    // This simulates the real parser throwing on bad JSON
    throw new Error('Invalid JSON on page ' + pageNumber);
  };

  try {
    var body = CONFIG_TEST.buildRequestBody(1);
    fetchDaxkoPagePost_(body, 1, CONFIG_TEST);
    throw new Error('Expected error but got success');
  } catch (e) {
    assertTrue_('Should throw on malformed JSON', String(e).indexOf('Invalid JSON') >= 0);
    _logPass_('test_fetchDaxkoPagePost_malformedJSON');
  } finally {
    postWithRetry_ = _origPost;
    parsePayload_ = _origParse;
  }
}

function test_runReport_multiplePages() {
  var pageMap = {
    1: JSON.stringify({ results: [
      { SystemId: '1', Name: 'Alice', Email: 'alice@example.com' },
      { SystemId: '2', Name: 'Bob', Email: 'bob@example.com' }
    ] }),
    2: JSON.stringify({ results: [
      { SystemId: '3', Name: 'Charlie', Email: 'charlie@example.com' }
    ] }),
    3: JSON.stringify({ results: [] }) // triggers stop
  };

  var _origFetch = CONFIG_TEST.fetchPage;
  CONFIG_TEST.fetchPage = function(body, page) {
    return { payload: pageMap[page] || JSON.stringify({ results: [] }) };
  };

  try {
    var result = runReport(CONFIG_TEST);
    assertEquals_('Should fetch 2 non-empty pages', 2, result.pagesFetched);
    assertEquals_('Should fetch 3 records total', 3, result.recordsFetched);
    _logPass_('test_runReport_multiplePages');
  } catch (e) {
    _logFail_('test_runReport_multiplePages', e);
    throw e;
  } finally {
    CONFIG_TEST.fetchPage = _origFetch;
  }
}
function debugTx_onePage() {
  var page = 1;
  var body = CONFIG_TX.buildRequestBody(page);
  Logger.log('Request body: ' + JSON.stringify(body));
  try {
    var resp = CONFIG_TX.fetchPage(body, page); // relies on fetchDaxkoPagePost_
    // Your runner might parse response; if it's raw text, log a snippet
    if (typeof resp === 'string') {
      Logger.log('Raw response (first 500 chars): ' + resp.slice(0, 500));
      try { resp = JSON.parse(resp); } catch (e) {}
    }
    var flattened = CONFIG_TX.flattenRecords(resp);
    Logger.log('flattened invoices: ' + flattened.invoices.length);
    Logger.log('flattened charges: ' + flattened.charges.length);
  } catch (e) {
    Logger.log('DEBUG ERROR: ' + e + '\nStack: ' + (e && e.stack ? e.stack : ''));
    try {
      appendAuditRow_({ level: 'error', msg: 'debugTx_onePage error', error: String(e) }, 'daxko_audit');
    } catch (_) {}
    throw e;
  }
}