import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { ALLOWED_ORIGINS, BIND_HOST, MAX_CHUNK_BYTES } from './config';
import { initDb } from './db';
import { transferRoutes } from './routes/transfer';
import { statsRoutes } from './routes/stats';
import { setupWebSocket, clients } from './websocket';
import { startCleanupJob } from './cleanup';
import { isValidTransferId } from './lib/safePath';
import { handleDownloadRequest } from './routes/download';

const app = new Hono();

initDb();
startCleanupJob();

app.use('*', logger());

app.use(
  '*',
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : ''),
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Owner-Token'],
    credentials: true,
  }),
);

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Frame-Options', 'DENY');
});

app.route('/api/transfer', transferRoutes);
app.route('/api/stats', statsRoutes);

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.onError((error, c) => {
  console.error('Unhandled error:', error);
  return c.json({ error: 'Internal server error' }, 500);
});

const PORT = Number(process.env.PORT || 3001);

const server = Bun.serve({
  hostname: BIND_HOST,
  port: PORT,
  // Hard ceiling on any single request body. Chunks are the largest thing a
  // client is allowed to send, so nothing can be used to exhaust memory.
  maxRequestBodySize: MAX_CHUNK_BYTES + 1024 * 1024,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname.startsWith('/ws/')) {
      const transferId = url.pathname.slice('/ws/'.length);
      if (!isValidTransferId(transferId)) {
        return new Response('Invalid transfer id', { status: 400 });
      }
      if (server.upgrade(req, { data: { transferId } })) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // Downloads bypass Hono - see routes/download.ts for why.
    try {
      const download = await handleDownloadRequest(req, url);
      if (download) return download;
    } catch (error) {
      console.error('Download error:', error);
      return new Response(JSON.stringify({ error: 'Download failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return app.fetch(req);
  },
  websocket: setupWebSocket(clients),
});

console.log(`✅ Backend running at http://localhost:${server.port}`);
