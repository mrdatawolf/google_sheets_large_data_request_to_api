/**
 * Schedule Events View - Creates a curated view of warehouse data
 *
 * This module reads from the ScheduledEvents warehouse sheet and creates
 * a filtered, column-subset view for end users and systems.
 */

/**
 * Setup function - Run this once to configure the Data Views spreadsheet
 * This will appear in the function dropdown for easy access
 */
function setupScheduledEventsView() {
  var spreadsheetId = '1O2LqCaRv7ykVKdcc2HU3KGyenShCvVJ2Doc3vNNVq8Q';
  setDataViewsSpreadsheetId_(spreadsheetId);
  Logger.log('✓ Data Views spreadsheet configured successfully');
  Logger.log('  Spreadsheet ID: ' + spreadsheetId);
  Logger.log('  You can now run updateScheduledEventsView() to populate the view');
}

/**
 * Get the Data Views spreadsheet
 * Uses the spreadsheet ID stored in script properties
 */
function getDataViewsSpreadsheet_() {
  var spreadsheetId = getProp_('DATA_VIEWS_SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('DATA_VIEWS_SPREADSHEET_ID not set in script properties. Use setDataViewsSpreadsheetId_() to set it.');
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

/**
 * Set the Data Views spreadsheet ID
 * Example: setDataViewsSpreadsheetId_('1O2LqCaRv7ykVKdcc2HU3KGyenShCvVJ2Doc3vNNVq8Q')
 */
function setDataViewsSpreadsheetId_(spreadsheetId) {
  setProp_('DATA_VIEWS_SPREADSHEET_ID', spreadsheetId);
  Logger.log('Data Views spreadsheet ID set to: ' + spreadsheetId);
}

/**
 * Get current Data Views spreadsheet ID
 */
function getDataViewsSpreadsheetId_() {
  return getProp_('DATA_VIEWS_SPREADSHEET_ID') || 'Not set';
}

/**
 * Build a map of SystemId -> Phone data from the UserPhones sheet
 * Returns an object with SystemId as key and phone object as value
 */
function buildUserPhoneMap_() {
  try {
    var ss = SpreadsheetApp.getActive();
    var phonesSheet = ss.getSheetByName('UserPhones');

    if (!phonesSheet) {
      Logger.log('UserPhones sheet not found - participant phones will be empty');
      return {};
    }

    var lastRow = phonesSheet.getLastRow();
    if (lastRow <= 1) {
      Logger.log('UserPhones sheet is empty - participant phones will be empty');
      return {};
    }

    var lastCol = phonesSheet.getLastColumn();
    var data = phonesSheet.getRange(1, 1, lastRow, lastCol).getValues();
    var headers = data[0];

    // Find column indices
    var systemIdCol = -1;
    var phoneHomeCol = -1;
    var phoneWorkCol = -1;
    var phoneCellCol = -1;

    for (var i = 0; i < headers.length; i++) {
      if (headers[i] === 'SystemId') systemIdCol = i;
      if (headers[i] === 'PhoneHome') phoneHomeCol = i;
      if (headers[i] === 'PhoneWork') phoneWorkCol = i;
      if (headers[i] === 'PhoneCell') phoneCellCol = i;
    }

    if (systemIdCol === -1) {
      Logger.log('SystemId column not found in UserPhones sheet - participant phones will be empty');
      return {};
    }

    // Build the map
    var phoneMap = {};
    for (var row = 1; row < data.length; row++) {
      var systemId = data[row][systemIdCol];
      if (systemId) {
        phoneMap[String(systemId)] = {
          home: phoneHomeCol >= 0 ? String(data[row][phoneHomeCol] || '') : '',
          work: phoneWorkCol >= 0 ? String(data[row][phoneWorkCol] || '') : '',
          cell: phoneCellCol >= 0 ? String(data[row][phoneCellCol] || '') : ''
        };
      }
    }

    Logger.log('Built phone map with ' + Object.keys(phoneMap).length + ' entries');
    return phoneMap;

  } catch (e) {
    Logger.log('Error building user phone map: ' + e);
    return {};
  }
}

/**
 * Look up phone numbers for a comma-separated list of participant IDs
 * Returns an object with arrays of home, work, and cell phones
 */
function lookupParticipantPhones_(participantIds, phoneMap) {
  var homePhones = [];
  var workPhones = [];
  var cellPhones = [];

  if (!participantIds || !phoneMap) {
    return { home: '', work: '', cell: '' };
  }

  // Split the comma-separated IDs
  var ids = String(participantIds).split(',').map(function(id) {
    return id.trim();
  }).filter(function(id) {
    return id !== '';
  });

  // Look up each ID
  ids.forEach(function(id) {
    var phones = phoneMap[id];
    if (phones) {
      if (phones.home) homePhones.push(phones.home);
      if (phones.work) workPhones.push(phones.work);
      if (phones.cell) cellPhones.push(phones.cell);
    }
  });

  return {
    home: homePhones.join(', '),
    work: workPhones.join(', '),
    cell: cellPhones.join(', ')
  };
}

/**
 * Read all data from the ScheduledEvents warehouse sheet
 * Returns an array of objects with the data
 */
function readScheduledEventsWarehouse_() {
  var ss = SpreadsheetApp.getActive();
  var warehouseSheet = ss.getSheetByName('ScheduledEvents');

  if (!warehouseSheet) {
    throw new Error('ScheduledEvents warehouse sheet not found');
  }

  var lastRow = warehouseSheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log('ScheduledEvents warehouse is empty');
    return [];
  }

  var lastCol = warehouseSheet.getLastColumn();
  var data = warehouseSheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = data[0];

  // Convert to array of objects
  var records = [];
  for (var i = 1; i < data.length; i++) {
    var record = {};
    for (var j = 0; j < headers.length; j++) {
      record[headers[j]] = data[i][j];
    }
    records.push(record);
  }

  Logger.log('Read ' + records.length + ' records from ScheduledEvents warehouse');
  return records;
}

/**
 * Filter and transform warehouse data for the view
 * Applies business rules and selects specific columns
 */
function createScheduledEventsView_(warehouseRecords) {
  var filtered = [];

  Logger.log('Filtering ' + warehouseRecords.length + ' warehouse records for view');

  // Build phone lookup map from UserPhones sheet
  var phoneMap = buildUserPhoneMap_();

  warehouseRecords.forEach(function(record) {
    // Skip canceled sessions
    if (record.SessionStatus && String(record.SessionStatus).toLowerCase() === 'canceled') {
      return;
    }

    // Skip sessions with no participants
    if (!record.ParticipantCount || Number(record.ParticipantCount) === 0) {
      return;
    }

    // Filter by CourtCaption - only include "Private Swim Lesson" or "Personal Training"
    var courtCaption = String(record.CourtCaption || '');
    if (courtCaption.indexOf('Private Swim Lesson') === -1 &&
        courtCaption.indexOf('Personal Training') === -1) {
      return;
    }

    // Format time fields - extract time from Date objects if needed
    var startTime = formatTimeValue_(record.StartTime);
    var endTime = formatTimeValue_(record.EndTime);

    // Create combined date+time values for sorting
    var dateStartTime = combineDateAndTime_(record.Date, startTime);
    var dateEndTime = combineDateAndTime_(record.Date, endTime);

    // Look up phone numbers for participants
    var phones = lookupParticipantPhones_(record.ParticipantIds, phoneMap);

    // Create view record with selected columns only
    filtered.push({
      'EventId': record.EventId || '',
      'CourtCaption': courtCaption,
      'Staff': record.Staff || '',
      'Location': record.Location || '',
      'Participants': record.Participants || '',
      'Emails': record.ParticipantEmails || '',
      'PhonesHome': phones.home,
      'PhonesWork': phones.work,
      'PhonesCell': phones.cell,
      'Date': record.Date || '',
      'StartTime': startTime,
      'EndTime': endTime,
      'DateStartTime': dateStartTime,
      'DateEndTime': dateEndTime
    });
  });

  Logger.log('Filtered to ' + filtered.length + ' view records (before consolidation)');

  // Consolidate records with matching key fields
  var consolidated = consolidateRecords_(filtered);

  Logger.log('Consolidated to ' + consolidated.length + ' view records (after consolidation)');
  return consolidated;
}

/**
 * Consolidate records that match on CourtCaption, Staff, Location, Participants, ParticipantEmails, and Date
 * For matching records, use the earliest StartTime and latest EndTime
 */
function consolidateRecords_(records) {
  if (!records || records.length === 0) return [];

  // Group records by key fields
  var groups = {};

  records.forEach(function(record) {
    // Create a composite key from the matching fields
    var key = [
      record.CourtCaption || '',
      record.Staff || '',
      record.Location || '',
      record.Participants || '',
      record.Emails || '',
      formatDateKey_(record.Date)
    ].join('|||');

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(record);
  });

  // Consolidate each group
  var consolidated = [];
  for (var key in groups) {
    if (Object.prototype.hasOwnProperty.call(groups, key)) {
      var group = groups[key];

      if (group.length === 1) {
        // No consolidation needed
        consolidated.push(group[0]);
      } else {
        // Find earliest start time and latest end time
        var earliest = group[0];
        var latest = group[0];

        for (var i = 1; i < group.length; i++) {
          var current = group[i];

          // Compare start times
          if (compareTimeStrings_(current.StartTime, earliest.StartTime) < 0) {
            earliest = current;
          }

          // Compare end times
          if (compareTimeStrings_(current.EndTime, latest.EndTime) > 0) {
            latest = current;
          }
        }

        // Create consolidated record using first record as base
        // Recalculate DateStartTime and DateEndTime with consolidated times
        var dateStartTime = combineDateAndTime_(group[0].Date, earliest.StartTime);
        var dateEndTime = combineDateAndTime_(group[0].Date, latest.EndTime);

        var consolidatedRecord = {
          'EventId': group[0].EventId,
          'CourtCaption': group[0].CourtCaption,
          'Staff': group[0].Staff,
          'Location': group[0].Location,
          'Participants': group[0].Participants,
          'Emails': group[0].Emails,
          'PhonesHome': group[0].PhonesHome,
          'PhonesWork': group[0].PhonesWork,
          'PhonesCell': group[0].PhonesCell,
          'Date': group[0].Date,
          'StartTime': earliest.StartTime,
          'EndTime': latest.EndTime,
          'DateStartTime': dateStartTime,
          'DateEndTime': dateEndTime
        };

        consolidated.push(consolidatedRecord);
      }
    }
  }

  return consolidated;
}

/**
 * Format a date value into a consistent string key for grouping
 */
function formatDateKey_(dateValue) {
  if (!dateValue) return '';

  if (dateValue instanceof Date) {
    var year = dateValue.getFullYear();
    var month = String(dateValue.getMonth() + 1).padStart(2, '0');
    var day = String(dateValue.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  return String(dateValue);
}

/**
 * Compare two time strings in format "HH:MM AM/PM"
 * Returns: -1 if time1 < time2, 0 if equal, 1 if time1 > time2
 */
function compareTimeStrings_(time1, time2) {
  if (!time1 && !time2) return 0;
  if (!time1) return 1;
  if (!time2) return -1;

  var t1 = parseTimeString_(time1);
  var t2 = parseTimeString_(time2);

  if (t1 < t2) return -1;
  if (t1 > t2) return 1;
  return 0;
}

/**
 * Parse a time string "H:MM AM/PM" into minutes since midnight for comparison
 */
function parseTimeString_(timeStr) {
  if (!timeStr) return 0;

  var str = String(timeStr).trim().toUpperCase();
  var match = str.match(/(\d+):(\d+)\s*(AM|PM)/);

  if (!match) return 0;

  var hours = parseInt(match[1], 10);
  var minutes = parseInt(match[2], 10);
  var period = match[3];

  // Convert to 24-hour format
  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }

  return hours * 60 + minutes;
}

/**
 * Format a time value - handles both Date objects and time strings
 * Returns time in HH:MM format
 */
function formatTimeValue_(value) {
  if (!value) return '';

  // If it's a Date object, extract the time portion
  if (value instanceof Date) {
    var hours = value.getHours();
    var minutes = value.getMinutes();
    var ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return hours + ':' + minutes + ' ' + ampm;
  }

  // If it's already a string, return as-is
  return String(value);
}

/**
 * Combine a date and time string into a single datetime value for sorting
 * Returns a Date object that can be used for sorting
 */
function combineDateAndTime_(dateValue, timeString) {
  if (!dateValue || !timeString) return '';

  var date;
  if (dateValue instanceof Date) {
    date = new Date(dateValue.getTime()); // Clone the date
  } else {
    date = new Date(dateValue);
  }

  // Parse the time string (format: "H:MM AM/PM")
  var timeMatch = String(timeString).trim().toUpperCase().match(/(\d+):(\d+)\s*(AM|PM)/);
  if (timeMatch) {
    var hours = parseInt(timeMatch[1], 10);
    var minutes = parseInt(timeMatch[2], 10);
    var period = timeMatch[3];

    // Convert to 24-hour format
    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }

    // Set the time on the date
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  return dateValue; // Fallback to just the date if time parsing fails
}

/**
 * Write the view data to the Data Views spreadsheet
 */
function writeScheduledEventsView_(viewRecords) {
  var viewSS = getDataViewsSpreadsheet_();
  var sheetName = 'ScheduledEvents';

  // Define the columns for the view
  var viewColumns = [
    'EventId',
    'CourtCaption',
    'Staff',
    'Location',
    'Participants',
    'Emails',
    'PhonesHome',
    'PhonesWork',
    'PhonesCell',
    'Date',
    'StartTime',
    'EndTime',
    'DateStartTime',
    'DateEndTime'
  ];

  // Get or create the sheet
  var sheet = viewSS.getSheetByName(sheetName);
  if (!sheet) {
    sheet = viewSS.insertSheet(sheetName);
  }

  // Clear existing data
  if (sheet.getLastRow() > 0) {
    sheet.clear();
  }

  // Write header
  sheet.appendRow(viewColumns);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, viewColumns.length).setFontWeight('bold');

  // Write data
  if (viewRecords.length > 0) {
    var rowData = viewRecords.map(function(record) {
      return viewColumns.map(function(col) {
        return record[col] || '';
      });
    });

    sheet.getRange(2, 1, rowData.length, viewColumns.length).setValues(rowData);
  }

  Logger.log('Wrote ' + viewRecords.length + ' records to ' + sheetName + ' view');
  return viewRecords.length;
}

/**
 * Main function to update the ScheduledEvents view
 * Call this after updating the warehouse to refresh the view
 */
function updateScheduledEventsView() {
  try {
    Logger.log('=== Starting ScheduledEvents View Update ===');

    // Read warehouse data
    var warehouseRecords = readScheduledEventsWarehouse_();

    // Apply filtering and column selection
    var viewRecords = createScheduledEventsView_(warehouseRecords);

    // Write to Data Views spreadsheet
    var rowCount = writeScheduledEventsView_(viewRecords);

    Logger.log('=== ScheduledEvents View Update Complete: ' + rowCount + ' records ===');
    return rowCount;

  } catch (e) {
    Logger.log('ERROR in updateScheduledEventsView: ' + e);
    throw e;
  }
}
