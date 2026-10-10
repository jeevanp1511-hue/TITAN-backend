import { ApiError } from '../utils/ApiError.js';

export const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return next(ApiError.unauthorized('Authentication required'));
  }

  if (!allowedRoles.includes(req.user.role)) {
    return next(
      ApiError.forbidden(
        `Access denied. Role '${req.user.role}' is not authorized to perform this action. Required: ${allowedRoles.join(', ')}`
      )
    );
  }

  next();
};
