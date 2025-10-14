/**
 * Global configuration + run flags.
 * NOTE: Keep only literals/functions here (no calls to helpers at load time).
 */

var CONFIG = {
  runtime: {
    // stop ~70–90 seconds before the hard limit so we can save state and schedule a continuation
    msBudget: 290000  // ~4 min 50 sec; adjust up/down as you like
  },
  daxko: {
    url: 'https://api.partners.daxko.com/api/v1/reports/1',
    timeoutMs: 60000,
    maxRetries: 4,
    initialBackoffMs: 1000
  },

  request: {
    format: 'json',             // 'json' | 'csv'
    pageSize: 250,
    startPageNumber: 1,
    outputFields: [
      "SystemId","FirstName","LastName","Email","Age","ParentId","Gender","BirthDate","Joined","Status",
      "GuestVisits","DependentCount","Employer","LastCheckInDate","MemberSince","MemberName","EftPaymentMethod",
      "HomeClub","UBATitle","UbaBankName","UCCType"
    ],
    criteriaFields: {
    }
  },

  // Main data sheet
  sheetName: 'daxko_report_1',

  // Audit sheet
  audit: { sheetName: 'daxko_report_1_audit' },

  // Raw payload snapshots (Drive)
  raw: {
    enabled: true,
    driveFolderPath: 'daxko-raw/report1',
    gzip: true,
    retentionDays: 365
  },

  // Scheduling
  scheduleDaily: true,

  // Resume state key
  stateKey: 'DAXKO_REPORT1_STATE',

  // Type casting config (use arrays, not Set, for max compatibility)
  typesNumericFields: ['Age', 'GuestVisits', 'DependentCount'],
  typesDateFields:    ['BirthDate', 'Joined', 'MemberSince', 'LastCheckInDate'],

  // Column formats
  formats: {
    numeric: '0',
    date: 'm/d/yyyy'
  },
  // --- Email notifications ---
  notifications: {
    enabled: true,                    // master switch
    to: [],                           // optional hard-coded recipients; otherwise use property DIGEST_TO
    subjectPrefix: '[Daxko Report1]', // used at the beginning of email subjects
    sendOnSuccess: true,              // send even when status=SUCCESS
    sendOnError: true                 // send when status=ERROR
  }
};

// Per-run flags (for audit)
var RUN_FLAGS = {
  didRefresh: false,  // set true when we perform a token refresh
  parseMode: '',      // 'json' | 'csv'
  csvSanitized: false // true if we had to sanitize CSV embedded newlines
};
/** Transaction Search report configuration */
var CONFIG_TX = {
  daxko: {
    url: 'https://api.partners.daxko.com/api/v1/reports/transaction-search',
    timeoutMs: 60000,
    maxRetries: 4,
    initialBackoffMs: 1000
  },
  request: {
    format: 'json',          // API returns JSON; keep this
    pageSize: 100,           // your Postman example
    startPage: 1,
    dateFrom: '2025-01-01' // Set your desired dateFrom (or promote to a Script Property if you prefer)
  },
  // Where rows go
  sheetName: 'daxko_transactions',
  chargesSheetName: 'daxko_transactions_charges',
  // Audit sheet
  audit: { sheetName: 'daxko_transactions_audit' },
  // Raw snapshots
  raw: {
    enabled: true,
    driveFolderPath: 'daxko-raw/transaction-search',
    gzip: true,
    retentionDays: 90
  },
  // Resume key
  stateKey: 'DAXKO_TX_STATE',
  // Upsert unique key (adjust after first run if your payload uses a different name)
  uniqueKey: 'invoice'
};

// Optional: a different email subject prefix for TX digests
if (!CONFIG.notifications) CONFIG.notifications = {};
CONFIG.notifications.txSubjectPrefix = '[Daxko TX]';