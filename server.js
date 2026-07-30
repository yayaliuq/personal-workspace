/**
 * 鸭鸭的加油站 v6.0 — 本地静态文件服务 + Obsidian 同步
 *
 * v6.0 架构变更：
 *   - 前端通过 CloudBase JS SDK 直连云端数据库，不再需要本地 API 中转
 *   - server.js 仅提供静态文件服务 + 可选的 Obsidian 同步
 *   - 保留 /api/sync-to-obsidian 和 /api/ping 兼容旧调用
 *
 * 启动: node server.js
 * 访问: http://localhost:3100
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3100;
const HOST = '0.0.0.0';
const PROJECT_DIR = __dirname;

// Obsidian Vault 镜像目录（可选，仅本地使用）
const OBSIDIAN_DIR = process.env.OBSIDIAN_DIR || path.join(os.homedir(), 'Desktop/工作/2026年/000学习/obsidian/obsidian/个人工作台/数据');

// ============================================================
// MIME 类型
// ============================================================
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

// ============================================================
// 获取局域网 IP
// ============================================================
function getLanIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

// ============================================================
// Obsidian 同步（可选功能）
// ============================================================
function syncToObsidian() {
  if (!fs.existsSync(OBSIDIAN_DIR)) {
    console.warn('  [obsidian] 目录不存在，跳过同步:', OBSIDIAN_DIR);
    return 0;
  }
  const dataDir = path.join(PROJECT_DIR, '数据');
  if (!fs.existsSync(dataDir)) return 0;

  let synced = 0;
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.md'));
  for (const f of files) {
    const repoFile = path.join(dataDir, f);
    const obsFile = path.join(OBSIDIAN_DIR, f);
    try {
      const repoContent = fs.readFileSync(repoFile, 'utf-8');
      let needSync = true;
      if (fs.existsSync(obsFile)) {
        const obsContent = fs.readFileSync(obsFile, 'utf-8');
        needSync = repoContent !== obsContent;
      }
      if (needSync) {
        fs.writeFileSync(obsFile, repoContent, 'utf-8');
        synced++;
      }
    } catch (e) {
      console.error('  [obsidian] 同步失败:', f, e.message);
    }
  }
  if (synced > 0) console.log(`  [obsidian] 已同步 ${synced} 个文件`);
  return synced;
}

// ============================================================
// HTTP 服务
// ============================================================
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ---- API: Ping ----
  if (url.pathname === '/api/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: '6.0', time: new Date().toISOString() }));
    return;
  }

  // ---- API: 手动同步到 Obsidian ----
  if (url.pathname === '/api/sync-to-obsidian') {
    const count = syncToObsidian();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, synced: count, time: new Date().toISOString() }));
    return;
  }

  // ---- 静态文件服务 ----
  let filePath = path.join(PROJECT_DIR, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
  if (!filePath.startsWith(PROJECT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      // SPA 回退：非文件请求一律返回 index.html
      const indexFile = path.join(PROJECT_DIR, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(indexFile).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    }
  } catch (e) {
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

server.listen(PORT, HOST, () => {
  const lanIP = getLanIP();
  console.log('');
  console.log('  鸭鸭的加油站 v6.0 — CloudBase 直连 + 静态服务');
  console.log(`  电脑访问: http://localhost:${PORT}`);
  console.log(`  手机访问: http://${lanIP}:${PORT}`);
  console.log('');
  console.log('  数据通道: CloudBase SDK 直连云端');
  console.log('  Obsidian: ' + (fs.existsSync(OBSIDIAN_DIR) ? OBSIDIAN_DIR : '(未配置，跳过同步)'));
  console.log('');
  console.log('  按 Ctrl+C 停止服务');
  console.log('');
});
