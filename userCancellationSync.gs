/**
 * User Cancellation Sync
 * Syncs cancellation dates and reasons for users who have been canceled.
 * Fetches incrementally from last sync date and updates existing Users sheet rows.
 */

/**
 * Gets the last cancellation sync date.
 * @returns {string|null} Last sync date in YYYY-MM-DD format
 */
function getLastCancellationSync_() {
  return PropertiesService.getScriptProperties().getProperty('USER_CANCELLATION_LAST_SYNC');
}

/**
 * Sets the last cancellation sync date.
 * @param {string} dateStr - Date in YYYY-MM-DD format
 */
function setLastCancellationSync_(dateStr) {
  PropertiesService.getScriptProperties().setProperty('USER_CANCELLATION_LAST_SYNC', dateStr);
}

/**
 * Clears the last cancellation sync date.
 */
function clearLastCancellationSync_() {
  PropertiesService.getScriptProperties().deleteProperty('USER_CANCELLATION_LAST_SYNC');
}

/**
 * Manually sets the last cancellation sync date.
 * @param {string} dateStr - Date in YYYY-MM-DD format (e.g., "2024-12-31")
 */
function setLastCancellationSyncManual_(dateStr) {
  PropertiesService.getScriptProperties().setProperty('USER_CANCELLATION_LAST_SYNC', dateStr);
  Logger.log('Manually set USER_CANCELLATION_LAST_SYNC to: ' + dateStr);
}

/**
 * Gets the end of the current month in YYYY-MM-DD format.
 * @returns {string} Last day of current month
 */
function getCurrentMonthEnd_() {
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth() + 1; // 1-12

  // Get last day of current month
  var lastDay = new Date(year, month, 0).getDate();
  var monthStr = String(month).padStart(2, '0');
  var dayStr = String(lastDay).padStart(2, '0');

  return year + '-' + monthStr + '-' + dayStr;
}

/**
 * Converts YYYY-MM-DD to MM/DD/YYYY format for the API.
 * @param {string} isoDate - Date in YYYY-MM-DD format
 * @returns {string} Date in MM/DD/YYYY format
 */
function isoToApiDate_(isoDate) {
  var parts = isoDate.split('-');
  return parts[1] + '/' + parts[2] + '/' + parts[0];
}

/**
 * Determines the date range to fetch cancellations for.
 * @returns {Object} Object with {shouldFetch: boolean, fromDate: string, toDate: string, reason: string}
 */
function getCancellationSyncRange_() {
  var lastSync = getLastCancellationSync_();
  var currentMonthEnd = getCurrentMonthEnd_();

  if (!lastSync) {
    // First run - start from Jan 1, 2025
    return {
      shouldFetch: true,
      fromDate: '2025-01-01',
      toDate: currentMonthEnd,
      reason: 'Initial sync from 2025-01-01'
    };
  }

  // Check if we need to sync (last sync is before current month end)
  if (lastSync < currentMonthEnd) {
    // Fetch from day after last sync through current month end
    var lastSyncDate = new Date(lastSync);
    lastSyncDate.setDate(lastSyncDate.getDate() + 1);
    var fromDate = lastSyncDate.toISOString().split('T')[0];

    return {
      shouldFetch: true,
      fromDate: fromDate,
      toDate: currentMonthEnd,
      reason: 'Syncing from ' + fromDate + ' to ' + currentMonthEnd
    };
  }

  return {
    shouldFetch: false,
    fromDate: lastSync,
    toDate: lastSync,
    reason: 'Already synced through current month'
  };
}

/**
 * Builds the request body for fetching users with cancellation data.
 * @param {number} page - Page number
 * @param {string} fromDate - Start date in YYYY-MM-DD format
 * @param {string} toDate - End date in YYYY-MM-DD format
 * @returns {Object} Request body
 */
function buildCancellationSyncBody_(page, fromDate, toDate) {
  return {
    "format": "json",
    "pageSize": "100",
    "pageNumber": String(page || 1),
    "outputFields": [
      "SystemId",
      "DateCancelOn",
      "CancelationReason"
    ],
    "criteriaFields": {
      "user": {
        "dateCancelOn": {
          "from": isoToApiDate_(fromDate),
          "to": isoToApiDate_(toDate)
        }
      }
    }
  };
}

/**
 * Fetches all pages of users with cancellation data in the given date range.
 * @param {string} fromDate - Start date in YYYY-MM-DD format
 * @param {string} toDate - End date in YYYY-MM-DD format
 * @returns {Array} Array of user records with cancellation data
 */
