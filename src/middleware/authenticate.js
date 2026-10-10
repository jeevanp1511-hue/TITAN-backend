import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/User.js';

export const authenticate = async (req, res, next) => {
  try {
    let token = null;

    // 1. Check HTTP-only cookie
    if (req.cookies && req.cookies.titan_token) {
      token = req.cookies.titan_token;
    }
    // 2. Check Authorization Bearer header
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(ApiError.unauthorized('Authentication required: please log in'));
    }

    // Verify token
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (!decoded || !decoded.id) {
      return next(ApiError.unauthorized('Invalid or expired authentication token'));
    }

    // Fetch user from DB to ensure account is active and role is fresh
    const user = await User.findById(decoded.id);
    if (!user) {
      return next(ApiError.unauthorized('User associated with token no longer exists'));
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Session has expired or is invalid. Please log in again'));
    }
    next(err);
  }
};
