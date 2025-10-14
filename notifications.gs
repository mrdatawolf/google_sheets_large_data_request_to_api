/**
 * Daily digest email for Report 1.
 * Sends one email at the end of runDaxkoReport1Daily() using the 'info' summary we already log.
 */

function sendRunDigestEmail_(info) {
  if (!CONFIG.notifications || !CONFIG.notifications.enabled) return;

  var isError = String(info.status).toUpperCase() === 'ERROR';
  if (isError && !CONFIG.notifications.sendOnError) return;
  if (!isError && !CONFIG.notifications.sendOnSuccess) return;

  var recipients = getDigestRecipients_();
  if (!recipients.length) {
    Logger.log('Digest: no recipients configured (set DIGEST_TO or CONFIG.notifications.to)');
    return;
  }

  var tz = Session.getScriptTimeZone() || 'Etc/GMT';
  var ts = Utilities.formatDate(new Date(info.runTimestamp), tz, 'yyyy-MM-dd HH:mm:ss');

  var subject = (CONFIG.notifications.subjectPrefix || '[Daxko Report1]') +
                ' ' + info.status +
                ' · +' + (info.appended || 0) +
                ' / ~' + (info.updated || 0) +
                ' · pgs ' + (info.pagesFetched || 0);

  var rows = [
    ['Run time', ts],
    ['Status', info.status],
    ['Additions', info.appended || 0],
    ['Updates', info.updated || 0],
    ['Pages fetched', info.pagesFetched || 0],
    ['Last non-empty page', info.lastNonEmptyPage || ''],
    ['Parse mode', info.parseMode || ''],
    ['CSV sanitized', info.csvSanitized || 'no'],
    ['Refreshed token', info.refreshed || 'no'],
    ['Resume saved page', info.resumeSavedPage || ''],
    ['Duration (ms)', info.durationMs || 0]
  ];

  var tableHtml = '<table border="0" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:13px;">' +
                  rows.map(function(r){
                    return '<tr>' +
                           '<td style="color:#666;padding:4px 10px 4px 0;white-space:nowrap;">' + escapeHtml_(r[0]) + '</td>' +
                           '<td style="font-weight:600;padding:4px 0;">' + escapeHtml_(String(r[1])) + '</td>' +
                           '</tr>';
                  }).join('') + '</table>';

  var errBlock = '';
  if (info.error) {
    errBlock = '<div style="margin-top:12px;color:#a00;font-weight:600;">Error</div>' +
               '<pre style="background:#fdf2f2;border:1px solid #f2caca;border-radius:4px;padding:8px;white-space:pre-wrap;font-size:12px;">' +
               escapeHtml_(String(info.error)) + '</pre>';
  }

  var html = '' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#222;line-height:1.4;">' +
      '<div style="font-size:16px;font-weight:700;margin-bottom:8px;">Daxko Report 1 — Daily Digest</div>' +
      tableHtml +
      errBlock +
      '<div style="margin-top:16px;color:#666;">' +
      'Sheet: <b>' + escapeHtml_(CONFIG.sheetName) + '</b> · Audit sheet: <b>' + escapeHtml_(CONFIG.audit.sheetName) + '</b>' +
      '</div>' +
    '</div>';

  try {
    MailApp.sendEmail({
      to: recipients.join(','),
      subject: subject,
      htmlBody: html,
      name: 'Daxko Ingest'
    });
    Logger.log('Digest email sent to: ' + recipients.join(','));
  } catch (e) {
    Logger.log('Digest email failed: ' + e);
  }
}

/** Resolve recipients from CONFIG.notifications.to or Script property DIGEST_TO (comma-separated). */
function getDigestRecipients_() {
  if (CONFIG.notifications && CONFIG.notifications.to && CONFIG.notifications.to.length) {
    return CONFIG.notifications.to.slice();
  }
  var raw = (PropertiesService.getScriptProperties().getProperty('DIGEST_TO') || '').trim();
  if (!raw) return [];
  return raw.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
}

/** Helper to set the DIGEST_TO property programmatically (run once, then remove). */
function setDigestRecipients_() {
  var recipients = 'you@example.com, ops@example.com'; // <-- replace and run once
  PropertiesService.getScriptProperties().setProperty('DIGEST_TO', recipients);
  Logger.log('Set DIGEST_TO to: ' + recipients);
}

/** Basic HTML escaper for safe email rendering. */
function escapeHtml_(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}