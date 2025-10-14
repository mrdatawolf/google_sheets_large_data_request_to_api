/**
 * Entrypoints + setup.
 */
function setupAll() {
  setup();              // Report 1 trigger
  setupTransactions();  // TX trigger
  Logger.log('Both daily triggers installed.');
}

function runDaxkoReport1Daily() {
  var t0 = Date.now();

  // Reset per-run flags
  RUN_FLAGS.didRefresh = false;
  RUN_FLAGS.parseMode = '';
  RUN_FLAGS.csvSanitized = false;

  var status = 'SUCCESS';
  var errorMsg = '';
  var startPage;
  var lastNonEmptyPage = null;
  var pagesFetched = 0;
  var recordsFetched = 0;
  var appended = 0;
  var updated = 0;
  var rawFilesSaved = 0;
  var resumeSavedPage = null;

  try {
    // Determine starting page using saved state if compatible
    var state = getResumeState_();
    var currentFormat = String(CONFIG.request.format).toLowerCase();
    var currentPageSize = Number(CONFIG.request.pageSize);

    startPage = CONFIG.request.startPageNumber;
    if (state && typeof state.page === 'number' && state.page >= 1 &&
        state.pageSize === currentPageSize && String(state.format).toLowerCase() === currentFormat) {
      startPage = state.page; // start ON last non-empty page
    }

    var allRecords = [];
    var pageNumber = startPage;

    while (true) {
      var body = buildRequestBody_(pageNumber);
      var result = fetchDaxkoPagePost_(body, pageNumber);
      var payloadText = result.payloadText;
      var records = result.records;
      var rowCount = result.rowCount;
      pagesFetched++;

      if (CONFIG.raw.enabled && payloadText) {
        saveRawPayload_(payloadText, pageNumber);
        rawFilesSaved++;
      }

      if (!records || rowCount === 0) break;

      for (var i = 0; i < records.length; i++) allRecords.push(records[i]);
      lastNonEmptyPage = pageNumber;

      if (rowCount < currentPageSize) break; // last page
      if (!hasTimeLeft_(t0, CONFIG.runtime && CONFIG.runtime.msBudget)) { // If we’re close to our time budget, persist state, flush partial work, and continue later.
        // Save resume state at the current (last non-empty) page
        if (lastNonEmptyPage !== null) {
          setResumeState_({
            page: lastNonEmptyPage,
            pageSize: Number(CONFIG.request.pageSize),
            format: String(CONFIG.request.format).toLowerCase(),
            updatedAt: new Date().toISOString()
          });
        }
        if (allRecords.length > 0) { // Flush whatever we have so far (writes partial progress)
          var sheet = ensureSheetWithHeaders_(CONFIG.sheetName, CONFIG.request.outputFields);
          applyColumnFormats_(sheet);
          var resPartial = upsertRowsToSheet_(allRecords, CONFIG.sheetName, 'SystemId');
          appended += resPartial.appended;
          updated  += resPartial.updated;
          recordsFetched = appended + updated;
          allRecords = []; // free memory
        }
        writeAuditLog_({ // Partial audit row (optional), status = CONTINUED
          runTimestamp: new Date(),
          status: 'CONTINUED',
          startPage: startPage,
          lastNonEmptyPage: lastNonEmptyPage,
          pagesFetched: pagesFetched,
          recordsFetched: recordsFetched,
          appended: appended,
          updated: updated,
          rawFilesSaved: rawFilesSaved,
          durationMs: Date.now() - t0,
          resumeSavedPage: lastNonEmptyPage,
          format: String(CONFIG.request.format).toLowerCase(),
          pageSize: Number(CONFIG.request.pageSize),
          error: '',
          refreshed: RUN_FLAGS.didRefresh ? 'yes' : 'no',
          parseMode: RUN_FLAGS.parseMode || '',
          csvSanitized: RUN_FLAGS.csvSanitized ? 'yes' : 'no'
        });
        scheduleContinuation_(); // Schedule a near‑term continuation and exit now (no digest yet)
        
        return;
      }

      pageNumber++;
    }

    recordsFetched = allRecords.length;

    if (allRecords.length > 0) {
      var sheet = ensureSheetWithHeaders_(CONFIG.sheetName, CONFIG.request.outputFields);
      applyColumnFormats_(sheet);
      var res = upsertRowsToSheet_(allRecords, CONFIG.sheetName, 'SystemId');
      appended = res.appended;
      updated  = res.updated;
    }

    if (lastNonEmptyPage !== null) {
      setResumeState_({
        page: lastNonEmptyPage,
        pageSize: Number(CONFIG.request.pageSize),
        format: String(CONFIG.request.format).toLowerCase(),
        updatedAt: new Date().toISOString()
      });
      resumeSavedPage = lastNonEmptyPage;
    }

    if (CONFIG.raw.enabled && CONFIG.raw.retentionDays > 0) {
      cleanupOldRawFiles_(CONFIG.raw.driveFolderPath, CONFIG.raw.retentionDays);
    }

  } catch (err) {
    status = 'ERROR';
    errorMsg = (err && err.message) ? String(err.message).substring(0, 1000) : String(err);
  } finally {
    var durationMs = Date.now() - t0;
    writeAuditLog_({
      runTimestamp: new Date(),
      status: status,
      startPage: startPage,
      lastNonEmptyPage: lastNonEmptyPage,
      pagesFetched: pagesFetched,
      recordsFetched: recordsFetched,
      appended: appended,
      updated: updated,
      rawFilesSaved: rawFilesSaved,
      durationMs: durationMs,
      resumeSavedPage: resumeSavedPage,
      format: String(CONFIG.request.format).toLowerCase(),
      pageSize: Number(CONFIG.request.pageSize),
      error: errorMsg,
      refreshed: RUN_FLAGS.didRefresh ? 'yes' : 'no',
      parseMode: RUN_FLAGS.parseMode || '',
      csvSanitized: RUN_FLAGS.csvSanitized ? 'yes' : 'no'
    });
  }

  // Build the one summary object used by audit + email
  var info = {
    runTimestamp: new Date(),
    status: status,
    startPage: startPage,
    lastNonEmptyPage: lastNonEmptyPage,
    pagesFetched: pagesFetched,
    recordsFetched: recordsFetched,
    appended: appended,
    updated: updated,
    rawFilesSaved: rawFilesSaved,
    durationMs: durationMs,
    resumeSavedPage: resumeSavedPage,
    format: String(CONFIG.request.format).toLowerCase(),
    pageSize: Number(CONFIG.request.pageSize),
    error: errorMsg,
    refreshed: RUN_FLAGS.didRefresh ? 'yes' : 'no',
    parseMode: RUN_FLAGS.parseMode || '',
    csvSanitized: RUN_FLAGS.csvSanitized ? 'yes' : 'no'
  };

  // Send one digest email per run with core counts + any error
    sendRunDigestEmail_(info);
}

function setup() {
  var sheet = ensureSheetWithHeaders_(CONFIG.sheetName, CONFIG.request.outputFields);
  applyColumnFormats_(sheet);
  ensureAuditSheet_();

  if (CONFIG.scheduleDaily) {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'runDaxkoReport1Daily') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    ScriptApp.newTrigger('runDaxkoReport1Daily').timeBased().everyDays(1).create();
  }

  Logger.log('Setup complete. Properties for Daxko auth must be set.');
}