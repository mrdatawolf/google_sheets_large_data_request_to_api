var CONFIG_TEST = (function () {
  var sheetName = 'TestSheet';
  var uniqueKey = 'SystemId';
  var apiUrl = 'https://mock.api/test';
  var outputFields = ['SystemId', 'Name', 'Email'];
  var criteriaFields = [];
  var defaultPageSize = 2;
  var defaultStartPage = 1;
  var defaultFormat = 'json';
  var stateKey = 'TEST_STATE';
  var stateRaw = PropertiesService.getScriptProperties().getProperty(stateKey);
  var state = stateRaw ? JSON.parse(stateRaw) : {};
  var pageSize = state.pageSize || defaultPageSize;
  var startPage = state.page || defaultStartPage;
  var format = state.format || defaultFormat;
  var request = {
    format: format,
    pageSize: pageSize,
    startPageNumber: startPage,
    outputFields: outputFields,
    criteriaFields: criteriaFields
  };

  return {
    apiUrl: apiUrl,
    format: format,
    pageSize: pageSize,
    startPage: startPage,
    uniqueKey: uniqueKey,
    scheduleDaily: false,
    sheetName: sheetName,
    stateKey: stateKey,
    request: request,
    buildRequestBody: function (page) {
      return {
        format: format,
        pageSize: String(pageSize),
        pageNumber: String(page),
        outputFields: outputFields,
        criteriaFields: criteriaFields
      };
    },
    // Raw-path (runner will JSON.parse)
    fetchPage: function (body, page) {
      var mock = JSON.stringify({ results: [] });
      return { payload: mock };
    },
    flattenRecords: function (resultsArr) { return { main: resultsArr }; },
    sheetConfigs: [
      {
        sheetName: sheetName,
        fields: outputFields,
        keyField: uniqueKey,
        applyFormats: function (sheet) {},
        getRecords: function (flattened) { return flattened.main; }
      }
    ],
    raw: { enabled: false, driveFolderPath: '', gzip: false, saveRawPayload: function () {} },
    resume: { getState: function () {}, setState: function () {}, resetState: function () {} },
    audit: {
      sheetName: 'test_audit',
      writeLog: function(info) { appendAuditRow_(info, 'test_audit'); }
    },
    digest: { sendEmail: function () {} },
    runtime: { msBudget: 10000 },
    scheduleContinuation: function () {},
    daxko: {
      initialBackoffMs: 1000,
      maxRetries: 3
    },

    RUN_FLAGS: {
      didRefresh: false,
      // parseMode: undefined, // let runner set to 'json'
      csvSanitized: false
    }
  };
})();

