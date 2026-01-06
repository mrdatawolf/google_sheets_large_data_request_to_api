/**
 * Schedule Events Report - Fetches scheduled events from Daxko API
 *
 * This module handles fetching and flattening scheduled events data.
 * Unlike other reports, this clears the sheet before writing new data each time.
 */

/**
 * Get the number of days to fetch from ScriptProperties
 * Default to 7 days if not set
 */
function getScheduleEventsDays_() {
  var days = getProp_('SCHEDULE_EVENTS_DAYS');
  if (!days) {
    return 7; // Default to 7 days
  }
  return Number(days);
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

  eventsArr.forEach(function(event) {
    var sessions = event.sessions || [];

    sessions.forEach(function(session) {
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

      // Extract participant count
      var participantCount = (session.participants || []).length;

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

  return { main: flattened };
}
