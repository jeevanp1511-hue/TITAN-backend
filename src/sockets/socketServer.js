import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { socketAuthMiddleware } from './socketAuth.js';
import { Network } from '../models/Network.js';
import { NetworkMember } from '../models/NetworkMember.js';

let ioInstance = null;

export const initSocketServer = (httpServer) => {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  // Attach auth middleware
  ioInstance.use(socketAuthMiddleware);

  ioInstance.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id} (User: ${socket.user.name}, Role: ${socket.user.role})`);

    // Subscribe to a specific network's updates
    socket.on('network:join', async ({ networkId }) => {
      try {
        if (!networkId) return;

        // Verify user is authorized: must be network owner or active member or admin
        const network = await Network.findById(networkId);
        if (!network) {
          socket.emit('error', { message: 'Network not found' });
          return;
        }

        const isOwner = network.owner.toString() === socket.user._id.toString();
        let isMember = false;
        if (!isOwner) {
          const membership = await NetworkMember.findOne({
            network: networkId,
            user: socket.user._id,
            status: 'active',
          });
          isMember = !!membership;
        }

        if (!isOwner && !isMember && socket.user.role !== 'admin') {
          socket.emit('error', { message: 'Unauthorized room subscription attempt' });
          return;
        }

        const room = `network_${networkId.toString()}`;
        socket.join(room);
        socket.emit('network:joined', { networkId, message: `Joined room ${room}` });
        console.log(`[Socket] User ${socket.user.name} joined room ${room}`);
      } catch (err) {
        socket.emit('error', { message: `Join error: ${err.message}` });
      }
    });

    socket.on('network:leave', ({ networkId }) => {
      if (networkId) {
        const room = `network_${networkId.toString()}`;
        socket.leave(room);
        socket.emit('network:left', { networkId });
        console.log(`[Socket] User ${socket.user.name} left room ${room}`);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Client disconnected: ${socket.id} (Reason: ${reason})`);
    });
  });

  return ioInstance;
};

export const getSocketServer = () => {
  return ioInstance;
};
