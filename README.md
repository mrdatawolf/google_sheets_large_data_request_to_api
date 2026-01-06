<div align="center">
  <img src="logo.svg" alt="logo" width="150">
</div>

# Google Sheets Large Data Request to API

A production-ready Google Apps Script framework for reliably importing large datasets from paginated REST APIs into Google Sheets. Built to overcome Google Apps Script's 6-minute execution time limit through intelligent state management and resumable execution.

## Table of Contents

- [Overview](#overview)
- [The Problem This Solves](#the-problem-this-solves)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Adding New Reports](#adding-new-reports)
- [Monitoring & Troubleshooting](#monitoring--troubleshooting)
- [Project Structure](#project-structure)
- [Advanced Topics](#advanced-topics)

## Overview

This framework automates the synchronization of data from paginated REST APIs (specifically Daxko Partners API, but adaptable to others) into Google Sheets. It handles authentication, pagination, error recovery, and data updates while working within the constraints of Google Apps Script's execution environment.

**Current Implementation:** Successfully imports user data and transaction data from the Daxko Partners API with automatic daily updates.

## The Problem This Solves

When importing large datasets into Google Sheets from APIs, you face several challenges:

1. **Execution Time Limits:** Google Apps Script has a 6-minute maximum execution time
2. **Pagination:** APIs serve data in pages (e.g., 50-100 records per page); large datasets may have hundreds or thousands of pages
3. **Authentication:** OAuth tokens expire and need refreshing
4. **Data Consistency:** You need to update existing records without creating duplicates
5. **Error Recovery:** Network errors and rate limits must be handled gracefully
6. **Monitoring:** You need visibility into import success/failure

**This framework solves all of these problems** by implementing:
- State-based resumption (picks up where it left off across multiple runs)
- Automatic token refresh
- Intelligent upsert operations (update existing, append new)
- Exponential backoff retry logic
- Comprehensive audit logging

## Key Features

### Core Capabilities

- **Resumable Execution:** Automatically saves progress after each page. If execution times out, the next run picks up where it left off.
- **Smart Upsert:** Updates existing records (by unique key) and appends new ones—no duplicates, no manual reconciliation.
- **OAuth 2.0 Management:** Handles both `refresh_token` and `client_credentials` flows with automatic token refresh.
- **Retry Logic:** Exponential backoff for transient errors (429 rate limits, 5xx server errors).
- **Configuration-Driven:** Add new reports by creating configuration objects—no need to modify core logic.
- **Audit Trail:** Every execution logged with timestamp, status, records processed, and performance metrics.
- **Email Notifications:** Optional digest emails summarizing each run's results.

### Production Features

- **Time Budget Management:** Monitors execution time and gracefully exits before hitting hard timeout
- **Automatic Continuation:** Schedules follow-up runs when more data remains
- **Flexible Data Transformation:** Custom flattening functions for complex nested API responses
- **Multiple Sheet Support:** One API response can populate multiple sheets
- **Type Handling:** Automatic date parsing and numeric conversion

## Architecture

### Design Philosophy

The system is built on three core principles:

1. **Stateless Execution + Persistent State:** Each run is independent, but progress is saved in ScriptProperties
2. **Configuration Over Code:** Report-specific logic is isolated in config objects
3. **Fail-Safe:** Errors are logged but don't corrupt state; next run can retry

### Module Overview

```
main.gs              → Entry points and trigger setup
reportRunner.gs      → Core execution engine (pagination loop)
config.gs            → Report configurations
configHelper.gs      → Configuration factory
fetch.gs             → HTTP requests with retry logic
auth.gs              → OAuth token management
sheet.gs             → Google Sheets operations (upsert)
state.gs             → State persistence (ScriptProperties)
audit.gs             → Execution logging
utils.gs             → Helper functions
```

**Report-Specific Modules:**
- `transactions.gs` - Custom logic for transactions report
- `userGroupDynamicReport.gs` - User group dynamic report
- `userGroupStatisticsReport.gs` - User group statistics report
- `accountingAgingReport.gs` - Accounting aging report with statement period management

## How It Works

### Execution Flow

```
1. Trigger fires (scheduled or manual)
   ↓
2. Load configuration + saved state
   ↓
3. Authenticate (refresh token if needed)
   ↓
4. Pagination loop:
   - Check time budget
   - Fetch next page from API
   - Parse JSON response
   - Accumulate results
   - Save state (current page)
   - Break if no more data or time running out
   ↓
5. Transform data (flatten nested structures)
   ↓
6. Upsert to Google Sheet:
   - Build map of existing record IDs
   - Update existing rows
   - Append new rows
   ↓
7. Cleanup:
   - Clear state (if complete) or save final state
   - Log audit entry
   - Send notification (if configured)
   - Schedule continuation (if needed)
```

### State-Based Resumption

The key innovation that handles unlimited data sizes:

```javascript
// Before execution
state = {page: 15, pageSize: 50, format: 'json'}  // Resume from page 15

// After execution
- If more pages remain: state = {page: 87, ...}  // Save progress
- If complete: state = null                       // Clear state
```

This means a 1 million record dataset is processed across multiple 4-minute runs, automatically resuming until complete.

### Upsert Logic

Instead of clearing and rewriting:

```
1. Read unique key column from sheet (e.g., SystemId)
2. Build map: {id → row_number}
3. For each new record:
   - If ID exists: update that row
   - If ID is new: append to end
```

**Result:** Incremental updates, no duplicates, handles data changes gracefully.

## Getting Started

### Prerequisites

- A Google account with access to Google Sheets and Apps Script
- API credentials (for Daxko Partners API or your target API)
- OAuth 2.0 tokens (client ID, client secret, refresh token or client credentials)

### Initial Setup

#### 1. Create Apps Script Project

1. Open your Google Sheet
2. Go to **Extensions > Apps Script**
3. Copy all `.gs` files from this repository into the script editor

#### 2. Configure Script Properties

Go to **Project Settings > Script Properties** and add:

**Required for Daxko API:**
```
DAXKO_TOKEN_URL       = https://api.partners.daxko.com/oauth2/token
DAXKO_CLIENT_ID       = your_client_id
DAXKO_REFRESH_TOKEN   = your_refresh_token
```

**Alternative (Client Credentials flow):**
```
DAXKO_TOKEN_URL       = https://api.partners.daxko.com/oauth2/token
DAXKO_CLIENT_ID       = your_client_id
DAXKO_CLIENT_SECRET   = your_client_secret
DAXKO_SCOPE          = your_scope
```

**Optional:**
```
DIGEST_TO            = email1@example.com,email2@example.com
```

#### 3. Bootstrap Authentication

Run this function once to get an initial access token:

```javascript
// In Apps Script editor, run:
BootstrapDaxkoTokens()
```

Check the execution log to confirm success.

#### 4. Test a Report Manually

Before setting up automation, test manually:

```javascript
// In Apps Script editor, run:
runUsersReport()
```

Check your sheet for the "Users" tab with imported data.

#### 5. Set Up Automated Triggers

Once testing succeeds, enable daily automation:

```javascript
// In Apps Script editor, run:
setupAll()
```

This creates time-based triggers for all configured reports. View triggers in **Apps Script > Triggers**.

### Running the Accounting Aging Report

The Accounting Aging Report (`CONFIG_AGING`) has special features for managing the statement period:

#### Run Manually (Default - Previous Month)
```javascript
// Runs with automatic previous month period (e.g., if today is 2025-11-11, uses 2025-10)
runAccountingAgingReport()
```

#### Set Custom Statement Period
```javascript
// Set a specific statement period
setStatementPeriod_("2025-06")

// Now run the report with the custom period
runAccountingAgingReport()

// Clear the custom period to return to automatic mode
clearStatementPeriod_()
```

#### Set Up Daily Automation
```javascript
// Creates daily trigger using automatic previous month
setupAccountingAgingReport()
```

**Note:** The report will be imported to a sheet named "AccountingAging" with these fields:
- SystemId
- LastLogin
- HomeClub
- UserGroupName
- Field "4" (numeric aging data)

### Running the Schedule Events Report

The Schedule Events Report (`CONFIG_SCHEDULE_EVENTS`) fetches upcoming scheduled events and **replaces** all sheet data with fresh data on each run (unlike other reports that use upsert).

#### Configure Number of Days
```javascript
// Set how many days forward to fetch events (default: 7 days)
setScheduleEventsDays_(14)  // Fetch 14 days of events
```

The number of days is stored in ScriptProperties as `SCHEDULE_EVENTS_DAYS`.

#### Run Manually
```javascript
// Fetches events starting from today for the configured number of days
runScheduleEventsReport()
```

#### Set Up Daily Automation
```javascript
// Creates daily trigger at 6 AM
setupScheduleEventsReport()
```

**Important Differences:**
- **Data Replacement:** Unlike other reports, this clears all existing data and writes fresh data on each run
- **GET Request:** Uses HTTP GET with query parameters instead of POST with body
- **Dynamic Date:** Always uses the current date as the start date
- **No Pagination:** Fetches all events in a single request

**Note:** The report will be imported to a sheet named "ScheduledEvents" with these fields:
- EventId, EventName, EventType
- ComponentId, ComponentName
- SessionId, SessionStatus, CourtCaption
- Staff, Rooms, Resources, Location
- ParticipantCount
- Date, StartTime, EndTime
- SetupTimeIncluded, CleanUpTimeIncluded
- Notes, CanWaiveCancellationFee

## Configuration

### Report Configuration Structure

Reports are defined in `config.gs` using the `ck_makeConfig_()` helper:

```javascript
var CONFIG = (function () {
  var sheetName = 'Users';
  var uniqueKey = 'SystemId';
  var outputFields = ['SystemId', 'FirstName', 'LastName', 'Email', ...];
  var criteriaFields = {};

  return ck_makeConfig_({
    sheetName: sheetName,
    uniqueKey: uniqueKey,
    apiUrl: 'https://api.partners.daxko.com/api/v1/reports/1',
    outputFields: outputFields,
    criteriaFields: criteriaFields,

    defaults: { pageSize: 50, startPage: 1, format: 'json' },
    scheduleDaily: true,
    auditSheetName: 'daxko_audit',

    fetchPage: function (body, page, ctx) {
      return fetchDaxkoPagePost_(body, page, ctx || this);
    },

    flatten: function (resultsArr) {
      return { main: resultsArr };
    }
  });
})();
```

### Configuration Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `sheetName` | Yes | Target sheet name in Google Sheets |
| `uniqueKey` | Yes | Field name used to identify existing records (for upsert) |
| `apiUrl` | Yes | API endpoint URL |
| `outputFields` | Yes | Array of field names to extract from API response |
| `criteriaFields` | No | Object with API filter parameters |
| `pageSize` | No | Records per page (default: 50) |
| `format` | No | 'json' (default; CSV not yet implemented) |
| `scheduleDaily` | No | Whether to set up daily trigger |
| `auditSheetName` | No | Name of audit log sheet (default: 'daxko_audit') |
| `buildBody` | No | Custom function to build request body |
| `fetchPage` | Yes | Function to make API request |
| `flatten` | Yes | Function to transform API response into sheet-ready format |

## Adding New Reports

To add a new report, follow these steps:

### 1. Create Configuration Object

In `config.gs`, add a new configuration:

```javascript
var CONFIG_MY_REPORT = (function () {
  var sheetName = 'MyReport';
  var uniqueKey = 'id';
  var outputFields = ['id', 'name', 'value', 'date'];

  return ck_makeConfig_({
    sheetName: sheetName,
    uniqueKey: uniqueKey,
    apiUrl: 'https://api.example.com/reports/my-report',
    outputFields: outputFields,
    criteriaFields: {},

    defaults: { pageSize: 100, startPage: 1, format: 'json' },
    scheduleDaily: true,
    auditSheetName: 'daxko_audit',

    fetchPage: function (body, page, ctx) {
      return fetchDaxkoPagePost_(body, page, ctx || this);
    },

    flatten: function (resultsArr) {
      return { main: resultsArr };
    }
  });
})();
```

### 2. Create Entry Point Functions

In `main.gs`, add runner and setup functions:

```javascript
function runMyReport() {
  runReport(CONFIG_MY_REPORT);
}

function myReportSetup() {
  setupReport(CONFIG_MY_REPORT, 'runMyReport');
}
```

### 3. Add to Setup Functions

Update `setupAll()` and `runAllReports()` in `main.gs`:

```javascript
function setupAll() {
  usersReportSetup();
  transactionsReportSetup();
  myReportSetup();  // Add this line
  Logger.log('All daily triggers installed.');
}

function runAllReports() {
  runUsersReport();
  runTransactionsReport();
  runMyReport();  // Add this line
}
```

### 4. Test and Deploy

1. Run `runMyReport()` manually to test
2. Check the audit sheet for execution logs
3. Run `myReportSetup()` to create the daily trigger

## Monitoring & Troubleshooting

### Audit Sheet

Every execution creates an audit log entry in the `daxko_audit` sheet:

| Column | Description |
|--------|-------------|
| Timestamp | When execution started |
| Status | SUCCESS or ERROR |
| Pages Fetched | Number of pages retrieved |
| Records Fetched | Total records from API |
| Appended | New rows added |
| Updated | Existing rows updated |
| Duration (ms) | Execution time |
| Format | json or csv |
| Page Size | Records per page |
| Token Refreshed | Whether OAuth token was refreshed |
| Error Message | Details if status = ERROR |

### Common Issues

#### Execution Timeout

**Symptom:** Script stops before completing all pages

**Solution:** This is normal! The system automatically schedules a continuation. Check the audit sheet—you'll see multiple runs completing the full import.

#### Authentication Errors (401/403)

**Symptom:** "Unauthorized" or "Forbidden" errors

**Solutions:**
1. Check Script Properties have correct credentials
2. Run `BootstrapDaxkoTokens()` again
3. Verify refresh token hasn't expired (some expire after 90 days)
4. Check API permissions/scope

#### Duplicate Records

**Symptom:** Same record appears multiple times

**Solutions:**
1. Verify `uniqueKey` in config matches the API's unique identifier
2. Check that the API field actually contains unique values
3. Review audit sheet to see if upsert logic is working (should show both "Updated" and "Appended" counts)

#### Rate Limiting (429 Errors)

**Symptom:** "Too Many Requests" errors

**Solution:** The retry logic should handle this automatically. If persistent:
1. Reduce `pageSize` in config (e.g., from 100 to 50)
2. Check audit sheet for retry patterns
3. Contact API provider about rate limits

#### Missing Data Fields

**Symptom:** Some columns in sheet are empty

**Solutions:**
1. Check that field names in `outputFields` exactly match API response
2. Review a raw API response to verify field names
3. Use `DebugAuthOnce()` function in `main.gs` to inspect API response

### Manual State Management

If you need to manually control execution state:

```javascript
// Force resume from specific page
forceResumePage_('Users', 100);  // Resume Users report from page 100

// Reset state (start from beginning)
resetResumeState_('Users');

// View current state
var state = getResumeState_('Users');
Logger.log(JSON.stringify(state));
```

### Debug Functions

Several debug functions are available in `debug.gs` to help troubleshoot and inspect the system:

#### Get Access Token for Testing

If you need to manually inspect or copy the current access token (e.g., for API testing in Postman or curl):

```javascript
// In Apps Script editor, run:
DebugGetToken()
```

This function will:
- Automatically check if the token is expired and refresh it if needed
- Display the token in the execution log with clear formatting
- Show the token's expiration time
- Handle any authentication errors

**To view the output:**
1. Run the function from the Apps Script editor
2. View the execution log (Ctrl+Enter or View > Logs)
3. Copy the token from between the separator lines

**Example output:**
```
========================================
ACCESS TOKEN (copy from below):
========================================
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
========================================
Expires at: 11/11/2025, 5:30:00 PM
========================================
```

#### Other Debug Functions

```javascript
// Check which credentials are configured
DebugTokens()

// Test authentication with a single API call
DebugAuthOnce()
```

## Project Structure

### Core Modules

#### `main.gs` - Entry Points
- `setupAll()` - Create all scheduled triggers
- `runUsersReport()` - Run users report
- `runTransactionsReport()` - Run transactions report
- `DebugAuthOnce()` - Test authentication

#### `reportRunner.gs` - Execution Engine
- `runReport(config)` - Main execution function
  - Validates configuration
  - Manages pagination loop
  - Handles state persistence
  - Performs upsert operations
  - Creates audit logs

#### `config.gs` - Report Definitions
- `CONFIG` - Users report configuration
- `CONFIG_TX` - Transactions report configuration
- `CONFIG_UGDR` - User group dynamic report
- `CONFIG_UGSR` - User group statistics report
- `CONFIG_AGING` - Accounting aging report (with statement period support)
- `CONFIG_TEST` - Test configuration (for unit tests)

#### `configHelper.gs` - Configuration Factory
- `ck_makeConfig_(options)` - Creates standardized config objects with defaults

#### `fetch.gs` - HTTP Operations
- `postWithRetry_(url, body, maxRetries)` - POST request with exponential backoff
- `parsePayload_(payload, config)` - Parse JSON/CSV responses
- `mapPickFields_(arr, fields)` - Extract specific fields from objects

#### `auth.gs` - OAuth Management
- `getAccessToken_()` - Get valid access token (refresh if needed)
- `refreshAccessToken_()` - Refresh expired token
- `bootstrapDaxkoTokens_Universal_()` - Initial authentication setup
- `daxkoHeaders_()` - Build HTTP headers with Bearer token

#### `sheet.gs` - Google Sheets Operations
- `ensureSheetWithHeaders_(sheetName, fields)` - Create/update sheet structure
- `upsertRowsToSheet_(sheetName, records, fields, keyField, clearFirst)` - Update/insert records (with optional clear)
- `clearSheetData_(sheetName)` - Clear all data rows, keeping headers
- `castValue_(val, fieldName)` - Type conversion (dates, numbers)
- `parseDateFlexible_(val)` - Robust date parsing

#### `state.gs` - State Persistence
- `getResumeState_(key)` - Load saved state
- `setResumeState_(key, state)` - Save state
- `resetResumeState_(key)` - Clear state
- `forceResumePage_(key, page)` - Manually set resume point

#### `audit.gs` - Execution Logging
- `ensureAuditSheet_(sheetName)` - Create audit sheet
- `appendAuditRow_(info, sheetName)` - Log execution details

#### `utils.gs` - Utilities
- `hasTimeLeft_(startMs, budgetMs)` - Check execution time remaining
- `scheduleContinuation_(funcName, delayMinutes)` - Schedule follow-up run
- `safeGetText_(response)` - Safely decode HTTP responses
- `indexOf_()`, `contains_()` - Array helpers

### Report-Specific Modules

#### `transactions.gs`
- `buildTxBody_(page)` - Build transaction request body (with date range)
- `fetchTxPage_(body, page, ctx)` - Fetch transaction page
- `flattenTxInvoices_(arr)` - Transform transaction data

#### `userGroupDynamicReport.gs`
- `fetchUgdrOnce_(body, page, ctx)` - Fetch user group dynamic report
- `flattenUgdr_(arr)` - Transform UGDR data

#### `userGroupStatisticsReport.gs`
- `fetchUgsrOnce_(body, page, ctx)` - Fetch user group statistics report
- `flattenUgsr_(arr)` - Transform UGSR data

#### `accountingAgingReport.gs`
- `getStatementPeriod_()` - Get current or custom statement period (YYYY-MM format)
- `getCurrentStatementPeriod_()` - Get previous month's period automatically
- `setStatementPeriod_(period)` - Set custom statement period override
- `clearStatementPeriod_()` - Clear custom period override

#### `scheduleEvents.gs`
- `fetchScheduleEvents_(body, page, ctx)` - Fetch schedule events via GET request
- `flattenScheduleEvents_(eventsArr)` - Transform events with sessions into flat records
- `getScheduleEventsDays_()` - Get configured number of days to fetch (default: 7)
- `setScheduleEventsDays_(numDays)` - Set number of days to fetch events for

### Support Modules

#### `tests.gs` - Test Suite
- Unit tests for core functionality
- Run with `runAllTests()` or individual test suites:
  - `runStateTests()` - State management
  - `runSheetTests()` - Sheet operations
  - `runUtilsTests()` - Utility functions
  - `runConfigTests()` - Configuration validation
  - `runAuthTests()` - Authentication
  - `runFetchTests()` - HTTP and parsing
  - `runReportRunnerTests()` - Report runner logic
  - `runAgingTests()` - Accounting aging report
- Quick test shortcuts: `quickTestState()`, `quickTestSheet()`, `quickTestUtils()`, `quickTestConfig()`, `quickTestAging()`

#### `debug.gs` - Development Tools
- `DebugGetToken()` - Get and display current access token (with auto-refresh)
- `DebugTokens()` - Check which credentials are configured
- `DebugAuthOnce()` - Test authentication with a single API call

#### `notifications.gs` - Email Notifications
- Send digest emails after execution

#### `raw.gs` - Raw Data Export
- Save raw API responses to Google Drive (currently disabled)

## Advanced Topics

### Custom Data Transformations

For complex API responses, implement custom `flatten` functions:

```javascript
flatten: function (resultsArr) {
  // Transform nested structure
  var mainRecords = resultsArr.map(function(item) {
    return {
      id: item.id,
      name: item.profile.name,
      email: item.profile.email,
      total: item.summary.total
    };
  });

  // Can return multiple sheet datasets
  return {
    main: mainRecords
    // Could also include: details: detailRecords, summary: summaryRecords
  };
}
```

### Multiple Sheet Support

One API response can populate multiple sheets:

```javascript
// In config
sheetConfigs: [
  {
    sheetName: 'Invoices',
    fields: ['invoiceId', 'date', 'total'],
    keyField: 'invoiceId'
  },
  {
    sheetName: 'LineItems',
    fields: ['lineItemId', 'invoiceId', 'description', 'amount'],
    keyField: 'lineItemId'
  }
]

// In flatten function
flatten: function (resultsArr) {
  var invoices = [];
  var lineItems = [];

  resultsArr.forEach(function(invoice) {
    invoices.push({
      invoiceId: invoice.id,
      date: invoice.date,
      total: invoice.total
    });

    invoice.items.forEach(function(item) {
      lineItems.push({
        lineItemId: item.id,
        invoiceId: invoice.id,
        description: item.desc,
        amount: item.amount
      });
    });
  });

  return {
    Invoices: invoices,
    LineItems: lineItems
  };
}
```

### Performance Tuning

**Optimize page size:**
- Larger pages = fewer API calls, but higher memory usage
- Smaller pages = more API calls, but safer for memory
- Recommended: 50-100 records per page

**Adjust time budget:**
```javascript
runtime: {
  msBudget: 240000  // 4 minutes (default)
}
```

**Monitor execution time:**
Check audit sheet Duration column. If consistently hitting budget, consider:
- Reducing page size
- Optimizing flatten functions
- Checking for slow API responses

### Security Best Practices

1. **Limit script access:** Only share with authorized users
2. **Use refresh tokens:** More secure than client credentials
3. **Don't log sensitive data:** Review what's logged in audit sheet
4. **Rotate credentials:** Periodically update API credentials
5. **Monitor audit logs:** Watch for unusual patterns

### Adapting to Other APIs

To use with a different API:

1. **Update authentication** (`auth.gs`):
   - Modify OAuth flow if different provider
   - Update token URL and header format

2. **Create new config** (`config.gs`):
   - Set new API URL
   - Define output fields
   - Implement custom `buildBody` if needed

3. **Adjust parsing** (`fetch.gs`):
   - Update `parsePayload_()` if response structure differs
   - Handle different JSON structures

4. **Test thoroughly:**
   - Start with small page size
   - Monitor audit sheet
   - Verify data accuracy

## Current Status

**Production Ready:** ✅

The framework is actively used in production for importing Daxko API data. Current reports:

- **Users Report:** Daily sync of member/user data
- **Transactions Report:** Daily sync of financial transactions
- **User Group Dynamic Report:** Group membership data
- **User Group Statistics Report:** Group statistics
- **Accounting Aging Report:** Daily sync of accounting aging data with statement period management
- **Dues Summary Report:** Daily sync of dues summary totals and details
- **Schedule Events Report:** Daily sync of scheduled events (replaces data each run)

### Known Limitations

1. **CSV Parsing:** Not implemented (JSON only)
2. **Single API per config:** Each config targets one endpoint
3. **Google Sheets Limits:** Maximum 10 million cells per sheet
4. **Memory Constraints:** Very large page sizes (500+) may hit memory limits
5. **Sequential Processing:** Pages fetched one at a time (no parallelization)

### Future Enhancements

- CSV parsing support
- Parallel page fetching (if Google Apps Script adds support)
- Compressed response handling
- Webhook-based triggers
- Enhanced error recovery strategies

---

**Questions or Issues?** Review the audit sheet first, then check the troubleshooting section. For development questions, see `claude_understanding.md` for detailed architecture documentation.
