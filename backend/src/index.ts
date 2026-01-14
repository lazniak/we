import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { initDb } from './db';
import { transferRoutes } from './routes/transfer';
import { statsRoutes } from './routes/stats';
import { setupWebSocket, clients } from './websocket';
import { startCleanupJob } from './cleanup';

const app = new Hono();

// Initialize database
initDb();

// Start cleanup job
startCleanupJob();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:3000', 'https://we.pablogfx.com'],
  credentials: true,
}));

// Routes
app.route('/api/transfer', transferRoutes);
app.route('/api/stats', statsRoutes);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

const PORT = process.env.PORT || 3001;

console.log(`🚀 Backend server starting on port ${PORT}`);

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    
    // Handle WebSocket upgrade for /ws/:transferId
    if (url.pathname.startsWith('/ws/')) {
      const transferId = url.pathname.split('/ws/')[1];
      const success = server.upgrade(req, { data: { transferId } });
      if (success) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }
    
    // Handle regular HTTP requests with Hono
    return app.fetch(req);
  },
  websocket: setupWebSocket(clients),
});

console.log(`✅ Server running at http://localhost:${server.port}`);
console.log(`📁 Uploads directory: ./uploads`);
