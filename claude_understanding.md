# Claude's Understanding of Google Sheets Large Data Request to API

## Overview

This Google Apps Script project is a **robust data pipeline** designed to reliably import large datasets from paginated REST APIs (specifically the Daxko Partners API) into Google Sheets. The system is built to overcome the inherent limitations of Google Apps Script's execution time constraints (6 minutes) by implementing a resumable, state-based architecture.

## Core Purpose

The primary goal is to fetch potentially millions of records from an API that serves data in pages (e.g., 50-100 records per page) and sync them into Google Sheets on a regular schedule. The system must:

1. Handle APIs that require OAuth 2.0 authentication
2. Paginate through potentially hundreds or thousands of pages
3. Resume execution across multiple runs when hitting time limits
4. Update existing records and append new ones (upsert logic)
5. Maintain audit logs and send notifications
6. Handle transient errors with retry logic

## Architecture

### Module Structure

The codebase is organized into focused modules:

#### 1. **main.gs** - Entry Points & Setup
- Contains the public functions that serve as entry points for scheduled triggers
- `runUsersReport()`, `runTransactionsReport()`: Execute specific reports
- `setupAll()`: Configures time-based triggers for all reports
- Each report has its own setup and run function

#### 2. **reportRunner.gs** - Core Engine
This is the heart of the system. The `runReport(config)` function:

- **Validates configuration**: Ensures all required fields are present
- **Loads saved state**: Retrieves the last page number from ScriptProperties
- **Pagination loop**:
  - Fetches pages one at a time
  - Monitors execution time (stays within ~4 minute budget)
  - Accumulates all results from the current run
  - Saves state after each page (in case of timeout)
  - Exits when no more results or time is running out
- **Data processing**:
  - Parses JSON responses
  - Flattens nested structures
  - Handles multiple sheet configurations (one API response → multiple sheets)
- **Upsert operation**: Calls sheet functions to update/insert records
- **Cleanup & reporting**: Logs audit info, sends email digest, schedules continuation if needed

Key insight: The runner is **stateless across executions** but uses ScriptProperties to persist state (current page number, format, page size).

#### 3. **config.gs** - Report Configurations
Defines configuration objects for each report:

- **CONFIG**: Users report - fetches user/member data
- **CONFIG_TX**: Transactions report - fetches transaction/invoice data
- **CONFIG_UGDR**: User group dynamic report

Each config includes:
- `apiUrl`: The endpoint to call
- `sheetName`: Target sheet name
- `uniqueKey`: Field to use for identifying existing records (for upsert)
- `outputFields`: Array of field names to extract
- `criteriaFields`: Filter parameters for the API
- `buildRequestBody`: Function to construct the POST body for each page
- `fetchPage`: Function to make the actual HTTP request
- `flatten`: Function to transform nested API responses into flat records

#### 4. **configHelper.gs** - Configuration Factory
Provides `ck_makeConfig_()` which:
- Loads saved state (page number, format, page size) from ScriptProperties
- Provides sensible defaults for common settings
- Creates standardized config objects with all required methods
- Reduces boilerplate in config.gs

#### 5. **fetch.gs** - HTTP & Parsing
- `postWithRetry_()`: Makes HTTP POST requests with exponential backoff
  - Retries on 429 (rate limit) and 5xx errors
  - Automatically refreshes OAuth token on 401/403
  - Throws after max retries exceeded
- `parsePayload_()`: Parses JSON responses and extracts the results array
  - Handles different response structures (results, data.results, etc.)
  - Maps fields using `mapPickFields_()` to extract only requested fields

#### 6. **auth.gs** - OAuth 2.0 Token Management
- `getAccessToken_()`: Returns a valid access token, refreshing if expired/missing
- `refreshAccessToken_()`: Uses refresh_token grant to get new access token
- `bootstrapDaxkoTokens_Universal_()`: Initial authentication setup
  - Supports both `refresh_token` and `client_credentials` flows
  - Stores tokens in ScriptProperties
- `daxkoHeaders_()`: Builds HTTP headers with Bearer token