var CONFIG = (function () {
  var sheetName = 'Users';
  var uniqueKey = 'SystemId';
  var apiUrl = 'https://api.partners.daxko.com/api/v1/reports/1';
  var outputFields = [
    'SystemId', 'FirstName', 'LastName', 'Email', 'Age', 'ParentId', 'Gender',
    'BirthDate', 'Joined', 'Status', 'GuestVisits', 'DependentCount', 'Employer',
    'LastCheckInDate', 'MemberSince', 'MemberName', 'EftPaymentMethod', 'HomeClub',
    'UBATitle', 'UbaBankName', 'UCCType'
  ];
  var criteriaFields = {}; // empty object
  var defaultPageSize = 50;
  var defaultStartPage = 1;
  var defaultFormat = 'json';
  var stateKey = 'Users';
  var stateRaw = PropertiesService.getScriptProperties().getProperty(stateKey);
  var state = stateRaw ? JSON.parse(stateRaw) : {};
  var pageSize = state.pageSize || defaultPageSize;
  var startPage = state.page || defaultStartPage;
  var format = state.format || defaultFormat;
  var request = {
    format: format,
    pageSize: pageSize,
    startPageNumber: startPage,
    outputFields: outputFields,
    criteriaFields: criteriaFields
  };

  return {
    apiUrl: apiUrl,
    format: format,
    pageSize: pageSize,
    startPage: startPage,
    uniqueKey: uniqueKey,
    scheduleDaily: true,
    sheetName: sheetName,
    stateKey: stateKey,
    request: request,
    buildRequestBody: function (page) {
      return {
        format: format,
        pageSize: String(pageSize),
        pageNumber: String(page),
        outputFields: outputFields,
        criteriaFields: criteriaFields
      };
    },
    fetchPage: function (body, page) {
      return fetchDaxkoPagePost_(body, page, this); // pass the current config
    },
    flattenRecords: function (resultsArr) {
      return { main: resultsArr }; // assumes parsePayload_ will handle CSV
    },
    sheetConfigs: [
      {
        sheetName: sheetName,
        fields: outputFields,
        keyField: uniqueKey,
        applyFormats: function (sheet) {}, // optional formatting
        getRecords: function (flattened) { return flattened.main; }
      }
    ],
    raw: { enabled: false, driveFolderPath: '', gzip: false, saveRawPayload: function () {} },
    resume: {
      getState: function () {},
      setState: function () {},
      resetState: function () {}
    },
    audit: {
      sheetName: 'daxko_audit',
      writeLog: function(info) { appendAuditRow_(info, 'daxko_audit'); }
    },
    digest: { sendEmail: function () {} },
    runtime: { msBudget: 300000 },
    scheduleContinuation: function () {},
    daxko: {
      initialBackoffMs: 1000,
      maxRetries: 3
    },
    RUN_FLAGS: {
      didRefresh: false,
      csvSanitized: false // runner will set parseMode to 'csv'
    }
  };
})();

