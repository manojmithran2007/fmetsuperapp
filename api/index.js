/**
 * COLLEGE BUS MANAGEMENT PLATFORM - VERCEL SERVERLESS ENTRY POINT
 * Exports the Express app instance for Vercel's Node.js Serverless Function runtime.
 */

const app = require('../server/server');

module.exports = app;
