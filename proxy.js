#!/usr/bin/env node
/**
 * Claude Mobile cloud proxy
 *
 * Deploy to Glitch.com (free, always on):
 *   1. Go to glitch.com → New Project → Import from GitHub
 *      OR glitch.com → New Project → glitch-hello-node, then replace server.js
 *   2. Paste this file as server.js
 *   3. In Glitch: Tools → .env → add:  API_KEY=fe_oa_xxxxxxxx
 *   4. Your proxy URL will be: https://your-project-name.glitch.me
 *   5. In Flutter app: Settings → Base URL → https://your-project-name.glitch.me
 *
 * The proxy forwards to cc.freemodel.dev using Node.js (same TLS as Claude Code).
 */

const http  = require('http');
const https = require('https');

// Glitch / Render / Railway set PORT automatically.
const PORT = process.env.PORT || 3000;

// Optional: hardcode the API key in the .env file so you don't expose it in the app.
// If not set, the key from the Flutter app's x-api-key header is used instead.
const HARDCODED_KEY = process.env.API_KEY || '';

const TARGET_HOST = 'cc.freemodel.dev';

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    res.end();
    return;
  }

  // Health check so the hosting platform knows the server is alive.
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Claude Mobile Proxy is running.');
    return;
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);

    const apiKey =
      HARDCODED_KEY ||
      req.headers['x-api-key'] ||
      (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '') ||
      '';

    if (!apiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { type: 'auth_error', message: 'No API key provided.' } }));
      return;
    }

    const options = {
      hostname: TARGET_HOST,
      port:     443,
      path:     req.url,
      method:   req.method,
      headers: {
        'content-type':    'application/json',
        'accept':          req.headers['accept'] || 'text/event-stream',
        'content-length':  body.length,

        'x-api-key':     apiKey,
        'authorization': `Bearer ${apiKey}`,

        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14',

        // Exact Claude Code CLI identity — this is what cc.freemodel.dev checks.
        'user-agent':                  'claude-cli/1.0.58 (external, cli)',
        'x-app':                       'cli',
        'x-stainless-lang':            'js',
        'x-stainless-package-version': '0.55.1',
        'x-stainless-os':              'Windows',
        'x-stainless-arch':            'x64',
        'x-stainless-runtime':         'node',
        'x-stainless-runtime-version': 'v22.12.0',
        'x-stainless-retry-count':     '0',
      },
    };

    console.log(`→ ${req.method} ${req.url} [${new Date().toISOString()}]`);

    const proxyReq = https.request(options, (proxyRes) => {
      console.log(`← ${proxyRes.statusCode}`);
      res.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        'access-control-allow-origin': '*',
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Error:', err.message);
      if (!res.headersSent) res.writeHead(502);
      res.end(JSON.stringify({ error: { type: 'proxy_error', message: err.message } }));
    });

    proxyReq.write(body);
    proxyReq.end();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Claude Mobile Proxy running on port ${PORT}`);
});
