/**
 * Shared styles for HTML email formatting.
 */
var EMAIL_STYLES = {
  table: 'border="0" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:13px;"',
  labelCell: 'color:#666;padding:4px 10px 4px 0;white-space:nowrap;',
  valueCell: 'font-weight:600;padding:4px 0;',
  errorBlock: 'margin-top:12px;color:#a00;font-weight:600;',
  errorPre: 'background:#fdf2f2;border:1px solid #f2caca;border-radius:4px;padding:8px;white-space:pre-wrap;font-size:12px;',
  container: 'font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#222;line-height:1.4;',
  header: 'font-size:16px;font-weight:700;margin-bottom:8px;',
  footer: 'margin-top:16px;color:#666;'
};

/**
 * Escapes HTML for safe rendering.
 */
function escapeHtml_(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

/**
 * Resolves recipients from CONFIG.notifications.to or Script property DIGEST_TO.
 */
function getDigestRecipients_() {
  if (CONFIG.notifications && CONFIG.notifications.to && CONFIG.notifications.to.length) {
    return CONFIG.notifications.to.slice();
  }
  var raw = (PropertiesService.getScriptProperties().getProperty('DIGEST_TO') || '').trim();
  if (!raw) return [];
  return raw.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
}

/**
 * Determines whether notifications should be sent for this run.
 */
function notificationsEnabled_(info) {
  if (!CONFIG.notifications || !CONFIG.notifications.enabled) return false;
  var isError = String(info.status).toUpperCase() === 'ERROR';
  if (isError && !CONFIG.notifications.sendOnError) return false;
  if (!isError && !CONFIG.notifications.sendOnSuccess) return false;
  return getDigestRecipients_().length > 0;
}

/**
 * Builds the subject line for digest emails.
 */
function buildDigestSubject_(info, prefix) {
  return `${prefix} ${info.status} · +${info.appended || 0} / ~${info.updated || 0} · pgs ${info.pagesFetched || 0}`;
}

/**
 * Builds the plain text body for digest emails.
 */
function buildDigestBodyText_(info, sheetName, auditSheet) {
  var ms = Number(info.durationMs || 0);
  var durationMin = (ms / 60000).toFixed(2);
  return [
    'Sheet: ' + sheetName,
    'Audit: ' + auditSheet,
    'Status: ' + (info.status || 'UNKNOWN'),
    'Pages fetched: ' + (info.pagesFetched || 0),
    'Header rows: +' + (info.appended || 0) + ', ~' + (info.updated || 0),
    'Charge rows: +' + (info.txChargeAppended || 0) + ', ~' + (info.txChargeUpdated || 0),
    'Raw files saved: ' + (info.rawFilesSaved || 0),
    'Resume saved page: ' + (info.resumeSavedPage || ''),
    'Duration: ' + durationMin + ' min',
    info.error ? ('Error: ' + info.error) : ''
  ].filter(Boolean).join('\n');
}

/**
 * Centralized digest sender. Chooses plain or HTML format based on CONFIG.notifications.useHtml.
 */
function sendDigestNotification_(info) {
  if (info.dryRun) {
    Logger.log('Digest skipped: dryRun mode enabled.');
    return;
  }

  if (!notificationsEnabled_(info)) {
    Logger.log('Digest skipped: notifications not enabled or no recipients.');
    return;
  }

  var recipients = getDigestRecipients_();
  if (CONFIG.notifications.useHtml) {
    sendRunDigestEmailWithOverrides_(info, recipients);
  } else {
    sendRunDigestEmailFor_(info, {
      subjectPrefix: CONFIG.notifications.subjectPrefix,
      sheetName: CONFIG.sheetName,
      auditSheet: CONFIG.audit && CONFIG.audit.sheetName
    });
  }
}

/**
 * Plain text digest email.
 */
function sendRunDigestEmailFor_(info, options) {
  var subjectPrefix = options.subjectPrefix || '[Daxko Report]';
  var sheetName = options.sheetName || 'Unknown Sheet';
  var auditSheet = options.auditSheet || 'Unknown Audit';

  var recipients = getDigestRecipients_();
  if (!recipients.length) { Logger.log('Digest (plain): no recipients configured'); return; }

  var subject = buildDigestSubject_(info, subjectPrefix);
  var body = buildDigestBodyText_(info, sheetName, auditSheet);

  MailApp.sendEmail({
    to: recipients.join(','),
    subject: subject,
    body: body
  });

  Logger.log('Digest email sent:\n' + body);
}

/**
 * HTML digest email with overrides.
 */
function sendRunDigestEmailWithOverrides_(info, recipients) {
  var list = (recipients && recipients.length) ? recipients : getDigestRecipients_();
  if (!list.length) { Logger.log('Digest: no recipients configured'); return; }

  var tz = Session.getScriptTimeZone() || 'Etc/GMT';
  var tsDate = info.runTimestamp ? new Date(info.runTimestamp) : new Date();
  var ts = Utilities.formatDate(tsDate, tz, 'yyyy-MM-dd HH:mm:ss');

  var subject = buildDigestSubject_(info, (CONFIG.notifications && CONFIG.notifications.subjectPrefix) || '[Daxko]');

  var rows = [
    ['Run time', ts],
    ['Status', info.status],
    ['Additions', info.appended || 0],
    ['Updates', info.updated || 0],
    ['Pages fetched', info.pagesFetched || 0],
    ['Last non-empty page', info.lastNonEmptyPage || ''],
    ['Refreshed token', info.refreshed || 'no'],
    ['Duration (ms)', info.durationMs || 0]
  ];

  var tableHtml = '<table ' + EMAIL_STYLES.table + '>' +
    rows.map(function(r){
      return '<tr><td style="' + EMAIL_STYLES.labelCell + '">' + escapeHtml_(r[0]) + '</td>' +
             '<td style="' + EMAIL_STYLES.valueCell + '">' + escapeHtml_(String(r[1])) + '</td></tr>';
    }).join('') + '</table>';

  var errBlock = '';
  if (info.error) {
    errBlock = '<div style="' + EMAIL_STYLES.errorBlock + '">Error</div>' +
               '<pre style="' + EMAIL_STYLES.errorPre + '">' + escapeHtml_(String(info.error)) + '</pre>';
  }

  var sheetNameLabel = info._sheetNameOverride || CONFIG.sheetName || '';
  var auditNameLabel = info._auditSheetOverride || (CONFIG.audit && CONFIG.audit.sheetName) || '';

  var html = '<div style="' + EMAIL_STYLES.container + '">' +
               '<div style="' + EMAIL_STYLES.header + '">Daily Digest</div>' +
               tableHtml + errBlock +
               '<div style="' + EMAIL_STYLES.footer + '">Sheet: <b>' + escapeHtml_(sheetNameLabel) +
               '</b> · Audit sheet: <b>' + escapeHtml_(auditNameLabel) + '</b></div>' +
             '</div>';

  MailApp.sendEmail({ to: list.join(','), subject: subject, htmlBody: html, name: 'Daxko Ingest' });
  Logger.log('HTML digest email sent to: ' + list.join(','));
}