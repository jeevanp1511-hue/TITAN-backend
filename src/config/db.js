import mongoose from 'mongoose';
import { env } from './env.js';

let mongod = null;

export const connectDB = async () => {
  // If already connected, return
  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }

  // If USE_IN_MEMORY_DB is explicitly set and not in production
  if (env.USE_IN_MEMORY_DB && env.NODE_ENV !== 'production') {
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mongod = await MongoMemoryServer.create();
      const memoryUri = mongod.getUri();
      console.log(`[Database] Spinning up in-memory MongoDB at ${memoryUri}`);
      await mongoose.connect(memoryUri);
      console.log('[Database] Connected to in-memory MongoDB successfully');
      return mongoose.connection;
    } catch (inMemErr) {
      console.warn('[Database] In-memory MongoDB failed to initialize, falling back to standard URI:', inMemErr.message);
    }
  }

  try {
    console.log(`[Database] Connecting to MongoDB at ${env.MONGODB_URI}...`);
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('[Database] Connected to MongoDB successfully');
    return mongoose.connection;
  } catch (err) {
    console.error('[Database] Connection to standard MongoDB failed:', err.message);

    // Final fallback attempt with MongoMemoryServer if not already tried
    if (!mongod && env.NODE_ENV !== 'production') {
      try {
        console.log('[Database] Attempting fallback to mongodb-memory-server...');
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        mongod = await MongoMemoryServer.create();
        const memoryUri = mongod.getUri();
        await mongoose.connect(memoryUri);
        console.log(`[Database] Fallback in-memory MongoDB connected successfully at ${memoryUri}`);
        return mongoose.connection;
      } catch (fallbackErr) {
        console.error('[Database] Both external MongoDB and in-memory fallback failed:', fallbackErr.message);
        throw fallbackErr;
      }
    }
    throw err;
  }
};

export const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
  console.log('[Database] Disconnected from MongoDB');
};
