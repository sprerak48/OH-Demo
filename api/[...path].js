/**
 * Vercel serverless catch-all: forwards all /api/* requests to the Express app.
 * Normalizes path so Express receives /api/... (Vercel may pass path without /api prefix).
 */
import app from '../server/index.js';

export default function handler(req, res) {
  const url = req.url || '';
  if (!url.startsWith('/api')) {
    req.url = '/api' + (url.startsWith('/') ? url : '/' + url);
  }
  return app(req, res);
}
