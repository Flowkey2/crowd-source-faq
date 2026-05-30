import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';
import faqRoutes from './routes/faq.js';
import communityRoutes from './routes/community.js';
import searchRoutes from './routes/search.js';
import adminRoutes from './routes/admin.js';
import analyticsRoutes from './routes/analytics.js';
import notificationRoutes from './routes/notification.js';
import teaRoutes from './routes/tea.js';
import reputationRoutes from './routes/reputation.js';
import moderationRoutes from './routes/moderation.js';
import zoomRoutes from './routes/zoom.js';
import { logger } from './utils/logger.js';
import * as Sentry from '@sentry/node';
import { expressIntegration } from '@sentry/node';

// Load environment variables (.env)
dotenv.config();

// Initialize Sentry
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  integrations: [
    expressIntegration(),
  ],
  tracesSampleRate: 0.1, // 10% of transactions sampled
});

// Track unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  Sentry.captureException(reason);
});

const app = express();

// Database connection middleware to ensure connection on each request lazily
app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

// 2. Request ID middleware — generates UUID for each request
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = uuidv4();
  (req as Request & { id: string }).id = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});

// 3. Dynamic CORS Configuration (Must be first to handle preflight requests!)
// Defines which frontend domains are allowed to communicate with this API
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'https://yaksha-faq-frontend.vercel.app'
];
if (process.env.CLIENT_URL) allowedOrigins.push(process.env.CLIENT_URL);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    // Check if the origin is in our whitelist or is a dynamic Vercel preview branch
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Required to allow cookies/auth headers
}));

// 4. Security & Logging Middleware
app.use(helmet({
  crossOriginResourcePolicy: false, // Adjusted to allow secure cross-origin API requests
}));
app.use(morgan('dev')); // Logs incoming HTTP requests to the console

// 3. Rate Limiting
// Prevents brute-force attacks and DDoS by capping requests per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 300,                 // Limit each IP to 300 requests per window
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many admin requests, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/admin', adminLimiter);
app.use('/api/', apiLimiter);

// 4. Body Parsing
app.use(express.json()); // Parses incoming JSON payloads in the request body

// 5. Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/faq', faqRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reputation', reputationRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/notifications/tea', teaRoutes);
app.use('/api/zoom', zoomRoutes);

// 6. Health Check Endpoint
// Useful for deployment platforms (like Vercel/AWS) to verify the server is alive
app.get('/api/health', async (req: Request, res: Response) => {
  let dbStatus = 'disconnected';
  try {
    const conn = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    if (conn === 'connected') {
      await mongoose.connection.db!.admin().ping();
      dbStatus = 'connected';
    }
  } catch {
    dbStatus = 'error';
  }
  res.json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    db: dbStatus,
    version: '0.1.0',
  });
});

// 6b. Warm-up endpoint — pre-loads the ML embedding model so first real request isn't slow
app.post('/api/warm', async (_req: Request, res: Response) => {
  try {
    await import('./utils/embeddings.js').then(m => m.warmEmbedder());
    res.json({ status: 'warmed' });
  } catch {
    res.status(500).json({ status: 'warm failed' });
  }
});

// 7. Global Error Handler
// Catches unhandled errors across the app and standardizes the JSON response
app.use((err: { status?: number; message?: string; stack?: string }, req: Request, res: Response, next: NextFunction) => {
  const requestId: string = (req as Request & { id: string }).id || '-';
  Sentry.captureException(err);
  logger.error(err.stack || err.message || 'Unknown error', { status: err.status }, requestId);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    // Only expose detailed stack traces in development mode for security
    ...(process.env.NODE_ENV === 'development' && { error: err.message, stack: err.stack })
  });
});

const PORT = process.env.PORT || 6767;

// Environment Validation
function validateEnv(): void {
  const errors: string[] = [];

  // Required: MONGODB_URI
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    errors.push('MONGODB_URI is required');
  } else if (!/^mongodb(\+srv)?:\/\/.+/.test(mongoUri)) {
    errors.push('MONGODB_URI must be a mongodb:// or mongodb+srv:// URL');
  }

  // Required: JWT_SECRET
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    errors.push('JWT_SECRET is required');
  } else if (jwtSecret.length < 8) {
    errors.push('JWT_SECRET must be at least 8 characters');
  }

  // Optional: PORT
  const port = process.env.PORT;
  if (port !== undefined && !/^\d+$/.test(port)) {
    errors.push('PORT must be numeric');
  }

  // Optional: CLIENT_URL
  const clientUrl = process.env.CLIENT_URL;
  if (clientUrl !== undefined && !/^https?:\/\/.+/.test(clientUrl)) {
    errors.push('CLIENT_URL must be a valid http:// or https:// URL');
  }

  // Optional: REDIS_URL
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl !== undefined) {
    if (!/^https?:\/\/.+/.test(redisUrl)) {
      errors.push('REDIS_URL must be a valid URL');
    }
    // REDIS_TOKEN required if REDIS_URL is provided
    if (!process.env.REDIS_TOKEN) {
      errors.push('REDIS_TOKEN is required when REDIS_URL is provided');
    }
  }

  // Optional: Zoom OAuth
  const zoomClientId = process.env.ZOOM_CLIENT_ID;
  const zoomClientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (zoomClientId !== undefined && !zoomClientSecret) {
    errors.push('ZOOM_CLIENT_SECRET is required when ZOOM_CLIENT_ID is provided');
  }
  if (zoomClientSecret !== undefined && !zoomClientId) {
    errors.push('ZOOM_CLIENT_ID is required when ZOOM_CLIENT_SECRET is provided');
  }
  const redirectUri = process.env.ZOOM_REDIRECT_URI;
  if (redirectUri !== undefined && !/^https?:\/\/.+/.test(redirectUri)) {
    errors.push('ZOOM_REDIRECT_URI must be a valid URL');
  }

  if (errors.length > 0) {
    console.error('Environment validation failed:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }
}

// 8. Server Initialization
// Prevents direct listening in production if deployed as a serverless function (e.g., Vercel)
if (process.env.NODE_ENV !== 'production') {
  validateEnv();
  app.listen(PORT, () => {
    logger.info(`Yaksha FAQ Portal backend running on port ${PORT}`);
  });
}

// Export the app for testing or serverless handler wrapping
export default app;