Token management is automatic: if a request fails with 401, it refreshes once and retries.

#### 7. **sheet.gs** - Google Sheets Operations
- `ensureSheetWithHeaders_()`: Creates sheet if needed, adds/updates header row
  - Handles dynamic column addition (if new fields appear)
  - Sets first row as frozen and bold
- `upsertRowsToSheet_()`: The "upsert" operation
  - Reads existing IDs from the unique key column
  - Builds a map of ID → row number
  - For each new record:
    - If ID exists: update that row
    - If ID is new: append to end
  - Returns counts of appended and updated rows
- `castValue_()`: Converts values based on field type
  - Date fields → Date objects
  - Numeric fields → Numbers
  - Everything else → Strings
- `parseDateFlexible_()`: Robust date parser supporting multiple formats
  - M/D/YYYY with optional time
  - ISO 8601 dates
  - Handles timezones

The upsert logic is efficient: it reads the ID column once, builds a lookup map, then performs batch updates.

#### 8. **state.gs** - State Persistence
- Uses ScriptProperties to store JSON objects
- Each report has its own state key (usually the sheet name)
- State includes: `page`, `pageSize`, `format`, `updatedAt`
- Functions:
  - `getResumeState_()`: Loads state
  - `setResumeState_()`: Saves state
  - `resetResumeState_()`: Clears state (on completion)
  - `forceResumePage_()`: Manually set resume point

State is saved after each successful page fetch, so if execution times out, the next run picks up where it left off.

#### 9. **audit.gs** - Execution Logging
- `ensureAuditSheet_()`: Creates audit sheet with standard columns
- `appendAuditRow_()`: Logs one row per execution
- Captures:
  - Timestamp, status (SUCCESS/ERROR)
  - Pages fetched, records fetched
  - Appended/updated counts
  - Duration, format, page size
  - Whether token was refreshed
  - Error messages if any

This provides a complete history of all executions for monitoring and debugging.

#### 10. **utils.gs** - Utility Functions
- `mapPickFields_()`: Extracts specific fields from array of objects
- `indexOf_()`, `contains_()`: Array helpers (for older Apps Script environments)
- `safeGetText_()`: Safely decodes HTTP response bodies as UTF-8
  - Strips BOM characters
  - Normalizes line endings
- `hasTimeLeft_()`: Checks if we're approaching execution timeout
- `scheduleContinuation_()`: Creates a one-time trigger to continue execution
  - Removes duplicate triggers
  - Schedules next run after delay (default 60 seconds)

#### 11. **transactions.gs** - Transaction Report Logic
Custom logic for the Transactions report:
- `buildTxBody_()`: Builds request body with date range (year-to-date)
- `flattenTxInvoices_()`: Extracts invoice-level fields
- `fetchTxPage_()`: Custom fetcher that returns raw payload (bypasses some parsing logic)

The Transactions API has a different structure than the Users API, so it needs custom handling.

#### 12. **userGroupDynamicReport.gs**
Contains custom logic for the User Group Dynamic Report (CONFIG_UGDR).

#### 13. **userGroupStatisticsReport.gs**
Contains custom logic for the User Group Statistics Report (CONFIG_UGSR).

#### 14. **accountingAgingReport.gs**
Contains custom logic for the Accounting Aging Report (CONFIG_AGING) including statement period management.

#### 15. **duesSummary.gs**
Contains custom logic for the Dues Summary Report (CONFIG_DUES_SUMMARY) which populates two sheets.

#### 16. **scheduleEvents.gs**
Contains custom logic for the Schedule Events Report (CONFIG_SCHEDULE_EVENTS):
- `fetchScheduleEvents_()`: Makes GET request with dynamic date and configurable days
- `flattenScheduleEvents_()`: Transforms nested events/sessions structure into flat records
  - **Filters out**: Sessions with status="canceled"
  - **Filters out**: Sessions with empty participants array
  - **Extracts**: Participant names as comma-separated string (like Staff and Rooms)
- `getScheduleEventsDays_()`: Retrieves configured number of days from ScriptProperties
- `setScheduleEventsDays_()`: Sets the number of days to fetch

