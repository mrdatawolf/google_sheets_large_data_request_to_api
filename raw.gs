/**
 * Raw payload storage (Drive).
 */

/**
 * Saves a raw payload to Drive, optionally gzipped.
 */
function saveRawPayload_(payloadText, pageNumber) {
  saveRawPayloadForConfig_(CONFIG, payloadText, pageNumber);
}

/**
 * Generic raw payload saver for any config.
 */
function saveRawPayloadForConfig_(config, payloadText, pageNumber) {
  var folder = getOrCreateFolderPath_(config.raw.driveFolderPath);
  var timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  var ext = String(config.request.format || 'json').toLowerCase(); // 'json' | 'csv'
  var filename = `report_${timestamp}_p${pageNumber}.${ext}`;

  if (config.raw.gzip) {
    var mime = ext === 'json' ? 'application/json' : 'text/csv';
    var blob = Utilities.newBlob(payloadText, mime, filename);
    var gzBlob = Utilities.gzip(blob, filename + '.gz');
    folder.createFile(gzBlob);
  } else {
    folder.createFile(filename, payloadText, MimeType.PLAIN_TEXT);
  }
}

/**
 * Cleans up old raw files in a folder by retention age.
 */
function cleanupOldRawFiles_(folderPath, retentionDays) {
  var folder = getOrCreateFolderPath_(folderPath);
  var cutoff = Date.now() - retentionDays * 24 * 3600 * 1000;
  var files = folder.getFiles();
  var trashed = 0;

  while (files.hasNext()) {
    var file = files.next();
    if (file.getDateCreated().getTime() < cutoff) {
      file.setTrashed(true);
      trashed++;
    }
  }

  if (trashed) Logger.log(`Cleanup: moved ${trashed} raw files to trash.`);
}