'use strict';
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const yazl = require('yazl');

const config = require('./lib/config');
const ff = require('./lib/ffmpeg');
const { pickMoments } = require('./lib/moments');
const invoices = require('./lib/invoices');
const { renderInvoice } = require('./lib/pdf');

[config.uploadsDir, config.clipsDir, config.metaDir].forEach((d) => fs.mkdirSync(d, { recursive: true }));
invoices.load();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

const rid = () => crypto.randomBytes(8).toString('hex');
const isId = (s) => /^[a-f0-9]{16}$/.test(String(s));
const clampInt = (v, min, max, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const ALLOWED_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi']);

/* ---------- in-memory registry, saved as small JSON files so a restart keeps it ---------- */
const uploads = new Map();
const jobs = new Map();
let running = 0;
let ffmpegOk = false;

const metaPath = (kind, id) => path.join(config.metaDir, `${kind}-${id}.json`);
const saveMeta = (kind, obj) => fs.writeFile(metaPath(kind, obj.id), JSON.stringify(obj), () => {});

function loadRegistry() {
  for (const f of fs.readdirSync(config.metaDir)) {
    try {
      const obj = JSON.parse(fs.readFileSync(path.join(config.metaDir, f), 'utf8'));
      if (f.startsWith('up-') && isId(obj.id) && fs.existsSync(path.join(config.uploadsDir, obj.file))) {
        uploads.set(obj.id, obj);
      } else if (f.startsWith('job-') && isId(obj.id) && obj.status === 'done') {
        jobs.set(obj.id, obj);
      }
    } catch (e) { /* ignore broken files */ }
  }
}
loadRegistry();

const publicUpload = (u) => ({
  id: u.id, name: u.name, size: u.size, duration: u.duration, width: u.width, height: u.height,
  hasAudio: u.hasAudio, created: u.created, url: `/media/uploads/${u.file}`, download: `/download/upload/${u.id}`,
});
const publicJob = (j) => ({
  id: j.id, sourceId: j.sourceId, status: j.status, stage: j.stage, progress: j.progress,
  note: j.note, error: j.error || null, clips: j.clips, zip: `/api/jobs/${j.id}/zip`, opts: j.opts, created: j.created,
});

function safeBase(name) {
  const base = String(name || 'video').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  return (base || 'video').slice(0, 60);
}
function fixName(raw) {
  let n = String(raw || 'video');
  try {
    const u = Buffer.from(n, 'latin1').toString('utf8'); // multer reads UTF-8 names as latin1
    if (!u.includes('�')) n = u;
  } catch (e) { /* keep as is */ }
  return n.replace(/[\u0000-\u001f<>"]/g, '').slice(0, 200) || 'video';
}

function deleteJob(id) {
  fs.rm(path.join(config.clipsDir, id), { recursive: true, force: true }, () => {});
  fs.rm(metaPath('job', id), { force: true }, () => {});
  jobs.delete(id);
}
function deleteUpload(id) {
  const u = uploads.get(id);
  if (!u) return false;
  for (const j of [...jobs.values()]) if (j.sourceId === id && j.status !== 'working') deleteJob(j.id);
  fs.rm(path.join(config.uploadsDir, u.file), { force: true }, () => {});
  fs.rm(metaPath('up', id), { force: true }, () => {});
  uploads.delete(id);
  return true;
}
function cleanup() {
  if (config.retentionHours <= 0) return;
  const cutoff = Date.now() - config.retentionHours * 3600e3;
  for (const u of [...uploads.values()]) if (u.created < cutoff) deleteUpload(u.id);
  for (const j of [...jobs.values()]) if (j.status !== 'working' && j.created < cutoff) deleteJob(j.id);
}

/* ---------- app ---------- */
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });

if (config.appPassword) {
  app.use((req, res, next) => {
    const [type, b64] = String(req.headers.authorization || '').split(' ');
    if (type === 'Basic' && b64) {
      const pass = Buffer.from(b64, 'base64').toString().split(':').slice(1).join(':');
      const a = Buffer.from(pass);
      const b = Buffer.from(config.appPassword);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="clippng"').status(401).send('Password required');
  });
}

app.use(express.json({ limit: '1mb' }));
app.use('/media/uploads', express.static(config.uploadsDir, { index: false, dotfiles: 'deny', maxAge: '1h' }));
app.use('/media/clips', express.static(config.clipsDir, { index: false, dotfiles: 'deny', maxAge: '1h' }));
app.use(express.static(config.publicDir));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ffmpeg: ffmpegOk, linkImport: config.enableLinkImport, maxUploadMB: config.maxUploadMB });
});

