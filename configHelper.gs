/**
 * config_helpers.gs
 * Small helpers to remove CONFIG boilerplate
 */

/** Merge shallow objects (right wins). */
function ck_merge_(a, b) {
  var out = {};
  for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k];
  for (var k2 in b) if (Object.prototype.hasOwnProperty.call(b, k2)) out[k2] = b[k2];
  return out;
}

/** Load state from ScriptProperties for a sheetName; fall back to defaults. */
function ck_getState_(sheetName, defaults) {
  var raw = PropertiesService.getScriptProperties().getProperty(sheetName);
  var state = raw ? JSON.parse(raw) : {};
  return {
    format: state.format || defaults.format,
    pageSize: state.pageSize || defaults.pageSize,
    startPage: state.page || defaults.startPage
  };
}

/** Build the static request snapshot that your CONFIGs expose (for logging). */
function ck_buildRequestSnapshot_(format, pageSize, startPageNumber, outputFields, criteriaFields) {
  var req = { format: format, pageSize: pageSize, startPageNumber: startPageNumber };
  if (outputFields != null) req.outputFields = outputFields;
  if (criteriaFields != null) req.criteriaFields = criteriaFields;
  return req;
}

/** Make a single-sheet sheetConfig block with minimal ceremony. */
function ck_makeSingleSheetConfig_(sheetName, fields, keyField, applyFormats, getRecords) {
  return {
    sheetName: sheetName,
    fields: fields,
    keyField: keyField,
    applyFormats: typeof applyFormats === 'function' ? applyFormats : function () {},
    getRecords: typeof getRecords === 'function' ? getRecords : function (flattened) { return flattened.main; }
  };
}

/**
 * Factory – assemble a CONFIG with shared defaults + unique overrides.
 */
function ck_makeConfig_(o) {
  if (!o || !o.sheetName || !o.uniqueKey || !o.apiUrl) {
    throw new Error('ck_makeConfig_: sheetName, uniqueKey, apiUrl are required');
  }

  // --- Define common blocks --- 
  var auditSheet = (o && o.auditSheetName) || 'daxko_audit';
  var msBudget = (o && o.msBudget) || 300000;
  var commonBlocks = {
    raw: { enabled: false, driveFolderPath: '', gzip: false, saveRawPayload: function () {} },
    resume: { getState: function () {}, setState: function () {}, resetState: function () {} },
    audit: {
      sheetName: auditSheet,
      writeLog: function (info) { appendAuditRow_(info, auditSheet); }
    },
    digest: { sendEmail: function () {} },
    runtime: { msBudget: msBudget },
    scheduleContinuation: function () {},
    daxko: { initialBackoffMs: 1000, maxRetries: 3 },
    RUN_FLAGS: { didRefresh: false, csvSanitized: false }
  };

  // --- Resolve state-aware values --- 
  var defaults = {
    pageSize: o.defaults && o.defaults.pageSize != null ? o.defaults.pageSize : 50,
    startPage: o.defaults && o.defaults.startPage != null ? o.defaults.startPage : 1,
    format:   o.defaults && o.defaults.format     != null ? o.defaults.format     : 'json'
  };
  var st = ck_getState_(o.sheetName, defaults);
  var format = st.format, pageSize = st.pageSize, startPage = st.startPage;

  // --- Define default functions --- 
  function defaultBuildBody(page) {
    var b = { format: format, pageSize: String(pageSize), pageNumber: String(page) };
    if (o.outputFields) b.outputFields = o.outputFields;
    if (o.criteriaFields) b.criteriaFields = o.criteriaFields;
    return b;
  }

  function defaultFetchPage(body, page, ctx) {
    return fetchDaxkoPagePost_(body, page, ctx || this);
  }

  function defaultFlatten(resultsArr) {
    return { main: resultsArr };
  }

  // --- Merge everything ---
  return ck_merge_(commonBlocks, {
    apiUrl: o.apiUrl,
    format: format,
    pageSize: pageSize,
    startPage: startPage,
    uniqueKey: o.uniqueKey,
    scheduleDaily: !!o.scheduleDaily,
    sheetName: o.sheetName,
    clearBeforeWrite: !!o.clearBeforeWrite,  // Pass through clearBeforeWrite flag
    request: ck_buildRequestSnapshot_(format, pageSize, startPage, o.outputFields, o.criteriaFields),

    buildRequestBody: (typeof o.buildBody === 'function') ? function (p) { return o.buildBody(p, this); } : defaultBuildBody,
    fetchPage: (typeof o.fetchPage === 'function') ? function (b, p) { return o.fetchPage(b, p, this); } : defaultFetchPage,
    flattenRecords: (typeof o.flatten === 'function') ? function (r) { return o.flatten(r, this); } : defaultFlatten,

    sheetConfigs: Array.isArray(o.sheetConfigs) && o.sheetConfigs.length
      ? o.sheetConfigs
      : [ ck_makeSingleSheetConfig_(o.sheetName, o.outputFields || [], o.uniqueKey) ]
  });
}