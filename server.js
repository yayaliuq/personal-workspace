const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3100;
const HOST = '0.0.0.0'; // 监听所有网络接口，手机可通过局域网访问
const os = require('os');

// 获取局域网 IP
function getLanIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Obsidian Vault 数据目录
const DATA_DIR = '/Users/liuquan/Desktop/工作/2026年/000学习/obsidian/obsidian/个人工作台/数据';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readFile(filename) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    return fs.readFileSync(filepath, 'utf-8');
  } catch (e) {
    return '';
  }
}

function writeFile(filename, content) {
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, content, 'utf-8');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ---- API: Read markdown file ----
  if (url.pathname === '/api/read') {
    const file = url.searchParams.get('file');
    if (!file) {
      res.writeHead(400);
      res.end('Missing file parameter');
      return;
    }
    const content = readFile(file);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(content);
    return;
  }

  // ---- API: Write markdown file ----
  if (url.pathname === '/api/write' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { file, content } = JSON.parse(body);
        writeFile(file, content);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // ---- API: Health check ----
  if (url.pathname === '/api/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, time: new Date().toISOString() }));
    return;
  }

  // ---- Static files ----
  let filePath = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  } catch (e) {
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

server.listen(PORT, HOST, () => {
  const lanIP = getLanIP();
  console.log('');
  console.log('  📋 个人工作台已启动');
  console.log(`  电脑访问: http://localhost:${PORT}`);
  console.log(`  手机访问: http://${lanIP}:${PORT}`);
  console.log('');
  console.log('  数据目录: ' + DATA_DIR);
  console.log('  按 Ctrl+C 停止服务');
  console.log('');
});