/* ---------- upload ---------- */
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, config.uploadsDir),
    filename: (req, file, cb) => {
      req.fileId = rid();
      cb(null, req.fileId + path.extname(file.originalname).toLowerCase());
    },
  }),
  limits: { fileSize: config.maxUploadMB * 1048576, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_EXT.has(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new HttpError(415, 'Unsupported file type. Use MP4, MOV, M4V, WEBM, MKV or AVI.'));
  },
});

app.post(
  '/api/upload',
  (req, res, next) => (ffmpegOk ? next() : next(new HttpError(503, 'ffmpeg is not available on the server.'))),
  upload.single('video'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new HttpError(400, 'No video file received.');
      const info = await ff.probe(req.file.path);
      if (!info) {
        fs.rm(req.file.path, { force: true }, () => {});
        throw new HttpError(415, 'That file does not look like a playable video.');
      }
      const u = { id: req.fileId, file: req.file.filename, name: fixName(req.file.originalname), size: req.file.size, ...info, created: Date.now() };
      uploads.set(u.id, u);
      saveMeta('up', u);
      res.status(201).json(publicUpload(u));
    } catch (e) { next(e); }
  }
);

/* Optional: import a video from a link with yt-dlp. Off unless ENABLE_LINK_IMPORT=1. */
function isPrivateHost(h) {
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '::1' || h === '[::1]') return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
function runYtdlp(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(config.ytdlp, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), 15 * 60 * 1000);
    p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(err || 'yt-dlp failed')); });
  });
}
app.post('/api/upload-link', async (req, res, next) => {
  try {
    if (!config.enableLinkImport) throw new HttpError(501, 'Link import is turned off on this server. Upload the video file instead.');
    if (!ffmpegOk) throw new HttpError(503, 'ffmpeg is not available on the server.');
    const url = String((req.body || {}).url || '').trim();
    if (!/^https?:\/\/[^\s]{3,2000}$/i.test(url)) throw new HttpError(400, 'Enter a full link starting with https://');
    let host;
    try { host = new URL(url).hostname.toLowerCase(); } catch (e) { throw new HttpError(400, 'That link is not valid.'); }
    if (isPrivateHost(host)) throw new HttpError(400, 'That address is not allowed.');
    const id = rid();
    try {
      await runYtdlp([
        '--no-playlist', '--no-warnings', '--max-filesize', `${config.maxUploadMB}M`,
        '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b', '--merge-output-format', 'mp4',
        '-o', path.join(config.uploadsDir, id + '.%(ext)s'), '--', url,
      ]);
    } catch (e) {
      if (e.code === 'ENOENT') throw new HttpError(501, 'yt-dlp is not installed on the server.');
      throw new HttpError(422, 'Could not download that link.');
    }
    const file = fs.readdirSync(config.uploadsDir).find((f) => f.startsWith(id + '.') && ALLOWED_EXT.has(path.extname(f).toLowerCase()));
    if (!file) throw new HttpError(422, 'Could not download that link.');
    const full = path.join(config.uploadsDir, file);
    const info = await ff.probe(full);
    if (!info) { fs.rm(full, { force: true }, () => {}); throw new HttpError(422, 'That link did not give a playable video.'); }
    const u = { id, file, name: `${host} video${path.extname(file)}`, size: fs.statSync(full).size, ...info, created: Date.now() };
    uploads.set(id, u);
    saveMeta('up', u);
    res.status(201).json(publicUpload(u));
  } catch (e) { next(e); }
});

