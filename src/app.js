
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';

import { env } from './config/env.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/authRoutes.js';
import networkRoutes from './routes/networkRoutes.js';
import memberRoutes from './routes/memberRoutes.js';
import requestRoutes from './routes/requestRoutes.js';
import allocationRoutes from './routes/allocationRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';

const allowedOrigins = [
  'https://titan-frontend-chi.vercel.app',
  env.CLIENT_ORIGIN,
].filter(Boolean);

const isAllowedVercelPreview = (origin) =>
  /^https:\/\/titan-frontend-[a-z0-9-]+-jeevan-projects2\.vercel\.app$/.test(
    origin
  );

export const createApp = () => {
  const app = express();

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many requests from this IP, please try again later',
    },
  });

  app.use(limiter);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Requests without an Origin header, such as health checks.
        if (!origin) {
          return callback(null, true);
        }

        if (
          allowedOrigins.includes(origin) ||
          isAllowedVercelPreview(origin)
        ) {
          return callback(null, true);
        }

        return callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
      methods: [
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'OPTIONS',
      ],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
      ],
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  if (env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  app.get('/api/health', (req, res) => {
    const dbState = mongoose.connection.readyState;

    const dbStatusMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    res.status(200).json({
      success: true,
      service: 'TITAN Shared Internet Bandwidth Usage Manager',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      database: dbStatusMap[dbState] || 'unknown',
      version: '1.0.0',
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/networks', networkRoutes);
  app.use('/api/members', memberRoutes);
  app.use('/api/requests', requestRoutes);
  app.use('/api/allocations', allocationRoutes);
  app.use('/api/dashboard', dashboardRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

export default createApp();
