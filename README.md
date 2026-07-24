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
  search, sorting, list/grid view, thumbnails and previews
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
query, and a full upload → browse → download cycle against a live server.

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
