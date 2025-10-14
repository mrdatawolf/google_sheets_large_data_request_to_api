/**
 * Token handling (access + refresh), and bootstrap helpers.
 */

function daxkoHeaders_() {
  var token = getAccessToken_();
  return {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json'
  };
}

function getAccessToken_() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('DAXKO_ACCESS_TOKEN');
  var expAt = Number(props.getProperty('DAXKO_ACCESS_EXPIRES_AT') || 0);
  var now = Date.now();

  if (!token || now >= (expAt - 60000)) {
    refreshAccessToken_();
    token = props.getProperty('DAXKO_ACCESS_TOKEN');
    if (!token) throw new Error('Failed to obtain access token after refresh.');
  }
  return token;
}

function refreshAccessToken_() {
  var props = PropertiesService.getScriptProperties();
  var tokenUrl = (props.getProperty('DAXKO_TOKEN_URL') || '').trim();
  var refreshToken = (props.getProperty('DAXKO_REFRESH_TOKEN') || '').trim();
  var clientId = (props.getProperty('DAXKO_CLIENT_ID') || '').trim();

  if (!tokenUrl || !refreshToken || !clientId) {
    throw new Error('Missing DAXKO_TOKEN_URL or DAXKO_REFRESH_TOKEN or DAXKO_CLIENT_ID.');
  }

  var payload = {
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  };

  var resp = UrlFetchApp.fetch(tokenUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = resp.getResponseCode();
  var text = safeGetText_(resp);
  if (code < 200 || code >= 300) {
    throw new Error('Refresh failed HTTP ' + code + ': ' + (text ? text.substring(0, 300) : ''));
  }

  var json = JSON.parse(text);
  var accessToken = json.access_token || json.accessToken;
  var expiresIn = Number(json.expires_in || json.expiresIn || 3600);
  var rotatedRefresh = json.refresh_token || json.refreshToken;

  if (!accessToken) throw new Error('No access_token in refresh response.');
  var expAt = Date.now() + expiresIn * 1000;

  props.setProperty('DAXKO_ACCESS_TOKEN', accessToken);
  props.setProperty('DAXKO_ACCESS_EXPIRES_AT', String(expAt));
  if (rotatedRefresh && rotatedRefresh !== refreshToken) {
    props.setProperty('DAXKO_REFRESH_TOKEN', rotatedRefresh);
  }

  RUN_FLAGS.didRefresh = true;
}

/** Universal bootstrap:
 *  A) If DAXKO_REFRESH_TOKEN exists → refresh to get fresh access token
 *  B) Else if CLIENT_SECRET + SCOPE exist → run client_credentials once
 */
function BootstrapDaxkoTokens() { bootstrapDaxkoTokens_Universal_(); }

function bootstrapDaxkoTokens_Universal_() {
  var props = PropertiesService.getScriptProperties();

  var tokenUrl = (props.getProperty('DAXKO_TOKEN_URL') || '').trim();
  var clientId = (props.getProperty('DAXKO_CLIENT_ID') || '').trim();
  var refreshToken = (props.getProperty('DAXKO_REFRESH_TOKEN') || '').trim();
  var clientSecret = (props.getProperty('DAXKO_CLIENT_SECRET') || '').trim();
  var scope = (props.getProperty('DAXKO_SCOPE') || '').trim();

  if (!tokenUrl || !clientId) throw new Error('Missing DAXKO_TOKEN_URL or DAXKO_CLIENT_ID.');

  if (refreshToken) {
    var bodyA = { client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken };
    var respA = UrlFetchApp.fetch(tokenUrl, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(bodyA), muteHttpExceptions: true
    });
    var textA = safeGetText_(respA);
    if (respA.getResponseCode() < 200 || respA.getResponseCode() >= 300) {
      throw new Error('Refresh bootstrap failed HTTP ' + respA.getResponseCode() + ': ' + (textA ? textA.substring(0,500) : ''));
    }
    persistTokensFromAuthResponse_(JSON.parse(textA));
    Logger.log('Bootstrap (refresh path) successful.');
    return;
  }

  if (clientSecret && scope) {
    var bodyB = { client_id: clientId, client_secret: clientSecret, scope: scope, grant_type: 'client_credentials' };
    var respB = UrlFetchApp.fetch(tokenUrl, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(bodyB), muteHttpExceptions: true
    });
    var textB = safeGetText_(respB);
    if (respB.getResponseCode() < 200 || respB.getResponseCode() >= 300) {
      throw new Error('Client-credentials bootstrap failed HTTP ' + respB.getResponseCode() + ': ' + (textB ? textB.substring(0,500) : ''));
    }
    persistTokensFromAuthResponse_(JSON.parse(textB));
    Logger.log('Bootstrap (client_credentials path) successful.');
    return;
  }

  throw new Error('Bootstrap needs either DAXKO_REFRESH_TOKEN, or DAXKO_CLIENT_SECRET + DAXKO_SCOPE.');
}

function persistTokensFromAuthResponse_(json) {
  var props = PropertiesService.getScriptProperties();
  var accessToken  = json.access_token || json.accessToken;
  var refreshToken = json.refresh_token || json.refreshToken;
  var expiresInSec = Number(json.expires_in || json.expiresIn || 3600);
  if (!accessToken) throw new Error('Auth response missing access_token.');
  var expAt = Date.now() + expiresInSec * 1000;
  props.setProperty('DAXKO_ACCESS_TOKEN', accessToken);
  props.setProperty('DAXKO_ACCESS_EXPIRES_AT', String(expAt));
  if (refreshToken) props.setProperty('DAXKO_REFRESH_TOKEN', refreshToken);
}