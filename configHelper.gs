/** =========================
 * config_helpers.gs
 * Small helpers to remove CONFIG boilerplate
 * ========================= */

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

/** Defaults that nearly every CONFIG repeats. */
function ck_defaults_(opts) {
  var auditSheet = (opts && opts.auditSheetName) || 'daxko_audit';
  var msBudget = (opts && opts.msBudget) || 300000;

  return {
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
}

/**
 * Factory – assemble a CONFIG with shared defaults + unique overrides.
 * @param {object} o
 *  - sheetName, uniqueKey, apiUrl
 *  - outputFields, criteriaFields (optional)
 *  - defaults: { pageSize, startPage, format }
 *  - scheduleDaily (bool)
 *  - auditSheetName (optional)
 *  - buildBody(page, ctx) => {}   (optional override)
 *  - fetchPage(body, page, ctx)   (optional override)
 *  - flatten(resultsArr, ctx)     (optional override)
 *  - applyFormats(sheet)          (optional)
 */
function ck_createConfig_(o) {
  if (!o || !o.sheetName || !o.uniqueKey || !o.apiUrl) {
    throw new Error('ck_createConfig_: sheetName, uniqueKey, apiUrl are required');
  }

  // Resolve state-aware values.
  var defaults = {
    pageSize: o.defaults && o.defaults.pageSize != null ? o.defaults.pageSize : 50,
    startPage: o.defaults && o.defaults.startPage != null ? o.defaults.startPage : 1,
    format:   o.defaults && o.defaults.format     != null ? o.defaults.format     : 'json'
  };
  var st = ck_getState_(o.sheetName, defaults);
  var format = st.format, pageSize = st.pageSize, startPage = st.startPage;

  // Request snapshot for logging/inspection (kept like your originals).
  var request = ck_buildRequestSnapshot_(
    format,
    pageSize,
    startPage,
    o.outputFields,
    o.criteriaFields
  );

  // Build body (default Users-style: pageNumber + strings, include fields).
  function defaultBuildBody_(page) {
    var b = { format: format, pageSize: String(pageSize), pageNumber: String(page) };
    if (o.outputFields != null) b.outputFields = o.outputFields;
    if (o.criteriaFields != null) b.criteriaFields = o.criteriaFields;
    return b;
  }

  // Default fetcher: POST via your shared helper.
  function defaultFetchPage_(body, page, ctx) {
    return fetchDaxkoPagePost_(body, page, ctx || this);
  }

  // Default flattener: pass-through (runner gives us array; we wrap { main: [] }).
  function defaultFlatten_(resultsArr /*, ctx */) {
    return { main: resultsArr };
  }

  // Sheet config (single sheet pattern).
  var sheetCfg = ck_makeSingleSheetConfig_(
    o.sheetName,
    o.outputFields || [],
    o.uniqueKey,
    o.applyFormats,
    null // default getRecords
  );

  // Merge defaults (raw/resume/audit/.../RUN_FLAGS)
  var blocks = ck_defaults_({ auditSheetName: o.auditSheetName, msBudget: o.msBudget });

  // Assemble CONFIG
  return ck_merge_(blocks, {
    apiUrl: o.apiUrl,
    format: format,
    pageSize: pageSize,
    startPage: startPage,
    uniqueKey: o.uniqueKey,
    scheduleDaily: !!o.scheduleDaily,
    sheetName: o.sheetName,
    request: request,

    buildRequestBody: function(page) {
      var fn = (typeof o.buildBody === 'function') ? o.buildBody : defaultBuildBody_;
      return fn.call(this, page, this);
    },

    fetchPage: function(body, page) {
      var fn = (typeof o.fetchPage === 'function') ? o.fetchPage : defaultFetchPage_;
      return fn.call(this, body, page, this);
    },

    flattenRecords: function(resultsArr) {
      var fn = (typeof o.flatten === 'function') ? o.flatten : defaultFlatten_;
      return fn.call(this, resultsArr, this);
    },

    sheetConfigs: [sheetCfg]
  });
}
/** -------------------------
 * config_helpers.gs
 * Small helpers to remove CONFIG boilerplate, keeping per-report control.
 * ------------------------- */

/** Shallow merge (right wins). */
function ck_merge_(a, b) {
  var o = {}; for (var k in a) if (a.hasOwnProperty(k)) o[k] = a[k];
  for (var k2 in b) if (b.hasOwnProperty(k2)) o[k2] = b[k2];
  return o;
}

/** Load state tied to sheetName; fall back to defaults. */
function ck_getState_(sheetName, defaults) {
  var raw = PropertiesService.getScriptProperties().getProperty(sheetName);
  var st = raw ? JSON.parse(raw) : {};
  return {
    format: st.format || defaults.format,
    pageSize: st.pageSize || defaults.pageSize,
    startPage: st.page || defaults.startPage
  };
}

/** Optional: build the “request” snapshot you expose for logging. */
function ck_requestSnapshot_(format, pageSize, startPageNumber, outputFields, criteriaFields) {
  var req = { format: format, pageSize: pageSize, startPageNumber: startPageNumber };
  if (outputFields != null) req.outputFields = outputFields;
  if (criteriaFields != null) req.criteriaFields = criteriaFields;
  return req;
}

/** Body builder factory — keeps config concise but fully flexible. */
function ck_bodyBuilder_(options) {
  // options: { base:{}, pageField:'pageNumber'|'page', pageSizeField:'pageSize', stringify:['pageNumber','pageSize',...], extra:(ctx)=>({}) }
  var base = options.base || {};
  var pageField = options.pageField || 'pageNumber';
  var pageSizeField = options.pageSizeField || 'pageSize';
  var stringify = options.stringify || [pageField, pageSizeField];
  var extra = typeof options.extra === 'function' ? options.extra : function(){ return {}; };
  return function build(page, ctx) {
    var b = ck_merge_(base, extra(ctx));
    b[pageField] = page;
    b[pageSizeField] = ctx.pageSize;
    // stringify requested fields for maximum compatibility with shared code
    for (var i = 0; i < stringify.length; i++) {
      var key = stringify[i];
      if (b[key] != null) b[key] = String(b[key]);
    }
    return b;
  };
}

/** Parse function factory: pick an array by path (e.g., 'data.results'). */
function ck_parsePath_(path) {
  var parts = (path || '').split('.').filter(function(s){return s;});
  return function pickArray(obj) {
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (!cur || typeof cur !== 'object') return [];
      cur = cur[parts[i]];
    }
    return Array.isArray(cur) ? cur : [];
  };
}

