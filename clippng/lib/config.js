'use strict';
const path = require('path');

const root = path.join(__dirname, '..');

function resolveFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    // Optional dependency that ships a static ffmpeg binary.
    return require('ffmpeg-static') || 'ffmpeg';
  } catch (e) {
    return 'ffmpeg'; // fall back to whatever is on PATH
  }
}

const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));

module.exports = {
  root,
  port: int(process.env.PORT, 3000),
  dataDir,
  uploadsDir: path.join(dataDir, 'uploads'),
  clipsDir: path.join(dataDir, 'clips'),
  metaDir: path.join(dataDir, 'meta'),
  invoicesFile: path.join(dataDir, 'invoices.json'),
  publicDir: path.join(root, 'public'),
  maxUploadMB: int(process.env.MAX_UPLOAD_MB, 2048),
  retentionHours: int(process.env.RETENTION_HOURS, 24),
  maxParallelJobs: int(process.env.MAX_PARALLEL_JOBS, 2),
  ffmpeg: resolveFfmpeg(),
  ytdlp: process.env.YTDLP_PATH || 'yt-dlp',
  enableLinkImport: process.env.ENABLE_LINK_IMPORT === '1',
  appPassword: process.env.APP_PASSWORD || '',
};
