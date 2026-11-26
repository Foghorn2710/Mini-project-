'use strict';

/**
 * Pick the best non-overlapping moments of a video.
 *
 * energy   Float32Array with the loudness of every second, or null when the audio
 *          could not be read (the clips are then spread evenly instead).
 * duration length of the video in seconds
 * count    how many clips are wanted
 * length   wanted clip length in seconds
 *
 * Returns { picks: [{ start, end, score }], even, adjusted, length }
 * Picks are ordered best first; "score" is 72..98 (loudness rank) or null.
 */
function pickMoments(energy, duration, count, length) {
  let n = count;
  let len = Math.min(length, Math.max(3, Math.floor(duration)));
  // Short video: shorten the clips first (down to 10 s), then make fewer of them.
  if (n * len > duration) len = Math.min(len, Math.max(10, Math.floor(duration / n)));
  if (n * len > duration) n = Math.max(1, Math.floor(duration / len));

  let usable = energy && energy.length ? energy : null;
  if (usable) {
    let max = 0;
    for (let i = 0; i < usable.length; i++) if (usable[i] > max) max = usable[i];
    if (max < 1e-4) usable = null; // silent video
  }

  const picks = [];
  if (usable) {
    const pre = new Float64Array(usable.length + 1);
    for (let i = 0; i < usable.length; i++) pre[i + 1] = pre[i] + usable[i];
    const used = new Uint8Array(usable.length);
    const maxStart = Math.max(0, Math.floor(duration - len));
    for (let k = 0; k < n; k++) {
      let best = -1;
      let bestStart = -1;
      for (let s = 0; s <= maxStart; s++) {
        const e = Math.min(s + len, usable.length);
        let free = true;
        for (let t = s; t < e; t++) if (used[t]) { free = false; break; }
        if (!free) continue;
        const sum = pre[e] - pre[s];
        if (sum > best) { best = sum; bestStart = s; }
      }
      if (bestStart < 0) break;
      for (let t = bestStart; t < Math.min(bestStart + len, usable.length); t++) used[t] = 1;
      picks.push({ start: bestStart, end: Math.min(duration, bestStart + len), raw: best });
    }
    let hi = -Infinity;
    let lo = Infinity;
    picks.forEach((p) => { if (p.raw > hi) hi = p.raw; if (p.raw < lo) lo = p.raw; });
    picks.forEach((p) => {
      p.score = hi > lo ? 72 + Math.round((26 * (p.raw - lo)) / (hi - lo)) : 90;
      delete p.raw;
    });
  } else {
    const gap = n > 1 ? (duration - len) / (n - 1) : 0;
    for (let k = 0; k < n; k++) {
      const s = Math.max(0, Math.round(k * gap));
      picks.push({ start: s, end: Math.min(duration, s + len), score: null });
    }
  }
  return { picks, even: !usable, adjusted: len < length || picks.length < count, length: Math.round(len) };
}

module.exports = { pickMoments };
