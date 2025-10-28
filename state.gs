/**
 * Persist / manage resume state (last non-empty page).
 * DRY notes:
 *  - Centralizes JSON property get/set/delete.
 *  - Normalizes the forced resume state in one place.
 *  - Keeps original public function names/signatures intact.
 */

/** Low-level JSON property helpers (DRY) **/
function getJSONProp_(key) {
  var raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function setJSONProp_(key, obj) {
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(obj));
}

function deleteProp_(key) {
  PropertiesService.getScriptProperties().deleteProperty(key);
}

/** Public API (unchanged names) **/
function getResumeState_() {
  return getJSONProp_(CONFIG.stateKey);
}

function setResumeState_(obj) {
  // Preserve legacy behavior: write exactly what the caller provides.
  setJSONProp_(CONFIG.stateKey, obj);
}

function resetResumeState_() {
  deleteProp_(CONFIG.stateKey);
  Logger.log('Resume state cleared.');
}

function forceResumePage_(pageNumber) {
  var fmt = (CONFIG && CONFIG.request && CONFIG.request.format != null)
    ? String(CONFIG.request.format).toLowerCase()
    : 'json';
  var size = (CONFIG && CONFIG.request && CONFIG.request.pageSize != null)
    ? Number(CONFIG.request.pageSize)
    : 1;

  PropertiesService.getScriptProperties().setProperty(CONFIG.stateKey, JSON.stringify({
    page: Math.max(1, Number(pageNumber) || 1),
    pageSize: Math.max(1, size || 1),
    format: fmt,
    updatedAt: new Date().toISOString()
  }));
  Logger.log('Forced resume state to page ' + pageNumber + '.');
}
/** Normalization utilities **/
function buildNormalizedResumeState_(patch) {
  var page = Number(patch && patch.page);
  if (!isFinite(page) || page < 1) page = 1;

  var pageSize = Number(CONFIG.request && CONFIG.request.pageSize);
  if (!isFinite(pageSize) || pageSize < 1) pageSize = 1;

  var format = (CONFIG.request && CONFIG.request.format != null)
    ? String(CONFIG.request.format).toLowerCase()
    : 'json';

  return {
    page: page,
    pageSize: pageSize,
    format: format,
    updatedAt: new Date().toISOString()
  };
}