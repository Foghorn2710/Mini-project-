# clippng.in

Upload a video, press **Clip it**, and get many short clips. Each clip is a real MP4 file you can download. The app also makes invoices as PDFs, and has an earnings calculator and an FAQ.

## Run it

You need Node 18 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000

`npm install` also fetches a bundled ffmpeg (`ffmpeg-static`). If that is skipped, install ffmpeg yourself or set `FFMPEG_PATH`.

## Downloads

- **Download clip** (under the phone): downloads the clip you have selected.
- **Download original**: shows when you select an uploaded video that has not been clipped.
- **Download** on each tile: that clip as `<name>-clip-N.mp4`.
- **Download all (.zip)**: every clip from one upload.
- **Download PDF** on the invoice page.

## How clipping works

ffmpeg reads the audio and measures loudness for every second. The loudest non-overlapping windows become the clips (the number on each tile is an "ENERGY" rank, not a virality prediction). Silent videos are split evenly. Short videos get shorter clips or fewer clips. Formats: vertical crop (720x1280), blurred-background fit, or original ratio.

## Settings (environment variables, see `.env.example`)

| Variable | Default | Meaning |
|---|---|---|
| PORT | 3000 | Port to listen on |
| DATA_DIR | ./data | Where uploads, clips and invoices are stored |
| MAX_UPLOAD_MB | 2048 | Upload size limit |
| RETENTION_HOURS | 24 | Uploads and clips older than this are deleted |
| MAX_PARALLEL_JOBS | 2 | Clip jobs that run at once |
| FFMPEG_PATH | auto | Path to ffmpeg |
| APP_PASSWORD | empty | If set, the site asks for this password (user name: anything) |
| ENABLE_LINK_IMPORT | empty | Set to `1` to allow pasting video links (needs `yt-dlp`, see `YTDLP_PATH`) |

## Notes and limits

- Link import is off by default. If you turn it on, only do it on a private or trusted server. Private network addresses are blocked, but yt-dlp downloads whatever a link points to.
- There are no user accounts. Anyone who can open the site can see its uploads and invoices, so set `APP_PASSWORD` before putting it online.
- Invoice PDFs show the currency as a code (for example `INR 12,000.00`) because the built-in PDF font has no rupee sign.
- Job state is kept in memory. Finished clips survive a restart and are restored from `data/`.

## Layout

```
server.js        Express server and API
lib/             ffmpeg, moment picking, invoices, PDF
public/          index.html, style.css, app.js (no build step)
data/            created at run time
```

## Docker

```bash
docker build -t clippng .
docker run -p 3000:3000 -v clippng-data:/app/data clippng
```