/** Normalize various fetcher returns to an object. */
function ck_asObject_(resp) {
  if (!resp) return {};
  if (typeof resp === 'string') {
    try { return JSON.parse(resp); } catch (_) { return {}; }
  }
  if (typeof resp.payload === 'string') {
    try { return JSON.parse(resp.payload); } catch (_) { return {}; }
  }
  if (typeof resp === 'object') return resp;
  return {};
}

/** Fetcher that POSTs via your shared helper, parses, and returns {records:[...]} */
function ck_fetcher_post_records_(parseFn) {
  return function fetchPage(body, page, ctx) {
    var raw = fetchDaxkoPagePost_(body, page, ctx || this);
    var obj = ck_asObject_(raw);
    var arr = (typeof parseFn === 'function') ? parseFn(obj) : [];
    return { records: arr };
  };
}

/** Fetcher that POSTs and returns {payload:string} unchanged (use runner’s parser). */
function ck_fetcher_post_payload_() {
  return function fetchPage(body, page, ctx) {
    var resp = fetchDaxkoPagePost_(body, page, ctx || this);
    if (resp && typeof resp.payload === 'string') return resp;
    if (typeof resp === 'string') return { payload: resp };
    return { payload: JSON.stringify(resp || {}) };
  };
}

/** One-sheet sheetConfig helper. */
function ck_singleSheet_(sheetName, fields, keyField, applyFormats, getRecords) {
  return {
    sheetName: sheetName,
    fields: fields,
    keyField: keyField,
    applyFormats: typeof applyFormats === 'function' ? applyFormats : function(){},
    getRecords: typeof getRecords === 'function' ? getRecords : function (flattened) { return flattened.main; }
  };
}

/** Common blocks you repeat. */
function ck_commonBlocks_(auditSheetName, msBudget) {
  return {
    raw: { enabled: false, driveFolderPath: '', gzip: false, saveRawPayload: function () {} },
    resume: { getState: function(){}, setState: function(){}, resetState: function(){} },
    audit: { sheetName: auditSheetName || 'daxko_audit',
             writeLog: function (info) { appendAuditRow_(info, auditSheetName || 'daxko_audit'); } },
    digest: { sendEmail: function(){} },
    runtime: { msBudget: msBudget || 300000 },
    scheduleContinuation: function(){},
    daxko: { initialBackoffMs: 1000, maxRetries: 3 },
    RUN_FLAGS: { didRefresh: false, csvSanitized: false }
  };
}

/** Core config composer: minimal boilerplate, full per-report control. */
function ck_makeConfig_(opts) {
  var sheetName = opts.sheetName, uniqueKey = opts.uniqueKey, apiUrl = opts.apiUrl;
  var defaults = { pageSize: opts.defaultPageSize || 50, startPage: opts.defaultStartPage || 1, format: opts.defaultFormat || 'json' };
  var st = ck_getState_(sheetName, defaults);

  var cfg = ck_merge_(ck_commonBlocks_(opts.auditSheetName, opts.msBudget), {
    apiUrl: apiUrl,
    format: st.format,
    pageSize: st.pageSize,
    startPage: st.startPage,
    uniqueKey: uniqueKey,
    scheduleDaily: !!opts.scheduleDaily,
    sheetName: sheetName,
    request: ck_requestSnapshot_(st.format, st.pageSize, st.startPage, opts.outputFields, opts.criteriaFields),

    buildRequestBody: (typeof opts.buildBody === 'function')
      ? function (page) { return opts.buildBody(page, this); }
      : function (page) { return { format: this.format, pageSize: String(this.pageSize), pageNumber: String(page) }; },

    fetchPage: (typeof opts.fetchPage === 'function')
      ? function (body, page) { return opts.fetchPage(body, page, this); }
      : ck_fetcher_post_payload_(),

    flattenRecords: (typeof opts.flatten === 'function')
      ? function (resultsArr) { return opts.flatten(resultsArr, this); }
      : function (resultsArr) { return { main: resultsArr }; },

    sheetConfigs: Array.isArray(opts.sheetConfigs) && opts.sheetConfigs.length
      ? opts.sheetConfigs
      : [ ck_singleSheet_(sheetName, opts.outputFields || [], uniqueKey) ]
  });

  return cfg;
}