app.delete('/api/uploads/:id', (req, res, next) => {
  if (!isId(req.params.id) || !uploads.has(req.params.id)) return next(new HttpError(404, 'Upload not found.'));
  deleteUpload(req.params.id);
  res.json({ ok: true });
});

/* ---------- clipping jobs ---------- */
async function runJob(job, src) {
  const input = path.join(config.uploadsDir, src.file);
  const outDir = path.join(config.clipsDir, job.id);
  fs.mkdirSync(outDir, { recursive: true });
  try {
    job.stage = 'Reading the audio';
    job.progress = 10;
    let energy = null;
    if (src.hasAudio && src.duration <= 4 * 3600) {
      try { energy = await ff.energyPerSecond(input); } catch (e) { energy = null; }
    }
    job.stage = 'Finding the best moments';
    job.progress = 22;
    const res = pickMoments(energy, src.duration, job.opts.count, job.opts.length);
    const total = res.picks.length;
    job.stage = `Cutting ${total} ${total === 1 ? 'clip' : 'clips'}`;
    for (let k = 0; k < total; k++) {
      const p = res.picks[k];
      const file = `clip-${k + 1}.mp4`;
      await ff.cutClip({
        input, output: path.join(outDir, file), start: p.start, length: p.end - p.start,
        format: job.opts.format, hasAudio: src.hasAudio,
      });
      job.clips.push({
        n: k + 1, title: `Clip ${k + 1}`, file,
        url: `/media/clips/${job.id}/${file}`, download: `/download/${job.id}/${file}`,
        srcStart: p.start, srcEnd: p.end, duration: p.end - p.start, score: p.score,
      });
      job.progress = 22 + Math.round((76 * (k + 1)) / total);
    }
    const notes = [];
    if (res.even) notes.push('Cut evenly because the audio could not be read.');
    if (res.adjusted) notes.push(`Adjusted to fit a short video: ${total} clips of ${res.length} seconds.`);
    job.note = notes.join(' ');
    job.stage = 'Done';
    job.progress = 100;
    job.status = 'done';
    saveMeta('job', job);
  } catch (e) {
    console.error('clip job failed:', e.message);
    job.status = 'error';
    job.error = 'Could not clip this video.';
    fs.rm(outDir, { recursive: true, force: true }, () => {});
  }
}

app.post('/api/clip', (req, res, next) => {
  try {
    if (!ffmpegOk) throw new HttpError(503, 'ffmpeg is not available on the server.');
    const b = req.body || {};
    if (!isId(b.sourceId)) throw new HttpError(400, 'Missing source video.');
    const src = uploads.get(b.sourceId);
    if (!src || !fs.existsSync(path.join(config.uploadsDir, src.file))) throw new HttpError(404, 'That upload is gone. Upload it again.');
    if (running >= config.maxParallelJobs) throw new HttpError(429, 'The server is busy clipping. Try again in a minute.');
    const opts = {
      count: clampInt(b.count, 1, 30, 8),
      length: clampInt(b.length, 5, 90, 30),
      format: ['crop', 'blur', 'original'].includes(b.format) ? b.format : 'crop',
    };
    const job = { id: rid(), sourceId: src.id, status: 'working', stage: 'Starting', progress: 4, note: '', error: null, clips: [], created: Date.now(), opts };
    jobs.set(job.id, job);
    running++;
    runJob(job, src).finally(() => { running--; });
    res.status(202).json({ jobId: job.id });
  } catch (e) { next(e); }
});

app.get('/api/jobs/:id', (req, res, next) => {
  const j = isId(req.params.id) && jobs.get(req.params.id);
  if (!j) return next(new HttpError(404, 'Job not found.'));
  res.json(publicJob(j));
});

