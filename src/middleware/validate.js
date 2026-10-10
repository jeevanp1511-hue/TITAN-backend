import { ApiError } from '../utils/ApiError.js';

export const validate = (schema) => (req, res, next) => {
  try {
    const validated = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    // Replace with sanitized/coerced values
    if (validated.body) req.body = validated.body;
    if (validated.query) req.query = validated.query;
    if (validated.params) req.params = validated.params;
    next();
  } catch (err) {
    if (err.name === 'ZodError') {
      const formattedErrors = err.errors.map((e) => ({
        field: e.path.filter((p) => p !== 'body' && p !== 'query' && p !== 'params').join('.'),
        message: e.message,
      }));
      return next(new ApiError(400, 'Invalid request input', formattedErrors));
    }
    next(err);
  }
};
