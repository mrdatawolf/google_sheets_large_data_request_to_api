function __ping_reportRunner__() {
  Logger.log('reportRunner loaded at ' + new Date());
}
function _validateRunnerConfig_(config) {
  if (!config) throw new Error('runReport: config is required');
  if (typeof config.buildRequestBody !== 'function') throw new Error('runReport: config.buildRequestBody is required');
  if (typeof config.fetchPage !== 'function') throw new Error('runReport: config.fetchPage is required');
  if (!Array.isArray(config.sheetConfigs) || !config.sheetConfigs.length) throw new Error('runReport: sheetConfigs[] is required');
  if (config.pageSize == null) throw new Error('runReport: pageSize is required');
  // Optional: ensure each sheetConfig has name/fields/key
  for (var i = 0; i < config.sheetConfigs.length; i++) {
    var sc = config.sheetConfigs[i];
    if (!sc.sheetName) throw new Error('runReport: sheetConfig[' + i + '].sheetName is required');
    if (!Array.isArray(sc.fields)) throw new Error('runReport: sheetConfig[' + i + '].fields must be array');
    if (!sc.keyField) throw new Error('runReport: sheetConfig[' + i + '].keyField is required');
  }
}
function runReport(config) {
  _validateRunnerConfig_(config);
  var startMs = Date.now();
  var allResults = [];
  var pagesFetched = 0;
  var status = 'SUCCESS';
  var errorMsg = '';
  var appendedTotal = 0;
  var updatedTotal = 0;
  var page = 1;
  var pageSize = Number(config.pageSize || 50);

  if (config.sheetName) {
    var raw = PropertiesService.getScriptProperties().getProperty(config.sheetName);
    if (raw) {
      try {
        var state = JSON.parse(raw);
        page = Number(state.page) || page;
        pageSize = Number(state.pageSize) || pageSize;
        config.format = state.format || config.format;
      } catch (e) {
        Logger.log('Failed to parse state for ' + config.sheetName + ': ' + e);
      }
    }
  }
  config.pageSize = pageSize;
  config.RUN_FLAGS = config.RUN_FLAGS || {};
  if (config.RUN_FLAGS.parseMode == null) config.RUN_FLAGS.parseMode = 'json';
  if (config.RUN_FLAGS.csvSanitized == null) config.RUN_FLAGS.csvSanitized = 'no';
  let lastFetchedPage = page;
  let exitReason = 'completed normally';
  try {
    while (true) {
      var budgetMs = (config.runtime && config.runtime.msBudget) || 240000; // ~4 min safety
      if (!hasTimeLeft_(startMs, budgetMs)) break;
      var requestBody = config.buildRequestBody(page);
      var response = config.fetchPage(requestBody, page);
      if (!response) {
        Logger.log('No response for page ' + page);
        break;
      }
      var resultsForThisPage = null;
      // Path A: helper already parsed & picked fields via parsePayload_()
      if (Array.isArray(response.records)) {
        resultsForThisPage = response.records;
      } else if (typeof response.payload === 'string') {
        var payloadText = response.payload;
        var parsed;
        try {
          parsed = JSON.parse(payloadText);
          config.RUN_FLAGS.parseMode = 'json';
        } catch (e) {
          Logger.log('Failed to parse JSON (page ' + page + '): ' + e);
          throw new Error('CSV parsing is not implemented. Switch API format to JSON or extend parsePayload_.');
        }
        var arr = Array.isArray(parsed) ? parsed :
                 (parsed && Array.isArray(parsed.results)) ? parsed.results :
                 (parsed && parsed.data && Array.isArray(parsed.data.results)) ? parsed.data.results :
                 (parsed && Array.isArray(parsed.data)) ? parsed.data : [];
        resultsForThisPage = arr;
      } else {
        throw new Error('Unknown response shape on page ' + page + '. Expected {records[]} or {payload:string}.');
      }
      var count = resultsForThisPage.length;
      // If the page is empty, do NOT count it and exit
      if (count === 0) {
        Logger.log('No results found on page ' + page);
        break;
      }
      pagesFetched++;
      allResults = allResults.concat(resultsForThisPage);
      //Logger.log('runReport ' + config.sheetName + ' page ' + page + ' finished.')
      lastFetchedPage = page;
      if (count < config.pageSize) {
        break;
      }
      page++;
      if (config.resume && typeof config.resume.setState === 'function') {
        config.resume.setState({
          page: page,
          pageSize: config.pageSize,
          format: config.format
        });
      }
      //Logger.log(`Page ${page} fetched ${count} records. Elapsed: ${Date.now() - startMs} ms`);
    }

    var flattened = (typeof config.flattenRecords === 'function')
      ? config.flattenRecords(allResults)
      : { main: allResults }; // Ensure flattened is an object for the old path

    // Check if we should clear the sheet before writing
    var clearFirst = config.clearBeforeWrite === true;

    // New path: If flattenRecords returns an array of jobs, process them.
    if (Array.isArray(flattened) && flattened.length > 0 && flattened[0].sheetName) {
      for (var i = 0; i < flattened.length; i++) {
        var job = flattened[i];
        if (job.records && job.records.length > 0) {
          var sheet = ensureSheetWithHeaders_(job.sheetName, job.fields);
          var result = upsertRowsToSheet_(job.records, job.sheetName, job.keyField, clearFirst);
          appendedTotal += result.appended || 0;
          updatedTotal  += result.updated  || 0;
          if (typeof job.applyFormats === 'function') {
            job.applyFormats(sheet);
          }
        }
      }
    } else { // Old path: For backward compatibility
      if (Array.isArray(config.sheetConfigs)) {
        for (var i = 0; i < config.sheetConfigs.length; i++) {
          var sc = config.sheetConfigs[i];
          var records = (typeof sc.getRecords === 'function')
            ? sc.getRecords(flattened)
            : flattened.main; // Old path expects a .main property

          if (records && records.length > 0) {
            var sheet = ensureSheetWithHeaders_(sc.sheetName, sc.fields);
            var result = upsertRowsToSheet_(records, sc.sheetName, sc.keyField, clearFirst);
            appendedTotal += result.appended || 0;
            updatedTotal  += result.updated  || 0;
            if (typeof sc.applyFormats === 'function') {
              sc.applyFormats(sheet);
            } else {
              applyColumnFormats_(sheet);
            }
          }
        }
      }
    }

  } catch (err) {
    status = 'ERROR';
    errorMsg = String(err && err.message ? err.message : err);
    Logger.log('runReport error: ' + errorMsg);
  } finally {
    if (config.resume && typeof config.resume.resetState === 'function') {
      try { config.resume.resetState(); } catch (_) {}
    }

    if (config.sheetName) {
      let existingRaw = PropertiesService.getScriptProperties().getProperty(config.sheetName);
      let existingState = {};
      if (existingRaw) {
        try {
          existingState = JSON.parse(existingRaw);
        } catch (e) {
          Logger.log('Failed to parse existing state for ' + config.sheetName + ': ' + e);
        }
      }

      // Only update fields that already exist in the original state
      const finalState = { ...existingState };
      if ('page' in existingState) finalState.page = lastFetchedPage;
      if ('pageSize' in existingState) finalState.pageSize = config.pageSize;
      if ('format' in existingState) finalState.format = config.format;

      PropertiesService.getScriptProperties().setProperty(config.sheetName, JSON.stringify(finalState));
      Logger.log('Elapsed: ' + (Date.now() - startMs) + ' ms');
      Logger.log('config.runtime.msBudget: ' + (config.runtime && config.runtime.msBudget));
    }
  }
   // Shared info object for audit/digest
  var info = {
    runTimestamp: new Date(),
    status: status,
    pagesFetched: pagesFetched,
    recordsFetched: allResults.length,
    appended: appendedTotal,
    updated: updatedTotal,
    lastNonEmptyPage: Math.max(1, page - 1),
    durationMs: Date.now() - startMs,
    refreshed: (config.RUN_FLAGS && (config.RUN_FLAGS.refreshed != null
                ? config.RUN_FLAGS.refreshed
                : (config.RUN_FLAGS.didRefresh ? 'yes' : 'no'))) || 'no',
    parseMode: config.RUN_FLAGS.parseMode,
    csvSanitized: config.RUN_FLAGS.csvSanitized || 'no',
    format: config.format,
    pageSize: config.pageSize,
    error: errorMsg
  };

  if (config.audit && typeof config.audit.writeLog === 'function') {
    try { config.audit.writeLog(info); } catch (e3) { Logger.log('audit.writeLog failed: ' + e3); }
  }
  if (config.digest && typeof config.digest.sendEmail === 'function') {
    try { config.digest.sendEmail(info); } catch (e4) { Logger.log('digest.sendEmail failed: ' + e4); }
  }
  if (config.scheduleDaily) {
    if (typeof config.scheduleContinuation === 'function') {
      try { config.scheduleContinuation(); } catch (e5) { Logger.log('scheduleContinuation failed: ' + e5); }
    } else {
      scheduleContinuation_(); // default helper, handler defaults to runDaxkoReport1Daily
    }
  }

  return {
    status: status,
    pagesFetched: pagesFetched,
    recordsFetched: allResults.length,
    appended: appendedTotal,
    updated: updatedTotal,
    error: errorMsg || null,
    exitReason: exitReason
  };
}

