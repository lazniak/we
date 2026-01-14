# we.pablogfx.com

A minimalist file transfer application inspired by WeTransfer. Upload files up to 5GB with instant link generation, real-time progress tracking, and automatic 3-day expiration.

## Features

- **Instant Link Generation** - Get a shareable link before upload completes
- **Drag & Drop** - Easy file selection with drag and drop or file browser
- **Client-side ZIP** - Files are compressed in the browser before upload
- **Chunked Upload** - Supports files up to 5GB with parallel chunk uploads
- **Real-time Progress** - Receivers see live upload progress via WebSocket
- **Auto Expiration** - Files automatically deleted after 3 days
- **Dark Theme** - Beautiful minimalist dark mode design with glass effects
- **Transfer History** - Browser-based history of your transfers
- **Statistics** - Track total transfers and data transferred

## Tech Stack

- **Frontend**: Next.js 16+ + TypeScript + Tailwind CSS
- **Backend**: Bun + Hono
- **Database**: bun:sqlite (native Bun SQLite)
- **Real-time**: WebSocket (native Bun)
- **ZIP**: JSZip (client-side)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) v1.1+
- [Node.js](https://nodejs.org/) v18+ (for frontend)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/lazniak/we.git
cd we
```

2. Install root dependencies:
```bash
npm install
```

3. Install backend dependencies:
```bash
cd backend
bun install
cd ..
```

4. Install frontend dependencies:
```bash
cd frontend
npm install
cd ..
```

### Development

Run both frontend and backend in development mode:

```bash
npm run dev
```

Or run them separately:

```bash
# Terminal 1 - Backend (port 3001)
cd backend && bun run dev

# Terminal 2 - Frontend (port 8080)
cd frontend && npm run dev
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

### Production Build

```bash
npm run build
npm run start
```

## Deployment

See [DEPLOY.md](DEPLOY.md) for detailed deployment instructions.

Quick deployment script:
```bash
chmod +x deploy.sh
sudo ./deploy.sh
```

## License

MIT
