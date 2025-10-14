/**
 * Raw payload storage (Drive).
 */

function saveRawPayload_(payloadText, pageNumber) {
  var folder = getOrCreateFolderPath_(CONFIG.raw.driveFolderPath);
  var ts   = new Date().toISOString().replace(/[:.]/g, '-');
  var ext  = String(CONFIG.request.format || 'json').toLowerCase(); // 'json' | 'csv'
  var base = 'report1_' + ts + '_p' + pageNumber + '.' + ext;

  if (CONFIG.raw.gzip) {
    var mime = ext === 'json' ? 'application/json' : 'text/csv';
    var blob = Utilities.newBlob(payloadText, mime, base);
    var gzBlob = Utilities.gzip(blob, base + '.gz'); // gzip expects Blob/BlobSource
    folder.createFile(gzBlob);
  } else {
    folder.createFile(base, payloadText, MimeType.PLAIN_TEXT);
  }
}

function cleanupOldRawFiles_(folderPath, retentionDays) {
  var folder = getOrCreateFolderPath_(folderPath);
  var cutoff = Date.now() - retentionDays * 24 * 3600 * 1000;
  var files = folder.getFiles();
  var trashed = 0;
  while (files.hasNext()) {
    var f = files.next();
    if (f.getDateCreated().getTime() < cutoff) {
      f.setTrashed(true);
      trashed++;
    }
  }
  if (trashed) Logger.log('Cleanup: moved ' + trashed + ' raw files to trash.');
}