**Key differences**:
- Uses GET instead of POST
- Clears sheet data before writing (no upsert)
- Filters data at the flattening stage
- Large pageSize (9999) prevents pagination loop issues

#### 17. **notifications.gs**
Handles sending email digests after each run (not heavily used in current configs).

#### 18. **userCancellationSync.gs**
Contains functionality for syncing user cancellation data to the Users sheet:
- `syncUserCancellations()`: Main sync function that fetches incremental cancellation data
- `syncCanceledStatusUsers()`: Fetches all users with "Canceled" status
- `syncCanceledWithDates()`: Fetches canceled users that have cancellation dates
- `fetchCancellationData_()`: Fetches users canceled within a date range
- `updateUsersCancellationData_()`: Updates Users sheet with DateCancelOn and CancelationReason
- `getCancellationSyncRange_()`: Determines date range for incremental sync
- `getLastCancellationSync_()`: Gets last sync date from ScriptProperties
- `setLastCancellationSync_()`: Saves last sync date

**Key features**:
- Incremental sync based on last run date
- Updates existing Users sheet rows (not a separate sheet)
- Tracks last sync date in ScriptProperties
- Three sync strategies: incremental, status-based, and combined

#### 19. **debug.gs**
Utility functions for debugging and development.

#### 20. **raw.gs**
Contains functionality to save raw API responses to Google Drive (currently disabled in configs).

#### 21. **a_gatherReports_run.gs**
Entry point functions for running all reports manually:
- `runUsersReport()`: Runs CONFIG
- `runTransactionsReport()`: Runs CONFIG_TX
- `runUserGroupDynamicReport()`: Runs CONFIG_UGDR
- `runUserGroupStatisticsReport()`: Runs CONFIG_UGSR
- `runAccountingAgingReport()`: Runs CONFIG_AGING
- `runDuesSummaryReport()`: Runs CONFIG_DUES_SUMMARY
- `runScheduleEventsReport()`: Runs CONFIG_SCHEDULE_EVENTS
- `runUserCancellationSync()`: Runs user cancellation sync
- `runCanceledStatusSync()`: Runs canceled status sync
- `runCanceledWithDatesSync()`: Runs canceled with dates sync
- `runGetAccessToken()`: Utility to get/refresh access token

#### 22. **gatherReports_setup.gs**
Setup functions for creating scheduled triggers for all reports:
- `setupUsers()`: Daily trigger for users report (every 1 hour)
- `setupTransactions()`: Daily trigger for transactions (every 24 hours)
- `setupUserGroupDynamicReport()`: Daily trigger (every 24 hours)
- `setupUserGroupStatisticsReport()`: Daily trigger (every 24 hours)
- `setupAccountingAgingReport()`: Daily trigger (every 24 hours)
- `setupDuesSummaryReport()`: Daily trigger (every 24 hours)
- `setupScheduleEventsReport()`: Daily trigger at 6 AM (every 6 hours)
- `setupUserCancellationSync()`: Daily trigger at 2 AM (every 2 hours)
- `setupCanceledStatusSync()`: Daily trigger at 3 AM (every 3 hours)
- `setupCanceledWithDatesSync()`: Daily trigger at 4 AM (every 4 hours)

## Execution Flow

### Initial Setup (One-Time)

1. Developer creates Google Apps Script project
2. Sets script properties (API credentials, token URL, client ID, etc.)
3. Runs `BootstrapDaxkoTokens()` to get initial access token
4. Runs `setupAll()` to create scheduled triggers

### Scheduled Execution (Automatic)

1. **Trigger fires** (e.g., every hour)
   - Calls `runUsersReport()` or `runTransactionsReport()`

2. **Report execution starts**
   - `runReport(CONFIG)` is called
   - Validates config
   - Loads saved state from ScriptProperties
     - If state exists: resume from saved page
     - If no state: start from page 1

3. **Authentication**
   - Calls `getAccessToken_()`
   - Checks if token is expired (within 1 minute of expiration)
   - If expired: calls `refreshAccessToken_()` to get new token

