/**
 * Centralized Error Handling Middleware
 * Prevents leaking stack traces, environment secrets, or service keys.
 */

function errorHandler(err, req, res, next) {
  // Safe console log for server diagnostics
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err.message || err);

  const statusCode = err.status || err.statusCode || 500;
  
  // Safe sanitized message
  let clientMessage = err.message || 'Internal server error occurred.';

  // If Supabase or PostgREST error, mask sensitive database details
  if (err.code && typeof err.code === 'string' && (err.code.startsWith('23') || err.code.startsWith('42'))) {
    clientMessage = 'Database operation failed. Please check your data and try again.';
  }

  // Prevent leaking internal stack trace in production or general response
  res.status(statusCode).json({
    success: false,
    error: clientMessage
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
