/**
 * Vercel serverless catch-all: forwards all /api/* requests to the Express app.
 * Normalizes path so Express receives /api/... (handles path-only or full URL).
 */
import app from '../server/index.js';

function getPathname(raw) {
  if (!raw) return '/';
  const s = String(raw).trim();
  if (s.startsWith('http://') || s.startsWith('https://')) {
    try {
      return new URL(s).pathname || '/';
    } catch (_) {
      return s.split('?')[0] || '/';
    }
  }
  return s.split('?')[0] || '/';
}

function getQuery(raw) {
  if (!raw || !raw.includes('?')) return '';
  return '?' + String(raw).split('?').slice(1).join('?');
}

export default function handler(req, res) {
  const raw = req.url || req.originalUrl || '';
  const path = getPathname(raw);
  const query = getQuery(raw);
  const normalizedPath = path.startsWith('/api') ? path : '/api' + (path.startsWith('/') ? path : '/' + path);
  const normalizedUrl = normalizedPath + query;
  try {
    Object.defineProperty(req, 'url', { value: normalizedUrl, writable: false, configurable: true });
  } catch (_) {
    req.url = normalizedUrl;
  }
  return app(req, res);
}
