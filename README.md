# we.pablogfx.com

A minimalist file transfer service. Drop files or whole folders, get a shareable
link before the upload has even finished, and everything deletes itself when the
link expires.

## Features

- **Link before upload** — the share URL exists the moment the transfer starts, and
  recipients watch live progress over a WebSocket
- **Folders keep their structure** — a dropped directory is recreated exactly, empty
  subfolders included
- **Native file browser** — recipients browse the transfer: folders, breadcrumbs,
  search, sorting, list/grid view, thumbnails and previews. A media view gathers
  every picture, video and audio file from all folders into one grid and is the
  default when they make up most of the transfer; the fullscreen preview pages
  through the whole transfer, folder after folder, with arrows, keys and swipe
- **Light thumbnails** — pictures, video frames and cover art (camera RAW, PSD, HEIC
  and MKV included) become small WebPs made once by libvips and cached for a limited
  time, so browsing never pulls full files
- **Pick what you need** — download the whole transfer, one folder, or a single file
- **No pointless repacking** — a single file comes back byte for byte; only a real
  bundle is packed into a ZIP, and never twice
- **Executables are wrapped** — anything directly runnable is delivered inside a ZIP
  so nothing arrives ready to double-click
- **Self destructing** — files and metadata are deleted when the link expires, with a
  hard retention cap behind it
- **Chunked and resilient** — 5MB chunks upload in parallel and retry on their own
- **Up to 5GB per transfer**, no signup

## Tech Stack

- **Frontend**: Next.js 16 + TypeScript + Tailwind CSS
- **Backend**: Bun + Hono
- **Media**: sharp (libvips) for thumbnails; ffmpeg, ImageMagick and LibreOffice for
  previews
- **Database**: bun:sqlite (WAL)
- **Real-time**: native Bun WebSocket

## How a transfer works

1. `POST /api/transfer/init` announces the file list with relative paths and sizes.
   The server sanitises every path, allocates the transfer and answers with the
   share link, an owner token and the chunk size.
2. Each file is uploaded as 5MB chunks via
   `PUT /api/transfer/:id/file/:index/chunk/:chunk`. Chunks carry their absolute
   position, so they can arrive in parallel, out of order, or twice.
3. `POST /api/transfer/:id/complete` verifies every payload landed at its declared
   size and records a CRC32 per file.
4. Downloads are streamed. A ZIP is built on the fly (stored, not recompressed) so
   nothing is ever buffered in memory or staged on disk.

Payloads are stored under generated names (`f00042.bin`); the path the sender chose
lives only in the database. That is what makes path traversal structurally
impossible rather than something to filter for.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) v1.1+
- [Node.js](https://nodejs.org/) v18+ (frontend)

### Installation

```bash
npm install
cd backend && bun install && cd ..
cd frontend && npm install && cd ..
```

### Development

```bash
npm run dev
```

Backend on port 3001, frontend on port 3002. Open http://localhost:3002.

### Tests

```bash
cd backend && bun test
```

Covers the ZIP encoder against a real unzipper, path sanitisation, the retention
query, thumbnails and their cache retention, and a full upload → browse → download
cycle against a live server.

### Thumbnails

`GET /api/transfer/:id/thumb/:fileId` answers with a WebP made by libvips
(sharp): `?s=sm` (default) is a 384 px square for tiles and list icons, `?s=lg`
fits 1280 px for the hover backdrop and video posters. Pictures are decoded
straight from the upload (JPEG and WebP shrink while decoding), camera RAW gives
up the JPEG the camera embedded, video a frame a tenth of the way in, audio its
cover art; PSD, HEIC and the like fall back to ImageMagick. Whatever needed
ffmpeg, ImageMagick or a RAW scan is encoded in both sizes at once.

The cache lives in `THUMB_CACHE_DIR/<transferId>/` and is disposable:

| Variable                     | Default               | Purpose                                         |
| ---------------------------- | --------------------- | ----------------------------------------------- |
| `THUMB_CACHE_DIR`            | `<repo>/cache/thumbs` | Where thumbnails are cached                     |
| `THUMB_CACHE_TTL_MS`         | 3 days                | A thumbnail unused this long is deleted         |
| `THUMB_CACHE_MAX_BYTES`      | 1 GiB                 | Ceiling on the cache, least recently used first |
| `THUMB_CACHE_MIN_FREE_BYTES` | 2 GiB                 | Below this much free disk nothing is stored     |
| `THUMB_CONCURRENCY`          | `2`                   | Thumbnails generated at once                    |
| `THUMB_QUEUE_MAX`            | `256`                 | Waiting thumbnails before new ones get a 503    |
| `RENDER_CACHE_TTL_MS`        | 3 days                | The same idle limit for full preview renditions |

A transfer's thumbnails go with the transfer (delete, expiry, antivirus hit), and
the cleanup job also drops the thumbnails of any transfer that no longer exists.
The sweeper only ever deletes files it named itself, and a `THUMB_CACHE_DIR` that
overlaps `UPLOADS_DIR` or `DATA_DIR` switches the cache off. Browsers may keep a
thumbnail, but never past the link's expiry.

### Configuration

| Variable          | Default          | Purpose                         |
| ----------------- | ---------------- | ------------------------------- |
| `PORT`            | `3001`           | Backend port                    |
| `UPLOADS_DIR`     | `<repo>/uploads` | Where payloads are stored       |
| `DATA_DIR`        | `<repo>/data`    | Where the SQLite database lives |
| `ALLOWED_ORIGINS` | localhost + prod | Comma separated CORS allow-list |

Limits (transfer size, file count, expiry range, retention) live in
`backend/src/config.ts`.

## Deployment

See [DEPLOY.md](DEPLOY.md).

```bash
sudo ./deploy.sh
```

## License

MIT