app.get('/api/jobs/:id/zip', (req, res, next) => {
  const j = isId(req.params.id) && jobs.get(req.params.id);
  if (!j || !j.clips.length) return next(new HttpError(404, 'No clips to download.'));
  const src = uploads.get(j.sourceId);
  const base = safeBase(src && src.name);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${base}-clips.zip"`);
  const zip = new yazl.ZipFile();
  for (const c of j.clips) {
    const full = path.join(config.clipsDir, j.id, c.file);
    if (fs.existsSync(full)) zip.addFile(full, `${base}-${c.file}`, { compress: false }); // mp4 is already compressed
  }
  zip.outputStream.on('error', () => res.destroy()).pipe(res);
  zip.end();
});

/* ---------- downloads (forces "Save as") ---------- */
app.get('/download/upload/:id', (req, res, next) => {
  const u = isId(req.params.id) && uploads.get(req.params.id);
  if (!u) return next(new HttpError(404, 'File not found.'));
  res.download(path.join(config.uploadsDir, u.file), safeBase(u.name) + path.extname(u.file), (err) => {
    if (err && !res.headersSent) next(new HttpError(404, 'File not found.'));
  });
});
app.get('/download/:jobId/:file', (req, res, next) => {
  const { jobId, file } = req.params;
  const j = isId(jobId) && jobs.get(jobId);
  if (!j || !/^clip-\d{1,3}\.mp4$/.test(file) || !j.clips.some((c) => c.file === file)) return next(new HttpError(404, 'File not found.'));
  const src = uploads.get(j.sourceId);
  res.download(path.join(config.clipsDir, jobId, file), `${safeBase(src && src.name)}-${file}`, (err) => {
    if (err && !res.headersSent) next(new HttpError(404, 'File not found.'));
  });
});

/* what is still on the server, so the page can show it again after a reload */
app.get('/api/library', (req, res) => {
  const byNewest = (a, b) => b.created - a.created;
  res.json({
    uploads: [...uploads.values()].sort(byNewest).map(publicUpload),
    jobs: [...jobs.values()].filter((j) => j.status === 'done').sort(byNewest).map(publicJob),
  });
});

/* ---------- invoices ---------- */
app.get('/api/invoices', (req, res) => res.json(invoices.list()));
app.post('/api/invoices', (req, res) => res.status(201).json(invoices.upsert(req.body)));
app.patch('/api/invoices/:id', (req, res, next) => {
  const rec = invoices.setStatus(req.params.id, (req.body || {}).status);
  rec ? res.json(rec) : next(new HttpError(404, 'Invoice not found or invalid status.'));
});
app.delete('/api/invoices/:id', (req, res, next) => {
  invoices.remove(req.params.id) ? res.json({ ok: true }) : next(new HttpError(404, 'Invoice not found.'));
});
app.post('/api/invoices/pdf', (req, res) => {
  const inv = invoices.sanitize(req.body);
  const name = String(inv.number).replace(/[^\w.-]+/g, '_') || 'invoice';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`);
  renderInvoice(inv, res);
});

/* ---------- errors ---------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  let status = err.status || err.statusCode || 500;
  let msg = err.expose ? err.message : null;
  if (err.code === 'LIMIT_FILE_SIZE') { status = 413; msg = `That file is too large. The limit is ${config.maxUploadMB} MB.`; }
  else if (err.type === 'entity.parse.failed') { status = 400; msg = 'Invalid JSON.'; }
  else if (String(err.code || '').startsWith('LIMIT_')) { status = 400; msg = 'Upload rejected.'; }
  if (status >= 500) { console.error(err); msg = msg || 'Something went wrong on the server.'; }
  res.status(status).json({ error: msg || 'Request failed.' });
});

ff.available().then((ok) => {
  ffmpegOk = ok;
  if (!ok) console.error('ffmpeg was not found. Install it or set FFMPEG_PATH. Uploading and clipping are disabled.');
});

if (require.main === module) {
  cleanup();
  setInterval(cleanup, 3600e3).unref();
  app.listen(config.port, () => console.log(`clippng.in running at http://localhost:${config.port}`));
}

module.exports = app;