function setupReport(config, functionName, intervalHours) {
  if (!functionName || typeof functionName !== 'string') {
    throw new Error('setupReport: functionName must be a string');
  }
  if (!intervalHours || typeof intervalHours !== 'number' || intervalHours < 1) {
    throw new Error('setupReport: intervalHours must be a positive number');
  }

  // Remove any existing triggers for this function
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
      Logger.log(`Deleted existing trigger for ${functionName}`);
    }
  });

  try {
    const newTrigger = ScriptApp.newTrigger(functionName)
      .timeBased()
      .everyHours(intervalHours)
      .create();

    Logger.log(`Trigger created: ${newTrigger.getUniqueId()} for ${functionName} every ${intervalHours} hour(s)`);
  } catch (e) {
    Logger.log('Trigger creation failed: ' + e.toString());
  }

  // Save state properties individually
  if (config.sheetName) {
    const state = {};
    if (config.pageSize != null) state.pageSize = config.pageSize;
    if (config.startPage != null) state.page = config.startPage;
    if (config.format != null) state.format = config.format;

    if (Object.keys(state).length > 0) {
      PropertiesService.getScriptProperties().setProperty(config.sheetName, JSON.stringify(state));
      Logger.log('Saved state for ' + config.sheetName + ': ' + JSON.stringify(state));
    }
  }
}