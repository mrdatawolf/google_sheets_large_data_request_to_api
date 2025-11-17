var CONFIG_TEST = (function () {
  var sheetName = 'TestSheet';
  var uniqueKey = 'SystemId';
  var outputFields = ['SystemId', 'Name', 'Email'];

  return ck_makeConfig_({
    sheetName: sheetName,
    uniqueKey: uniqueKey,
    apiUrl: 'https://mock.api/test',
    outputFields: outputFields,
    criteriaFields: [],

    defaults: { pageSize: 2, startPage: 1, format: 'json' },
    scheduleDaily: false,
    auditSheetName: 'test_audit',
    msBudget: 10000,

    // Unit-test stubbed fetch (runner expects {payload} or {records}).
    fetchPage: function (body, page) {
      var mock = JSON.stringify({ results: [] });
      return { payload: mock };
    },

    // Pass-through: { main: resultsArr }
    flatten: function (resultsArr) { return { main: resultsArr }; }
  });
})();

var CONFIG = (function () {
  var sheetName = 'Users';
  var uniqueKey = 'SystemId';
  var outputFields = [
    'SystemId','FirstName','LastName','Email','Age','ParentId','Gender',
    'BirthDate','Joined','Status','GuestVisits','DependentCount','Employer',
    'LastCheckInDate','MemberSince','EftPaymentMethod','HomeClub',
    'UCCType','DateCancelOn','CancellationReason','CanceledDate'
  ];
  var criteriaFields = {}; // empty object

  return ck_makeConfig_({
    sheetName: sheetName,
    uniqueKey: uniqueKey,
    apiUrl: 'https://api.partners.daxko.com/api/v1/reports/1',
    outputFields: outputFields,
    criteriaFields: criteriaFields,

    defaults: { pageSize: 50, startPage: 1, format: 'json' },
    scheduleDaily: true,
    auditSheetName: 'daxko_audit',

    // Users body uses pageNumber + fields; default builder already does that.
    // Custom fetch delegates to your shared fetcher:
    fetchPage: function (body, page, ctx) {
      return fetchDaxkoPagePost_(body, page, ctx || this);
    },

    // Pass-through: runner/parse handles CSV/JSON, we wrap as {main:[]}
    flatten: function (resultsArr) { return { main: resultsArr }; }
  });
})();
var CONFIG_TX = (function () {
  var sheetName = 'Transactions';
  var uniqueKey = 'uniqueID';
  var apiUrl = 'https://api.partners.daxko.com/api/v1/reports/transaction-search';

  var outputFields = [
    'uniqueID', 'invoice', 'date', 'memberName', 'total'
  ];

  return ck_makeConfig_({
    sheetName: sheetName,
    uniqueKey: uniqueKey,
    apiUrl: apiUrl,
    outputFields: outputFields,

    defaults: { pageSize: 100, startPage: 1, format: 'json' },
    scheduleDaily: true,
    auditSheetName: 'daxko_audit',

    // Functions are defined in transactions.gs
    buildBody: buildTxBody_,
    flatten: flattenTxInvoices_,
    fetchPage: fetchTxPage_
  });
})();

var CONFIG_UGDR = {
  apiUrl: 'https://api.partners.daxko.com/api/v1/reports/22',
  pageSize: 50,
  format: 'json',
  daxko: {
    initialBackoffMs: 1000,
    maxRetries: 3
  },
  runtime: {
    msBudget: 240000
  },
  audit: {
    sheetName: 'daxko_audit',
    writeLog: function (info) { appendAuditRow_(info, 'daxko_audit'); }
  },
  buildRequestBody: function(page) {
    return {
      "format": "json",
      "pageSize": "50",
      "pageNumber": String(page || 1),
      "criteriaFields": {}
    };
  },

  // Dummy sheetConfigs to satisfy validation (actual sheets are defined in flattenUgdr_)
  sheetConfigs: [
    {
      sheetName: 'UserGDR_Summary',
      fields: ['Metric', 'Value'],
      keyField: 'Metric'
    }
  ],

  // Custom functions are in userGroupDynamicReport.gs
  flattenRecords: flattenUgdr_,
  fetchPage: function(body, page, ctx) {
    return fetchUgdrOnce_(body, page, ctx || this);
  }
};