4. **Pagination loop** (the main loop)
   ```
   while (true) {
     - Check if we have time left (budget check)
     - Build request body for current page
     - Fetch page from API
       - HTTP POST with retry logic
       - Handles 401 (auth error) → refresh token → retry
       - Handles 429/5xx (transient errors) → exponential backoff → retry
     - Parse JSON response
     - Extract results array
     - If empty page: break (all data fetched)
     - Accumulate results
     - Increment page counter
     - Save state (current page)
     - If fewer results than page size: break (last page)
   }
   ```

5. **Data transformation**
   - Calls `config.flattenRecords(allResults)`
   - Transforms nested API data into flat structure
   - Can produce multiple datasets (e.g., invoices + charges)

6. **Sheet updates**
   - For each sheet configuration:
     - Calls `ensureSheetWithHeaders_()` to prepare sheet
     - Calls `upsertRowsToSheet_()` to update data
       - Builds map of existing IDs
       - Updates existing rows
       - Appends new rows
     - Applies formatting (dates, numbers)

7. **Cleanup & logging**
   - Clears saved state (if all pages fetched)
   - Saves final state (if partial run due to timeout)
   - Creates audit log entry
   - Sends email notification (if configured)
   - Schedules continuation (if more pages remain)

### Resumable Execution

The key to handling large datasets:

- **State saved after each page**: If execution times out mid-run, the next trigger picks up from the last completed page
- **Continuation triggers**: If the loop exits due to time constraints, `scheduleContinuation_()` creates a one-time trigger to run again in 60 seconds
- **Idempotent upsert**: Running the same data multiple times is safe; existing records are updated, not duplicated

## Key Design Patterns

### 1. Configuration-Driven Architecture
All report-specific logic is isolated in config objects. Adding a new report requires:
- Define a new CONFIG_XXX object
- Specify API URL, fields, sheet name, unique key
- Optionally provide custom `buildBody`, `fetchPage`, or `flatten` functions
- Create entry point functions in main.gs

### 2. Upsert Pattern
Instead of clearing and rewriting the entire sheet:
- Each record has a unique key (e.g., SystemId, invoice number)
- On each run, existing records are updated in place
- New records are appended
- This allows for incremental updates and handles data changes

### 3. State-Based Resumption
Uses Google Apps Script's ScriptProperties as a simple key-value store:
- Key: sheet name (or custom state key)
- Value: JSON object with `{page, pageSize, format}`
- Persisted across executions
- Simple but effective for this use case

### 4. Retry with Exponential Backoff
For transient errors:
- Initial backoff: 1000ms
- Doubles on each retry: 1000ms → 2000ms → 4000ms
- Max retries: 3 (configurable)
- Handles rate limiting and temporary API issues

### 5. Token Refresh Interception
OAuth tokens expire, but the system handles this transparently:
- Before each run, checks token expiration
- On 401 response, automatically refreshes and retries
- User never needs to manually refresh tokens

### 6. Time Budget Management
Google Apps Script has 6-minute execution limit:
- Script sets ~4 minute budget (240000ms)
- Checks elapsed time before each page fetch
- Exits gracefully if approaching limit
- Schedules continuation to finish remaining pages
- Prevents hitting hard timeout (which can corrupt state)

## Data Flow Example: Users Report

1. **API Response** (JSON):
   ```json
   {
     "results": [
       {"SystemId": "12345", "FirstName": "John", "LastName": "Doe", "Email": "john@example.com", ...},
       {"SystemId": "12346", "FirstName": "Jane", "LastName": "Smith", "Email": "jane@example.com", ...}
     ]
   }
   ```

2. **After parsing** (`parsePayload_`):
   - Extracts `results` array
   - Maps fields using `outputFields` from config
   - Returns `{records: [...]}` with only requested fields

3. **After flattening** (`flatten`):
   - For Users: simple pass-through `{main: records}`
   - For Transactions: splits into invoices and charges