function fetchCancellationData_(fromDate, toDate) {
  var apiUrl = 'https://api.partners.daxko.com/api/v1/reports/1';
  var allRecords = [];
  var page = 1;
  var hasMore = true;

  Logger.log('Fetching cancellation data from ' + fromDate + ' to ' + toDate);

  while (hasMore) {
    try {
      var body = buildCancellationSyncBody_(page, fromDate, toDate);

      // Use the standard Daxko fetcher
      var config = {
        apiUrl: apiUrl,
        daxko: { initialBackoffMs: 1000, maxRetries: 3 }
      };

      var text = postWithRetry_(apiUrl, body, config);
      var parsed = JSON.parse(text || '{}');

      // The API returns data directly as an array, not in a results property
      if (parsed.success && Array.isArray(parsed.data)) {
        var results = parsed.data;
        allRecords = allRecords.concat(results);

        Logger.log('Fetched page ' + page + ': ' + results.length + ' records');

        // Check if there are more pages
        if (results.length < 100) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        Logger.log('No more data or error: ' + (parsed.error || 'Unknown'));
        hasMore = false;
      }
    } catch (e) {
      Logger.log('ERROR fetching page ' + page + ': ' + e);
      hasMore = false;
    }
  }

  return allRecords;
}

/**
 * Updates the Users sheet with cancellation data.
 * @param {Array} records - Array of user records with cancellation info
 */