var CONFIG_UGSR = {
  apiUrl: 'https://api.partners.daxko.com/api/v1/reports/26',
  pageSize: 50,
  format: 'json',
  daxko: {
    initialBackoffMs: 1000,
    maxRetries: 3
  },
  runtime: {
    msBudget: 240000
  },
  audit: {
    sheetName: 'daxko_audit',
    writeLog: function (info) { appendAuditRow_(info, 'daxko_audit'); }
  },
  buildRequestBody: function(page) {
    return {
      "format": "json",
      "pageSize": "50",
      "pageNumber": String(page || 1),
      "criteriaFields": {}
    };
  },

  // Dummy sheetConfigs to satisfy validation (actual sheets are defined in flattenUgsr_)
  sheetConfigs: [
    {
      sheetName: 'UserGSR_Summary',
      fields: ['Metric', 'Value'],
      keyField: 'Metric'
    }
  ],

  // Custom functions are in userGroupStatisticsReport.gs
  flattenRecords: flattenUgsr_,
  fetchPage: function(body, page, ctx) {
    return fetchUgsrOnce_(body, page, ctx || this);
  }
};

var CONFIG_AGING = (function () {
  var sheetName = 'AccountingAging';
  var uniqueKey = 'SystemId';
  var outputFields = [
    'SystemId',
    'LastLogin',
    'HomeClub',
    'UserGroupName',
    '4'  // Numeric field from aging report
  ];

  return ck_makeConfig_({
    sheetName: sheetName,
    uniqueKey: uniqueKey,
    apiUrl: 'https://api.partners.daxko.com/api/v1/reports/5',
    outputFields: outputFields,
    criteriaFields: {},  // Populated dynamically in buildBody

    defaults: { pageSize: 50, startPage: 1, format: 'json' },
    scheduleDaily: true,
    auditSheetName: 'daxko_audit',

    // Custom buildBody to include aging criteriaFields
    buildBody: function(page, ctx) {
      // Get outputFields from closure or from context
      var fields = outputFields;
      if (!fields && ctx && ctx.request && ctx.request.outputFields) {
        fields = ctx.request.outputFields;
      }
      if (!fields) {
        fields = ['SystemId', 'LastLogin', 'HomeClub', 'UserGroupName', '4'];
      }

      return {
        "format": "json",
        "pageSize": "50",
        "pageNumber": String(page || 1),
        "outputFields": fields,
        "criteriaFields": {
          "aging": {
            "statement_period": getStatementPeriod_(),
            "combined": "individual",
            "transaction_type": "0"
          }
        }
      };
    },

    // Standard fetch delegates to shared fetcher
    fetchPage: function (body, page, ctx) {
      return fetchDaxkoPagePost_(body, page, ctx || this);
    },

    // Pass-through: runner/parse handles the data.results structure
    flatten: function (resultsArr) { return { main: resultsArr }; }
  });
})();

var CONFIG_DUES_SUMMARY = {
  apiUrl: 'https://api.partners.daxko.com/api/v1/reports/22',
  pageSize: 50,
  format: 'json',

  // User groups to track for dues summary
  userGroups: [
    1021,
    1026,
    1028,
    1031,
    1033,
    1036,
    1037,
    1040,
    1043,
    1054,
    1065,
    1072,
    1082,
    1089,
    1092,
    1095,
    1101,
    1102,
    1105,
    1113,
    1121,
    1122,
    1149,
    1166,
    1175,
    1187,
    1189,
    1201,
    1215,
    1236,
    2008,
    2009
    ],

  daxko: {
    initialBackoffMs: 1000,
    maxRetries: 3
  },
  runtime: {
    msBudget: 240000
  },
  audit: {
    sheetName: 'daxko_audit',
    writeLog: function (info) { appendAuditRow_(info, 'daxko_audit'); }
  },
  buildRequestBody: function(page) {
    return buildDuesSummaryBody_(page, this);
  },

  // Define the two sheets this report will populate
  sheetConfigs: [
    {
      sheetName: 'DuesSummary_Totals',
      fields: [
        'ReportMonth', 'Start Total', 'New', 'Canceled', 'Reactivate',
        'Changed To', 'Changed From', 'On Hold', 'Off Hold', 'Removed', 'End Total', 'Net'
      ],
      keyField: 'ReportMonth'
    },
    {
      sheetName: 'DuesSummary_Details',
      fields: [
        'UniqueKey', 'ReportMonth', 'User Group', 'User Group Billing Type',
        'Start Total', 'End Total', 'Net', 'New', 'Canceled', 'Inactive', 'Expired',
        'Changed To', 'Changed From', 'On Hold', 'Off Hold', 'Reactivate', 'Renewed'
      ],
      keyField: 'UniqueKey'
    }
  ],

  // Custom functions from duesSummary.gs
  flattenRecords: flattenDuesSummary_,
  fetchPage: function(body, page, ctx) {
    return fetchDuesSummaryOnce_(body, page, ctx || this);
  }
};