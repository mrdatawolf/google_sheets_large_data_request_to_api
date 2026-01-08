/**
 * Schedule Events Report - Fetches scheduled events from Daxko API
 *
 * This module handles fetching and flattening scheduled events data.
 * Unlike other reports, this clears the sheet before writing new data each time.
 */

/**
 * Get the number of days to fetch from ScriptProperties
 * Default to 2 days if not set
 */
function getScheduleEventsDays_() {
  var days = getProp_('SCHEDULE_EVENTS_DAYS');
  if (!days) {
    return 2; // Default to 2 days
  }
  return Number(days);
}

/**
 * Build a map of SystemId -> Email from the Users sheet
 * Returns an object with SystemId as key and Email as value
 */
function buildUserEmailMap_() {
  try {
    var ss = SpreadsheetApp.getActive();
    var usersSheet = ss.getSheetByName('Users');

    if (!usersSheet) {
      Logger.log('Users sheet not found - participant emails will be empty');
      return {};
    }

    var lastRow = usersSheet.getLastRow();
    if (lastRow <= 1) {
      Logger.log('Users sheet is empty - participant emails will be empty');
      return {};
    }

    var lastCol = usersSheet.getLastColumn();
    var data = usersSheet.getRange(1, 1, lastRow, lastCol).getValues();
    var headers = data[0];

    // Find SystemId and Email column indices
    var systemIdCol = -1;
    var emailCol = -1;
    for (var i = 0; i < headers.length; i++) {
      if (headers[i] === 'SystemId') systemIdCol = i;
      if (headers[i] === 'Email') emailCol = i;
    }

    if (systemIdCol === -1 || emailCol === -1) {
      Logger.log('SystemId or Email column not found in Users sheet - participant emails will be empty');
      return {};
    }

    // Build the map
    var emailMap = {};
    for (var row = 1; row < data.length; row++) {
      var systemId = data[row][systemIdCol];
      var email = data[row][emailCol];
      if (systemId && email) {
        emailMap[String(systemId)] = String(email);
      }
    }

    Logger.log('Built email map with ' + Object.keys(emailMap).length + ' entries');
    return emailMap;

  } catch (e) {
    Logger.log('Error building user email map: ' + e);
    return {};
  }
}

/**
 * Set the number of days to fetch for schedule events
 */
function setScheduleEventsDays_(numDays) {
  setProp_('SCHEDULE_EVENTS_DAYS', String(numDays));
  Logger.log('Schedule events days set to: ' + numDays);
}

/**
 * Fetch schedule events from the API
 * This is a GET request, not a POST like other reports
 */
function fetchScheduleEvents_(body, page, ctx) {
  ctx = ctx || this;

  // Get current date in YYYY-MM-DD format
  var today = new Date();
  var year = today.getFullYear();
  var month = String(today.getMonth() + 1).padStart(2, '0');
  var day = String(today.getDate()).padStart(2, '0');
  var startDate = year + '-' + month + '-' + day;

  // Get numDays from script properties
  var numDays = getScheduleEventsDays_();

  // Build URL with query parameters
  var url = ctx.apiUrl + '?startDate=' + startDate + '&numDays=' + numDays;
  Logger.log("url: " + url)
  // Make GET request with authentication
  var attempt = 0;
  var backoff = (ctx.daxko && ctx.daxko.initialBackoffMs) || 1000;
  var maxRetries = (ctx.daxko && ctx.daxko.maxRetries) || 3;

  while (attempt <= maxRetries) {
    try {
      var resp = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: daxkoHeaders_(),
        muteHttpExceptions: true
      });

      var code = resp.getResponseCode();
      var text = safeGetText_(resp);

      if (code >= 200 && code < 300) {
        // Parse the response
        var json = JSON.parse(text);

        // Extract events from data.events
        var events = (json && json.data && json.data.events) || [];

        Logger.log('API returned ' + events.length + ' events');

        return {
          payloadText: text,
          records: events,
          rowCount: events.length
        };
      }

      // Handle auth errors
      if ((code === 401 || code === 403) && attempt === 0) {
        refreshAccessToken_();
        attempt++;
        continue;
      }

      // Handle rate limiting and server errors
      if ((code === 429 || code >= 500) && attempt < maxRetries) {
        Utilities.sleep(backoff);
        backoff *= 2;
        attempt++;
        continue;
      }

      throw new Error('HTTP ' + code + ': ' + (text ? text.substring(0, 500) : ''));

    } catch (err) {
      if (attempt < maxRetries) {
        Utilities.sleep(backoff);
        backoff *= 2;
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

/**
 * Flatten schedule events data
 * Each event can have multiple sessions, so we create one row per session
 */
function flattenScheduleEvents_(eventsArr) {
  var flattened = [];

  Logger.log('Flattening ' + eventsArr.length + ' events');

  // Build email lookup map from Users sheet
  var emailMap = buildUserEmailMap_();

  eventsArr.forEach(function(event) {
    var sessions = event.sessions || [];

    sessions.forEach(function(session) {
      var participants = session.participants || [];

      // Extract staff names
      var staffNames = (session.staff || []).map(function(s) {
        return s.name || '';
      }).join(', ');

      // Extract room names
      var roomNames = (session.rooms || []).map(function(r) {
        return r.name || '';
      }).join(', ');

      // Extract resource names
      var resources = (session.resources || []).join(', ');

      // Extract participant names
      var participantNames = participants.map(function(p) {
        return p.name || '';
      }).join(', ');

      // Extract participant IDs
      var participantIds = participants.map(function(p) {
        return p.id || '';
      }).filter(function(id) { return id !== ''; }).join(', ');

      // Look up participant emails from Users sheet
      var participantEmails = participants.map(function(p) {
        var id = p.id;
        if (id && emailMap[String(id)]) {
          return emailMap[String(id)];
        }
        return '';
      }).filter(function(email) { return email !== ''; }).join(', ');

      // Extract participant count
      var participantCount = participants.length;

      // Create flattened record
      flattened.push({
        'EventId': event.id,
        'EventName': event.name,
        'EventType': event.type,
        'ComponentId': event.component ? event.component.id : '',
        'ComponentName': event.component ? event.component.name : '',
        'SessionId': session.id,
        'SessionStatus': session.status,
        'CourtCaption': session.courtCaption,
        'Staff': staffNames,
        'Rooms': roomNames,
        'Resources': resources,
        'Location': session.location,
        'Participants': participantNames,
        'ParticipantIds': participantIds,
        'ParticipantEmails': participantEmails,
        'ParticipantCount': participantCount,
        'Date': session.date,
        'StartTime': session.startTime,
        'EndTime': session.endTime,
        'SetupTimeIncluded': session.setupTimeIncluded,
        'CleanUpTimeIncluded': session.cleanUpTimeIncluded,
        'Notes': event.notes || '',
        'CanWaiveCancellationFee': event.canWaiveCancellationFee
      });
    });
  });

  Logger.log('Flattened to ' + flattened.length + ' session records (warehouse - unfiltered)');

  return { main: flattened };
}