4. **In Google Sheet**:
   - Header row: SystemId | FirstName | LastName | Email | ...
   - Data rows: one per record
   - Existing SystemIds → updated
   - New SystemIds → appended

## Current Reports

### 1. Users Report (CONFIG)
- **API**: `/api/v1/reports/1`
- **Sheet**: "Users"
- **Unique Key**: SystemId
- **Fields**: 20+ fields including name, email, status, membership info
- **Schedule**: Daily
- **Format**: JSON

### 2. Transactions Report (CONFIG_TX)
- **API**: `/api/v1/reports/transaction-search`
- **Sheet**: "Transactions"
- **Unique Key**: uniqueID (invoice number)
- **Fields**: invoice, date, memberName, total
- **Date Range**: Year-to-date
- **Custom Logic**: Uses custom body builder with dateFrom parameter
- **Schedule**: Daily
- **Format**: JSON

### 3. User Group Dynamic Report (CONFIG_UGDR)
- **API**: `/api/v1/reports/22`
- **Sheet**: "UserGDR_Summary"
- **Purpose**: Fetches user group dynamic report data
- **Schedule**: Daily
- **Format**: JSON

### 4. User Group Statistics Report (CONFIG_UGSR)
- **API**: `/api/v1/reports/26`
- **Sheet**: "UserGSR_Summary"
- **Purpose**: Fetches user group statistics report data
- **Schedule**: Daily
- **Format**: JSON

### 5. Accounting Aging Report (CONFIG_AGING)
- **API**: `/api/v1/reports/5`
- **Sheet**: "AccountingAging"
- **Unique Key**: SystemId
- **Fields**: SystemId, LastLogin, HomeClub, UserGroupName, Field "4"
- **Special Feature**: Statement period management (YYYY-MM format)
- **Schedule**: Daily
- **Format**: JSON

### 6. Dues Summary Report (CONFIG_DUES_SUMMARY)
- **API**: `/api/v1/reports/22`
- **Sheets**: "DuesSummary_Totals" and "DuesSummary_Details"
- **Purpose**: Tracks dues summary data for specific user groups
- **Schedule**: Daily
- **Format**: JSON

### 7. Schedule Events Report (CONFIG_SCHEDULE_EVENTS)
- **API**: `/api/v1/schedule/events?startDate=YYYY-MM-DD&numDays=N`
- **Sheet**: "ScheduledEvents"
- **Unique Key**: SessionId
- **Fields**: 21 fields including event details, sessions, staff, rooms, resources, participants
- **Special Features**:
  - **GET request** instead of POST
  - **Clears sheet data** before each write (no upsert)
  - **Dynamic date**: Uses current date as startDate
  - **Configurable days**: numDays from ScriptProperties (default: 7)
  - **No pagination**: Single request fetches all events (pageSize: 9999)
  - **Filtering**: Excludes sessions with status="canceled" and sessions with empty participants array
  - **Participants**: Extracts participant names as comma-separated string
- **Schedule**: Daily at 6 AM
- **Format**: JSON
- **Module**: scheduleEvents.gs

## Error Handling

The system has multiple layers of error handling:

1. **HTTP level** (fetch.gs):
   - Retry on 429, 5xx
   - Token refresh on 401/403
   - Exponential backoff

2. **Execution level** (reportRunner.gs):
   - Try-catch around main loop
   - Status logged as SUCCESS or ERROR
   - Error messages captured in audit log

3. **State preservation**:
   - State is saved in `finally` block
   - Even if error occurs, progress is not lost

4. **Graceful degradation**:
   - If one page fails after retries, execution stops but progress is saved
   - Next run will attempt that page again

## Authentication Flow

The project supports two OAuth 2.0 flows:

### Flow 1: Refresh Token (Recommended)
1. Initial setup:
   - Developer obtains refresh_token from Daxko
   - Stores in DAXKO_REFRESH_TOKEN property
2. Runtime:
   - Uses refresh_token to get access_token
   - Access tokens expire (typically 1 hour)
   - Automatically refreshes when needed
   - New refresh_tokens are saved (if provided)

