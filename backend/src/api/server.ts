import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '../config';
import { db } from '../core/database/db';
import { registerRoutes } from './routes/routes';
import { registerPanelRoutes } from './routes/panel.routes';
import { runSeed } from '../seeds/seed';
import { worker } from '../worker/worker';
import { AppError } from '../core/errors/rfc9457';
import { httpRequestDurationHistogram, httpRequestsTotal } from '../core/telemetry/metrics';

export async function buildServer() {
  const server = fastify({
    logger: {
      level: config.env === 'production' ? 'info' : 'debug',
      transport: config.env !== 'production' ? { target: 'pino-pretty' } : undefined,
    },
    bodyLimit: 10 * 1024 * 1024, // 10MB limit
  });

  // Secure headers
  await server.register(helmet, {
    contentSecurityPolicy: false, // Allows Swagger UI to render smoothly
  });

  // Strict CORS
  await server.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });

  // Rate Limiting (100 req/min per IP)
  await server.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });

  // OpenAPI Swagger Documentation
  await server.register(swagger, {
    openapi: {
      info: {
        title: 'Unified Digital Platform for Accessible Public Documentation API',
        description: 'Lifelong person records, bitemporal history, versioned rules engine, fraud intelligence, and tamper-evident audit log.',
        version: '1.0.0',
      },
      servers: [{ url: `http://localhost:${config.port}`, description: 'Local Environment' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await server.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  // Request timing & metrics hook
  server.addHook('onRequest', async (req) => {
    (req as any).startTime = process.hrtime();
  });

  server.addHook('onResponse', async (req, reply) => {
    if ((req as any).startTime) {
      const diff = process.hrtime((req as any).startTime);
      const durationSeconds = diff[0] + diff[1] / 1e9;
      const route = req.routeOptions.url || req.url;
      httpRequestDurationHistogram.observe(
        { method: req.method, route, status_code: reply.statusCode },
        durationSeconds
      );
      httpRequestsTotal.inc({ method: req.method, route, status_code: reply.statusCode });
    }
  });

  // Central RFC 9457 Problem Details Error Handler
  server.setErrorHandler((error, req, reply) => {
    const instance = req.url;
    if (error instanceof AppError) {
      reply.header('Content-Type', 'application/problem+json');
      return reply.status(error.status).send(error.toProblemDetails(instance));
    }

    req.log.error(error);
    reply.header('Content-Type', 'application/problem+json');
    return reply.status(error.statusCode || 500).send({
      type: 'https://gov.hackathon.internal/errors/internal-server-error',
      title: 'Internal Server Error',
      status: error.statusCode || 500,
      detail: error.message || 'An unexpected error occurred',
      instance,
      timestamp: new Date().toISOString(),
    });
  });

  // Register all endpoints
  await registerRoutes(server);
  await registerPanelRoutes(server);

  return server;
}

export async function start() {
  const pgConnected = await db.connect();
  if (!pgConnected) {
    // No Postgres reachable: the in-memory store starts empty, so seed it and run the worker loops in-process
    const count = parseInt(process.env.SEED_PERSONS || '20000', 10);
    console.log(`In-memory mode: auto-seeding ${count} synthetic persons + demo scenarios...`);
    await runSeed(count);
    worker.startLoops();
  }
  const server = await buildServer();
  try {
    await server.listen({ port: config.port, host: config.host });
    console.log(`Gov Unified Platform API listening at http://${config.host}:${config.port}`);
    console.log(`Citizen panel:  http://localhost:${config.port}/panel/citizen`);
    console.log(`Admin panel:    http://localhost:${config.port}/panel/admin`);
    console.log(`OpenAPI docs:   http://localhost:${config.port}/docs`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}
