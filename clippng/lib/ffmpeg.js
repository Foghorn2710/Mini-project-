'use strict';
const { spawn } = require('child_process');
const config = require('./config');

/** Run ffmpeg and collect stdout/stderr text. Resolves with the exit code. */
function runCollect(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(config.ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => {
      err += d;
      if (err.length > 200000) err = err.slice(-100000);
    });
    p.on('error', reject);
    p.on('close', (code) => resolve({ code, out, err }));
  });
}

async function available() {
  try {
    const r = await runCollect(['-version']);
    return r.code === 0;
  } catch (e) {
    return false;
  }
}

/** Read duration, size and audio presence. Returns null if the file has no usable video. */
async function probe(file) {
  const r = await runCollect(['-hide_banner', '-i', file]);
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.err);
  const v = /Stream #\d+:\d+[^\n]*Video:[^\n]*?,\s*(\d{2,5})x(\d{2,5})/.exec(r.err);
  if (!d || !v) return null;
  const duration = Number(d[1]) * 3600 + Number(d[2]) * 60 + parseFloat(d[3]);
  if (!(duration > 0)) return null;
  return {
    duration,
    width: Number(v[1]),
    height: Number(v[2]),
    hasAudio: /Stream #\d+:\d+[^\n]*Audio:/.test(r.err),
  };
}

/**
 * Decode the audio track to 8 kHz mono and return the RMS loudness of every second.
 * Streams the data, so memory use stays small for long files.
 */
function energyPerSecond(file, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const SR = 8000;
    const p = spawn(
      config.ffmpeg,
      ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const secs = [];
    let sum = 0;
    let cnt = 0;
    let carry = null;
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.stderr.resume();
    p.stdout.on('data', (chunk) => {
      let buf = chunk;
      if (carry) { buf = Buffer.concat([carry, buf]); carry = null; }
      const n = buf.length >> 1;
      if (buf.length & 1) carry = Buffer.from(buf.subarray(buf.length - 1));
      for (let i = 0; i < n; i++) {
        const v = buf.readInt16LE(i * 2) / 32768;
        sum += v * v;
        cnt++;
        if (cnt === SR) { secs.push(Math.sqrt(sum / SR)); sum = 0; cnt = 0; }
      }
    });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (cnt > 0) secs.push(Math.sqrt(sum / cnt));
      if (code !== 0 && !secs.length) return reject(new Error('audio decode failed'));
      resolve(Float32Array.from(secs));
    });
  });
}

const W = 720;
const H = 1280;

/** Build the ffmpeg video arguments for the chosen output format. */
function videoArgs(format, hasAudio) {
  const audio = hasAudio ? ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k'] : ['-an'];
  if (format === 'blur') {
    const fc =
      `[0:v]split[a][b];` +
      `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:6[bg];` +
      `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];` +
      `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]`;
    return ['-filter_complex', fc, '-map', '[v]', ...audio];
  }
  if (format === 'original') {
    return ['-map', '0:v:0', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1', ...audio];
  }
  // default: centre crop to vertical 9:16
  return [
    '-map', '0:v:0',
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`,
    ...audio,
  ];
}

/** Cut one clip out of the source and encode it as an MP4. */
async function cutClip({ input, output, start, length, format, hasAudio }) {
  const args = [
    '-y', '-v', 'error',
    '-ss', String(start), '-i', input, '-t', String(length),
    ...videoArgs(format, hasAudio),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    output,
  ];
  const r = await runCollect(args);
  if (r.code !== 0) {
    throw new Error('ffmpeg failed: ' + r.err.split('\n').slice(-4).join(' ').trim());
  }
}

module.exports = { available, probe, energyPerSecond, cutClip };
