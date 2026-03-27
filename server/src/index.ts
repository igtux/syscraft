import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

import { config } from './config.js';
import { seed } from './seed.js';
import { schedulerService } from './services/scheduler.js';

import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import hostsRoutes from './routes/hosts.js';
import discrepancyRoutes from './routes/discrepancies.js';
import complianceRoutes from './routes/compliance.js';
import syncRoutes from './routes/sync.js';
import settingsRoutes from './routes/settings.js';
import hostCollectionRoutes from './routes/host-collections.js';
import hostGroupRoutes from './routes/host-groups.js';
import userRoutes from './routes/users.js';
import recommendationRoutes from './routes/recommendations.js';
import sourceRoutes from './routes/sources.js';
import timelineRoutes from './routes/timeline.js';
import webhookRoutes from './routes/webhooks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();
const app = express();

// --- Middleware ---

// CORS
app.use(
  cors({
    origin: config.NODE_ENV === 'production' ? false : '*',
    credentials: true,
  })
);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
  })
);

// Compression
app.use(compression());

// Request logging
app.use(
  morgan(config.NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: {
      write: (message: string) => {
        console.log(`[SysCraft] ${message.trim()}`);
      },
    },
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api/', apiLimiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});
app.use('/api/auth/login', authLimiter);

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/hosts', hostsRoutes);
app.use('/api/discrepancies', discrepancyRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/host-collections', hostCollectionRoutes);
app.use('/api/host-groups', hostGroupRoutes);
app.use('/api/users', userRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/sources', sourceRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/webhooks', webhookRoutes);

// Health check endpoint (no auth)
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'SysCraft',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// --- Static file serving for production ---
if (config.NODE_ENV === 'production') {
  const clientDistPath = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDistPath));

  // SPA catch-all: serve index.html for any non-API route
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'API endpoint not found.' });
    }
  });
} else {
  // In development, return 404 for unknown API routes
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });
}

// --- Error handling ---
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.log('[SysCraft] Unhandled error:', err.message);
  console.log(err.stack);
  res.status(500).json({ error: 'Internal server error.' });
});

// --- Startup ---
async function start(): Promise<void> {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('[SysCraft] Database connected');

    // Run seed (idempotent — only seeds if empty)
    await seed();

    // Start the scheduler
    schedulerService.start();

    // Start HTTP server
    const server = app.listen(config.PORT, () => {
      console.log(`[SysCraft] Server running on port ${config.PORT} (${config.NODE_ENV})`);
      console.log(`[SysCraft] API available at http://localhost:${config.PORT}/api`);
      console.log(`[SysCraft] Health check at http://localhost:${config.PORT}/api/health`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`[SysCraft] Received ${signal}, shutting down gracefully...`);

      schedulerService.stop();

      server.close(async () => {
        console.log('[SysCraft] HTTP server closed');
        await prisma.$disconnect();
        console.log('[SysCraft] Database disconnected');
        process.exit(0);
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        console.log('[SysCraft] Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('[SysCraft] Failed to start server:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

start();
