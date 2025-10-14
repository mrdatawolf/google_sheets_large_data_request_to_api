/**
 * Persist / manage resume state (last non-empty page).
 */

function getResumeState_() {
  var s = PropertiesService.getScriptProperties().getProperty(CONFIG.stateKey);
  if (!s) return null;
  try { return JSON.parse(s); } catch (_) { return null; }
}

function setResumeState_(obj) {
  PropertiesService.getScriptProperties().setProperty(CONFIG.stateKey, JSON.stringify(obj));
}

function resetResumeState_() {
  PropertiesService.getScriptProperties().deleteProperty(CONFIG.stateKey);
  Logger.log('Resume state cleared.');
}

function forceResumePage_(pageNumber) {
  PropertiesService.getScriptProperties().setProperty(CONFIG.stateKey, JSON.stringify({
    page: Number(pageNumber),
    pageSize: Number(CONFIG.request.pageSize),
    format: String(CONFIG.request.format).toLowerCase(),
    updatedAt: new Date().toISOString()
  }));
  Logger.log('Forced resume state to page ' + pageNumber + '.');
}