### Flow 2: Client Credentials
1. Initial setup:
   - Developer sets DAXKO_CLIENT_SECRET and DAXKO_SCOPE
2. Runtime:
   - Uses client_credentials grant to get access_token
   - No refresh_token involved
   - Must re-authenticate with credentials when token expires

The system automatically detects which flow to use based on available properties.

## Strengths of This Implementation

1. **Resilient**: Handles timeouts, errors, token expiration gracefully
2. **Resumable**: Can process datasets of any size by resuming across runs
3. **Modular**: Easy to add new reports without changing core logic
4. **Auditable**: Complete history of all executions
5. **Idempotent**: Safe to run multiple times; won't create duplicates
6. **Maintainable**: Clear separation of concerns, well-organized modules
7. **Configurable**: Most behavior controlled through config objects

## Limitations & Trade-offs

1. **JSON only**: CSV parsing is not implemented (would need extension)
2. **Sequential processing**: Processes one page at a time (can't parallelize due to Apps Script constraints)
3. **Memory constraints**: Accumulates all results in memory before writing to sheet (could hit limits with very large page sizes)
4. **Simple state**: State is just a page number; doesn't track which specific records have been processed
5. **Google Sheets limits**: Sheets have max 10 million cells; very large datasets may hit this
6. **No conflict resolution**: If API data changes between runs, latest data wins (no merge logic)

## Security Considerations

1. **Credentials storage**: Tokens stored in ScriptProperties (visible to anyone with script access)
2. **No encryption**: Access tokens stored in plain text
3. **Broad scope**: Script has access to entire spreadsheet and all properties
4. **Email exposure**: Notification emails may contain sensitive summary data

Best practices:
- Limit script sharing to authorized users only
- Use refresh_token flow (more secure than client_credentials)
- Review audit logs regularly
- Don't log sensitive PII in error messages

## Performance Characteristics

- **Typical page fetch time**: 1-3 seconds (depends on API response time)
- **Records per execution**: Varies based on page size and time budget
  - 50 records/page, 2 sec/page → ~100-120 pages → 5000-6000 records per run
- **Full sync time for 100,000 records**: ~20-30 runs over 1-2 hours (with 60-second continuation delays)
- **Sheet upsert performance**: Fast for first 10,000 rows, slows down as sheet grows (due to ID lookup)

## Testing

The project includes a test suite (`tests.gs`) that validates:
- Configuration validation
- State management
- Authentication token handling
- Upsert logic
- Date parsing
- Field mapping

Tests use a mock CONFIG_TEST with stubbed API calls.

## Deployment Checklist

To deploy this for a new API:

1. **Configure script properties**:
   - API credentials (token URL, client ID, secret/refresh token)
   - Email addresses for notifications

2. **Create configuration object**:
   - Define API endpoint
   - Specify fields to extract
   - Set sheet name and unique key
   - Provide custom functions if needed (buildBody, fetchPage, flatten)

3. **Create entry point functions**:
   - runXxxReport() function
   - setupXxxReport() function
   - Add to setupAll() and runAllReports()

4. **Bootstrap authentication**:
   - Run BootstrapDaxkoTokens() once

5. **Test manually**:
   - Run the report function manually
   - Check sheet for data
   - Review audit log

6. **Set up triggers**:
   - Run setupAll() to create scheduled triggers
   - Verify triggers in Apps Script dashboard

7. **Monitor**:
   - Check audit sheet daily
   - Review email notifications
   - Watch for errors

## Conclusion

This is a well-architected solution to a challenging problem: reliably importing large, paginated datasets from APIs into Google Sheets despite execution time constraints. The key innovations are:

1. **State-based resumption**: Breaking large jobs into chunks
2. **Upsert logic**: Efficiently updating existing data
3. **Automatic token management**: Transparent authentication
4. **Configuration-driven**: Easy to extend to new reports

The code is production-ready, modular, and maintainable. It demonstrates strong software engineering practices including separation of concerns, error handling, logging, and testing. The main limitation is that it's tightly coupled to the Daxko API structure, but the design is flexible enough to adapt to other similar APIs with minimal changes.