function updateUsersCancellationData_(records) {
  if (!records || records.length === 0) {
    Logger.log('No records to update');
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Users');

  if (!sheet) {
    throw new Error('Users sheet not found');
  }

  // Get all data from the sheet
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var systemIdCol = headers.indexOf('SystemId');
  var dateCancelOnCol = headers.indexOf('DateCancelOn');
  var CancelationReasonCol = headers.indexOf('CancelationReason');

  if (systemIdCol === -1) {
    throw new Error('SystemId column not found in Users sheet');
  }

  // Add columns if they don't exist
  if (dateCancelOnCol === -1) {
    headers.push('DateCancelOn');
    dateCancelOnCol = headers.length - 1;
    sheet.getRange(1, dateCancelOnCol + 1).setValue('DateCancelOn');
  }

  if (CancelationReasonCol === -1) {
    headers.push('CancelationReason');
    CancelationReasonCol = headers.length - 1;
    sheet.getRange(1, CancelationReasonCol + 1).setValue('CancelationReason');
  }

  // Build a map of SystemId to row number
  var systemIdToRow = {};
  for (var i = 1; i < data.length; i++) {
    var systemId = data[i][systemIdCol];
    if (systemId) {
      systemIdToRow[systemId] = i + 1; // +1 because sheet rows are 1-indexed
    }
  }

  // Update each record
  var updateCount = 0;
  for (var j = 0; j < records.length; j++) {
    var record = records[j];
    var systemId = record.SystemId || record.systemId;
    var dateCancelOn = record.DateCancelOn || record.dateCancelOn || '';
    var CancelationReason = record.CancelationReason || record.CancelationReason || '';

    if (systemId && systemIdToRow[systemId]) {
      var row = systemIdToRow[systemId];

      // Update DateCancelOn if it has a value
      if (dateCancelOn) {
        sheet.getRange(row, dateCancelOnCol + 1).setValue(dateCancelOn);
      }

      // Update CancelationReason if it has a value
      if (CancelationReason) {
        sheet.getRange(row, CancelationReasonCol + 1).setValue(CancelationReason);
      }

      updateCount++;
    }
  }

  Logger.log('Updated ' + updateCount + ' user records with cancellation data');
}

/**
 * Main function to sync user cancellations.
 * Fetches cancellation data since last sync and updates the Users sheet.
 */
function syncUserCancellations() {
  Logger.log('=== Starting User Cancellation Sync ===');

  var syncRange = getCancellationSyncRange_();

  if (!syncRange.shouldFetch) {
    Logger.log(syncRange.reason);
    Logger.log('=== Sync Complete (nothing to do) ===');
    return;
  }

  Logger.log(syncRange.reason);

  // Fetch the data
  var records = fetchCancellationData_(syncRange.fromDate, syncRange.toDate);
  Logger.log('Fetched ' + records.length + ' total records');

  // Update the sheet
  if (records.length > 0) {
    updateUsersCancellationData_(records);

    // Update the last sync date to the end date we just fetched
    setLastCancellationSync_(syncRange.toDate);
    Logger.log('Updated last sync date to: ' + syncRange.toDate);
  }

  Logger.log('=== Sync Complete ===');
}

/**
 * Fetches all users with "Canceled" member status.
 * This is a simpler approach than date-based syncing.
 * @returns {Array} Array of user records with canceled status
 */
function fetchCanceledStatusUsers_() {
  var apiUrl = 'https://api.partners.daxko.com/api/v1/reports/1';
  var allRecords = [];
  var page = 1;
  var hasMore = true;

  Logger.log('Fetching users with Canceled member status');

  while (hasMore) {
    try {
      var body = {
        "format": "json",
        "pageSize": "100",
        "pageNumber": String(page),
        "outputFields": [
          "SystemId",
          "DateCancelOn",
          "CancelationReason"
        ],
        "criteriaFields": {
          "user": {
            "memberstatus": ["Canceled"]
          }
        }
      };

      // Use the standard Daxko fetcher
      var config = {
        apiUrl: apiUrl,
        daxko: { initialBackoffMs: 1000, maxRetries: 3 }
      };

      var text = postWithRetry_(apiUrl, body, config);
      var parsed = JSON.parse(text || '{}');

      // The API returns data directly as an array
      if (parsed.success && Array.isArray(parsed.data)) {
        var results = parsed.data;
        allRecords = allRecords.concat(results);

        Logger.log('Fetched page ' + page + ': ' + results.length + ' records');

        // Check if there are more pages
        if (results.length < 100) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        Logger.log('No more data or error: ' + (parsed.error || 'Unknown'));
        hasMore = false;
      }
    } catch (e) {
      Logger.log('ERROR fetching page ' + page + ': ' + e);
      hasMore = false;
    }
  }

  return allRecords;
}

/**
 * Main function to sync cancellation data based on member status.
 * Fetches all users with "Canceled" status and updates their cancellation info.
 */
function syncCanceledStatusUsers() {
  Logger.log('=== Starting Canceled Status Sync ===');

  // Fetch all canceled users
  var records = fetchCanceledStatusUsers_();
  Logger.log('Fetched ' + records.length + ' total canceled users');

  // Update the sheet
  if (records.length > 0) {
    updateUsersCancellationData_(records);
  } else {
    Logger.log('No canceled users found');
  }

  Logger.log('=== Sync Complete ===');
}

/**
 * Fetches all users with "Canceled" status AND a DateCancelOn value.
 * This combines both criteria to ensure we only get canceled users with dates.
 * @returns {Array} Array of user records
 */
function fetchCanceledWithDates_() {
  var apiUrl = 'https://api.partners.daxko.com/api/v1/reports/1';
  var allRecords = [];
  var page = 1;
  var hasMore = true;

  Logger.log('Fetching users with Canceled status AND cancellation dates');

  while (hasMore) {
    try {
      var body = {
        "format": "json",
        "pageSize": "100",
        "pageNumber": String(page),
        "outputFields": [
          "SystemId",
          "DateCancelOn",
          "CancelationReason"
        ],
        "criteriaFields": {
          "user": {
            "memberstatus": ["Canceled"],
            "dateCancelOn": {
              "from": "01/01/2000",  // Wide date range to get all with any date
              "to": "12/31/2099"
            }
          }
        }
      };

      // Use the standard Daxko fetcher
      var config = {
        apiUrl: apiUrl,
        daxko: { initialBackoffMs: 1000, maxRetries: 3 }
      };

      var text = postWithRetry_(apiUrl, body, config);
      var parsed = JSON.parse(text || '{}');

      // The API returns data directly as an array
      if (parsed.success && Array.isArray(parsed.data)) {
        var results = parsed.data;
        allRecords = allRecords.concat(results);

        Logger.log('Fetched page ' + page + ': ' + results.length + ' records');

        // Check if there are more pages
        if (results.length < 100) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        Logger.log('No more data or error: ' + (parsed.error || 'Unknown'));
        hasMore = false;
      }
    } catch (e) {
      Logger.log('ERROR fetching page ' + page + ': ' + e);
      hasMore = false;
    }
  }

  return allRecords;
}

/**
 * Main function to sync canceled users that have cancellation dates.
 * Combines memberstatus=Canceled with dateCancelOn filter.
 */
function syncCanceledWithDates() {
  Logger.log('=== Starting Canceled With Dates Sync ===');

  // Fetch all canceled users with dates
  var records = fetchCanceledWithDates_();
  Logger.log('Fetched ' + records.length + ' total canceled users with dates');

  // Update the sheet
  if (records.length > 0) {
    updateUsersCancellationData_(records);
  } else {
    Logger.log('No canceled users with dates found');
  }

  Logger.log('=== Sync Complete ===');
}
