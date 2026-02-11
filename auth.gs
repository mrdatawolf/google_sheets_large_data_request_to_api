/**
 * Token handling (access + refresh), and bootstrap helpers.
 */

function daxkoHeaders_() {
  return {
    Authorization: 'Bearer ' + getAccessToken_(),
    'Content-Type': 'application/json'
  };
}

/**
 * Returns a valid access token, refreshing if needed.
 */
function getAccessToken_() {
  var token = getProp_('DAXKO_ACCESS_TOKEN');
  var expAt = Number(getProp_('DAXKO_ACCESS_EXPIRES_AT') || 0);
  var now = Date.now();

  if (!token || now >= (expAt - 60000)) {
    refreshAccessToken_();
    token = getProp_('DAXKO_ACCESS_TOKEN');
    if (!token) throw new Error('Failed to obtain access token after refresh.');
  }
  return token;
}

/**
 * Refreshes the access token using the stored refresh token.
 */
function refreshAccessToken_() {
  var tokenUrl = getProp_('DAXKO_TOKEN_URL');
  var refreshToken = getProp_('DAXKO_REFRESH_TOKEN');
  var clientId = getProp_('DAXKO_CLIENT_ID');

  if (!tokenUrl || !refreshToken || !clientId) {
    throw new Error('Missing DAXKO_TOKEN_URL, DAXKO_REFRESH_TOKEN, or DAXKO_CLIENT_ID.');
  }

  var payload = {
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  };

  var resp = postJson_(tokenUrl, payload);
  persistTokensFromAuthResponse_(resp);
  RUN_FLAGS.didRefresh = true;
}

/**
 * Bootstrap entry point.
 */
function BootstrapDaxkoTokens() {
  bootstrapDaxkoTokens_Universal_();
}

/**
 * Bootstrap logic for refresh_token or client_credentials flows.
 */
function bootstrapDaxkoTokens_Universal_() {
  var tokenUrl = getProp_('DAXKO_TOKEN_URL');
  var clientId = getProp_('DAXKO_CLIENT_ID');
  var refreshToken = getProp_('DAXKO_REFRESH_TOKEN');
  var clientSecret = getProp_('DAXKO_CLIENT_SECRET');
  var scope = getProp_('DAXKO_SCOPE');

  if (!tokenUrl || !clientId) throw new Error('Missing DAXKO_TOKEN_URL or DAXKO_CLIENT_ID.');

  if (refreshToken) {
    var payload = {
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    };
    var resp = postJson_(tokenUrl, payload);
    persistTokensFromAuthResponse_(resp);
    Logger.log('Bootstrap (refresh path) successful.');
    return;
  }

  if (clientSecret && scope) {
    var payload = {
      client_id: clientId,
      client_secret: clientSecret,
      scope: scope,
      grant_type: 'client_credentials'
    };
    var resp = postJson_(tokenUrl, payload);
    persistTokensFromAuthResponse_(resp);
    Logger.log('Bootstrap (client_credentials path) successful.');
    return;
  }

  throw new Error('Bootstrap needs either DAXKO_REFRESH_TOKEN, or DAXKO_CLIENT_SECRET + DAXKO_SCOPE.');
}

/**
 * Parses and stores tokens from a successful auth response.
 */
function persistTokensFromAuthResponse_(json) {
  var accessToken = json.access_token || json.accessToken;
  var refreshToken = json.refresh_token || json.refreshToken;
  var expiresInSec = Number(json.expires_in || json.expiresIn || 3600);

  if (!accessToken) throw new Error('Auth response missing access_token.');

  var expAt = Date.now() + expiresInSec * 1000;
  setProp_('DAXKO_ACCESS_TOKEN', accessToken);
  setProp_('DAXKO_ACCESS_EXPIRES_AT', String(expAt));
  if (refreshToken) setProp_('DAXKO_REFRESH_TOKEN', refreshToken);
}

/**
 * Safely performs a POST request with JSON payload and parses the response.
 */
function postJson_(url, payload) {
  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = resp.getResponseCode();
  var text = safeGetText_(resp);
  if (code < 200 || code >= 300) {
    throw new Error('HTTP ' + code + ' error: ' + (text ? text.substring(0, 500) : ''));
  }

  return JSON.parse(text);
}

/**
 * Gets a script property by key.
 */
function getProp_(key) {
  return (PropertiesService.getScriptProperties().getProperty(key) || '').trim();
}

/**
 * Sets a script property by key.
 */
function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}