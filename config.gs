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