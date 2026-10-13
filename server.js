const http = require('http');
const fs = require('fs');
const path = require('path');
const { createConfigStore } = require('./config-store.js');
const { createSessionStore, checkPassword } = require('./auth-store.js');

const PORT = process.env.PORT || 3000;

const SESSION_COOKIE_NAME = 'rush_admin_session';
const SESSION_MAX_AGE_SECONDS = 43200;

const configStore = createConfigStore(
  path.join(process.env.RUSH_DATA_DIR || __dirname, 'data', 'instagram-config.json')
);
const sessionStore = createSessionStore();

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let bodyData = '';
    req.on('data', (chunk) => { bodyData += chunk; });
    req.on('end', () => {
      try {
        resolve(bodyData ? JSON.parse(bodyData) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function sendJson(res, statusCode, body, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    ...extraHeaders
  });
  res.end(JSON.stringify(body));
}

function buildSessionCookie(token, maxAgeSeconds) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function requireValidSession(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return false;
  return sessionStore.validateSession(token);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  let reqUrl = req.url.split('?')[0];
  if (reqUrl === '/') reqUrl = '/index.html';

  const filePath = path.join(__dirname, reqUrl);

  // Security check: ensure within root
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Acesso Negado');
    return;
  }

  // Proxy endpoint to eliminate browser CORS issues
  if (reqUrl === '/api/chat' && req.method === 'POST') {
    let bodyData = '';
    req.on('data', chunk => { bodyData += chunk; });
    req.on('end', async () => {
      try {
        let parsed = {};
        try {
          parsed = JSON.parse(bodyData || '{}');
        } catch(e) {
          parsed = { chatInput: bodyData || 'Olá' };
        }
        const targetUrl = parsed.targetUrl || 'https://n8n-n8n-start.hup4p9.easypanel.host/webhook/85ea5a82-d106-42d8-8b5f-019fbe0df35e';
        const method = parsed.method || 'POST';

        const payload = {
          action: 'sendMessage',
          chatInput: parsed.chatInput || parsed.message || 'Olá',
          message: parsed.message || parsed.chatInput || 'Olá',
          sessionId: parsed.sessionId || 'syrinx-2112',
          timestamp: new Date().toISOString()
        };

        let n8nResponse;
        let isGet = method === 'GET' || targetUrl.includes('85ea5a82');

        if (!isGet) {
          try {
            n8nResponse = await fetch(targetUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });

            if (!n8nResponse.ok && n8nResponse.status === 404) {
              const checkText = await n8nResponse.clone().text();
              if (checkText.includes('GET request')) {
                isGet = true; // Auto-detect that n8n demands GET
              }
            }
          } catch (e) {
            isGet = true;
          }
        }

        if (isGet) {
          const u = new URL(targetUrl);
          u.searchParams.set('chatInput', payload.chatInput);
          u.searchParams.set('message', payload.message);
          u.searchParams.set('sessionId', payload.sessionId);
          u.searchParams.set('action', 'sendMessage');
          n8nResponse = await fetch(u.toString(), { method: 'GET' });
        }

        const resContentType = n8nResponse.headers.get('content-type') || '';
        let resBody;
        if (resContentType.includes('application/json')) {
          resBody = await n8nResponse.json();
        } else {
          resBody = await n8nResponse.text();
        }

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=UTF-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(typeof resBody === 'string' ? JSON.stringify({ output: resBody }) : JSON.stringify(resBody));

      } catch (err) {
        console.error('Proxy error:', err.message);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=UTF-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          error: true,
          message: err.message
        }));
      }
    });
    return;
  }

  if (reqUrl === '/api/instagram-config' && req.method === 'GET') {
    const apiKey = process.env.INSTAGRAM_CONFIG_API_KEY;
    if (!apiKey) {
      sendJson(res, 503, { error: 'not_configured' });
      return;
    }
    if (!checkPassword(req.headers['x-api-key'], apiKey)) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    configStore.read()
      .then((config) => {
        sendJson(res, 200, { triggerWord: config.triggerWord, dmMessage: config.dmMessage });
      })
      .catch((err) => {
        console.error('Config read error:', err.message);
        sendJson(res, 500, { error: 'internal_error' });
      });
    return;
  }

  if (reqUrl === '/api/admin/login' && req.method === 'POST') {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      sendJson(res, 503, { error: 'not_configured' });
      return;
    }
    readJsonBody(req)
      .then((body) => {
        if (!checkPassword(body.password, adminPassword)) {
          sendJson(res, 401, { error: 'invalid_password' });
          return;
        }
        const token = sessionStore.createSession();
        sendJson(res, 200, { ok: true }, {
          'Set-Cookie': buildSessionCookie(token, SESSION_MAX_AGE_SECONDS)
        });
      })
      .catch(() => {
        sendJson(res, 400, { error: 'invalid_body' });
      });
    return;
  }

  if (reqUrl === '/api/admin/logout' && req.method === 'POST') {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE_NAME];
    if (token) sessionStore.revokeSession(token);
    sendJson(res, 200, { ok: true }, {
      'Set-Cookie': buildSessionCookie('', 0)
    });
    return;
  }

  if (reqUrl === '/api/admin/instagram-config' && req.method === 'GET') {
    if (!requireValidSession(req)) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    configStore.read()
      .then((config) => {
        sendJson(res, 200, config);
      })
      .catch((err) => {
        console.error('Config read error:', err.message);
        sendJson(res, 500, { error: 'internal_error' });
      });
    return;
  }

  if (reqUrl === '/api/admin/instagram-config' && req.method === 'POST') {
    if (!requireValidSession(req)) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    readJsonBody(req)
      .then((body) => configStore.write({ triggerWord: body.triggerWord, dmMessage: body.dmMessage }))
      .then((config) => {
        sendJson(res, 200, config);
      })
      .catch((err) => {
        if (err instanceof SyntaxError) {
          sendJson(res, 400, { error: 'invalid_body' });
        } else if (err.message === 'INVALID_CONFIG') {
          sendJson(res, 400, { error: 'invalid_input' });
        } else {
          console.error('Config write error:', err.message);
          sendJson(res, 500, { error: 'internal_error' });
        }
      });
    return;
  }

  if (reqUrl === '/admin' && req.method === 'GET') {
    const adminFilePath = path.join(__dirname, 'admin.html');
    fs.stat(adminFilePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('404 Not Found - Templo de Syrinx');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME_TYPES['.html'],
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(adminFilePath).pipe(res);
    });
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Not Found - Templo de Syrinx');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.setTimeout(360000); // 6 minutes for AI Agent deep search

module.exports = { server, PORT };

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`⚡ RUSH_VERSO // SOLAR FEDERATION TERMINAL 2112`);
    console.log(` Servidor local ativo em: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
  });
}