var CONFIG_TX = (function () {
  // ---- Sheets & Keys ----
  var sheetInvoices = 'Transactions';
  var sheetCharges  = 'TransactionCharges';
  var uniqueKeyInvoices = 'uniqueID'; // invoice
  var uniqueKeyCharges  = 'uniqueID'; // invoice:chargeId

  // ---- API ----
  var apiUrl = 'https://api.partners.daxko.com/api/v1/reports/transaction-search';
  var defaultFormat = 'json';
  var defaultPageSize = 100;
  var defaultStartPage = 1;

  // Keep it simple: default dateFrom = Jan 1 this year
  function getDefaultDateFrom_() {
    var tz = Session.getScriptTimeZone();
    var now = new Date();
    var jan1 = new Date(now.getFullYear(), 0, 1);
    return Utilities.formatDate(jan1, tz, 'yyyy-MM-dd');
  }

  // No stateKey—runner/state will use sheetName, as in your working CONFIG.
  var dateFrom = getDefaultDateFrom_();

  var invoiceFields = [
    'uniqueID', 'invoice', 'date', 'memberName', 'total',
    'enterType', 'creditCard', 'nameOnCard', 'orderNumber',
    'referenceNumber', 'approvalCode'
  ];

  var chargeFields = [
    'uniqueID', 'invoice', 'date', 'memberName',
    'chargeId', 'description', 'amount'
  ];

  // Mirror your existing request snapshot shape for logging
  var request = {
    format: defaultFormat,
    dateFrom: dateFrom,
    pageSize: String(defaultPageSize),
    startPageNumber: String(defaultStartPage)
  };

  return {
    apiUrl: apiUrl,
    format: defaultFormat,
    pageSize: defaultPageSize,
    startPage: defaultStartPage,
    uniqueKey: uniqueKeyInvoices,
    scheduleDaily: true,
    sheetName: sheetInvoices, // runner uses this for state
    request: request,

    buildRequestBody: function (page) {
      var p = String(page);
      var ps = String(this.pageSize);
      return {
        format: this.format,
        dateFrom: dateFrom,  // e.g., "2025-01-01"
        page: p,             // TX endpoint expects "page"
        pageNumber: p,       // some helpers expect "pageNumber"
        pageSize: ps
      };
    },

    fetchPage: function (body, page) {
      // Normalize types to strings (like Users config)
      body = body || this.buildRequestBody(page);
      body.page = String(body.page != null ? body.page : page);
      body.pageNumber = String(body.pageNumber != null ? body.pageNumber : body.page);
      body.pageSize = String(body.pageSize != null ? body.pageSize : this.pageSize);

      var resp = fetchDaxkoPagePost_(body, page, this);

      // Normalize to what runReport understands
      if (resp && typeof resp.payload === 'string') return resp;
      if (resp && Array.isArray(resp.records)) return resp;
      if (resp && typeof resp === 'object') return { payload: JSON.stringify(resp) };
      if (typeof resp === 'string') return { payload: resp };
      return { payload: JSON.stringify({}) };
    },

    flattenRecords: function (resultsArr) {
      // runReport will now pass an array (after we fix data.results in parser)
      var invoices = [];
      var charges = [];

      for (var i = 0; i < resultsArr.length; i++) {
        var r = resultsArr[i] || {};
        var info = r.info || {};

        invoices.push({
          uniqueID: r.invoice || '',
          invoice: r.invoice || '',
          date: r.date || '',
          memberName: r.memberName || '',
          total: r.total == null ? '' : r.total,
          enterType: info.enterType || '',
          creditCard: info.creditCard || '',
          nameOnCard: info.nameOnCard || '',
          orderNumber: info.orderNumber || '',
          referenceNumber: info.referenceNumber || '',
          approvalCode: info.approvalCode == null ? '' : info.approvalCode
        });

        var lines = r.charges || [];
        for (var j = 0; j < lines.length; j++) {
          var c = lines[j] || {};
          charges.push({
            uniqueID: (r.invoice || '') + ':' + String(c.id == null ? '' : c.id),
            invoice: r.invoice || '',
            date: r.date || '',
            memberName: r.memberName || '',
            chargeId: c.id == null ? '' : c.id,
            description: c.description || '',
            amount: c.amount == null ? '' : c.amount
          });
        }
      }

      return { invoices: invoices, charges: charges };
    },

    sheetConfigs: [
      {
        sheetName: sheetInvoices,
        fields: invoiceFields,
        keyField: uniqueKeyInvoices,
        applyFormats: function (sheet) {
          try {
            var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
            var totalCol = headers.indexOf('total') + 1;
            if (totalCol > 0) sheet.getRange(2, totalCol, Math.max(0, sheet.getLastRow() - 1), 1)
                                   .setNumberFormat('$#,##0.00');
          } catch (e) {}
        },
        getRecords: function (flattened) { return flattened.invoices; }
      },
      {
        sheetName: sheetCharges,
        fields: chargeFields,
        keyField: uniqueKeyCharges,
        applyFormats: function (sheet) {
          try {
            var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
            var amtCol = headers.indexOf('amount') + 1;
            if (amtCol > 0) sheet.getRange(2, amtCol, Math.max(0, sheet.getLastRow() - 1), 1)
                                   .setNumberFormat('$#,##0.00');
          } catch (e) {}
        },
        getRecords: function (flattened) { return flattened.charges; }
      }
    ],

    raw: { enabled: false, driveFolderPath: '', gzip: false, saveRawPayload: function () {} },

    resume: {
      // Keep no-ops—your runner calls these safely
      getState: function () {},
      setState: function () {},
      resetState: function () {}
    },

    audit: {
      sheetName: 'daxko_audit',
      writeLog: function(info) { appendAuditRow_(info, 'daxko_audit'); }
    },
    digest: { sendEmail: function () {} },
    runtime: { msBudget: 300000 },
    scheduleContinuation: function () {},

    daxko: { initialBackoffMs: 1000, maxRetries: 3 },

    RUN_FLAGS: {
      didRefresh: false,
      csvSanitized: false // runner will set parseMode to 'json'
    }
  };
})();