import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';

export const socketAuthMiddleware = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
      socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication required for real-time socket connection'));
    }

    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (!decoded || !decoded.id) {
      return next(new Error('Invalid socket authentication token'));
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new Error('User not found for socket connection'));
    }

    socket.user = user;
    next();
  } catch (err) {
    next(new Error(`Socket authentication error: ${err.message}`));
  }
};
