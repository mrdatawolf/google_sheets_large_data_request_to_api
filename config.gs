var CONFIG_TEST = (function () {
  var sheetName = 'TestSheet';
  var uniqueKey = 'SystemId';
  var outputFields = ['SystemId', 'Name', 'Email'];

  return ck_createConfig_({
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
    'LastCheckInDate','MemberSince','MemberName','EftPaymentMethod','HomeClub',
    'UBATitle','UbaBankName','UCCType'
  ];
  var criteriaFields = {}; // empty object

  return ck_createConfig_({
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
    'uniqueID', 'invoice', 'date', 'memberName', 'total',

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

var CONFIG_UGDR = (function () {
  var sheetDetails = 'UserGDR_Details';
  var sheetSummary = 'UserGDR_Summary';

  // Since the API doesn't support filtering, we define the fields here
  // to control what appears in the sheet.
  var detailFields = [
    'User Group', 'User Group Billing Type', 'Start Total', 'End Total', 'Net', 'New',
    'Canceled', 'Inactive', 'Expired', 'Changed To', 'Changed From', 'On Hold',
    'Off Hold', 'Reactivate', 'Renewed'
  ];

  // This report is unique; it doesn't use a paginated API, so we override fetchPage
  // to ensure it only runs once.
  function fetchUgdrOnce_(body, page, ctx) {
    if (page > 1) return { records: [] }; // Only fetch page 1
    var raw = fetchDaxkoPagePost_(body, page, ctx || this);
    var obj = ck_asObject_(raw);
    return { records: [obj] }; // Return the single object to be flattened
  }

  var sheetConfigs = [
    {
      sheetName: sheetSummary,
      fields: ['Metric', 'Value'],
      keyField: 'Metric',
      getRecords: function (flattened) { return flattened.summary; }
    },
    {
      sheetName: sheetDetails,
      fields: detailFields,
      keyField: 'User Group',
      getRecords: function (flattened) { return flattened.details; }
    }
  ];

  return ck_makeConfig_({
    sheetName: sheetSummary, // Primary sheet for state (though not paginated)
    uniqueKey: 'Metric',
    apiUrl: 'https://api.partners.daxko.com/api/v1/reports/22',
    outputFields: [], // Not used by API, but defined for consistency

    defaults: { pageSize: 1, startPage: 1, format: 'json' }, // Not paginated
    scheduleDaily: true,
    auditSheetName: 'daxko_audit',

    flatten: flattenUgdr_,
    fetchPage: fetchUgdrOnce_,
    sheetConfigs: sheetConfigs
  });
})();