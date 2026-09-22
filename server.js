const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

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

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`⚡ RUSH_VERSO // SOLAR FEDERATION TERMINAL 2112`);
  console.log(` Servidor local ativo em: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
