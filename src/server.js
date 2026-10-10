import http from 'http';
import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { initSocketServer } from './sockets/socketServer.js';
import { env } from './config/env.js';

const startServer = async () => {
  try {
    // 1. Connect to Database
    await connectDB();

    // 2. Initialize App and HTTP Server
    const app = createApp();
    const httpServer = http.createServer(app);

    // 3. Attach Socket.IO
    initSocketServer(httpServer);

    // 4. Start Listening
    httpServer.listen(env.PORT, () => {
      console.log(`====================================================`);
      console.log(`  TITAN Backend Server Running`);
      console.log(`  Port: http://localhost:${env.PORT}`);
      console.log(`  Health Check: http://localhost:${env.PORT}/api/health`);
      console.log(`  Environment: ${env.NODE_ENV}`);
      console.log(`====================================================`);
    });

    // Handle graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
      httpServer.close(async () => {
        await disconnectDB();
        console.log('[Server] HTTP server closed. Exiting process.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('[Server] Fatal startup error:', err);
    process.exit(1);
  }
};

startServer();
