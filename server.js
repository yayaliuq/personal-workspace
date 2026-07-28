const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const PORT = 3100;
const HOST = '0.0.0.0';

// ============================================================
// 路径配置
// ============================================================
const PROJECT_DIR = __dirname;

// ★ 主数据目录：Git 仓库内的 数据/（与手机 GitHub API 读写同一位置）
const DATA_DIR = path.join(PROJECT_DIR, '数据');

// Obsidian Vault 镜像目录（仅用于每日/手动同步）
const OBSIDIAN_DIR = '/Users/liuquan/Desktop/工作/2026年/000学习/obsidian/obsidian/个人工作台/数据';

// SSH key 路径
const SSH_KEY = path.join(PROJECT_DIR, 'github_key');

// ============================================================
// 目录初始化
// ============================================================
for (const dir of [DATA_DIR, OBSIDIAN_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ============================================================
// Git 操作
// ============================================================
const GIT_ENV = {
  ...process.env,
  GIT_SSH_COMMAND: `ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no`
};

function git(cmd) {
  try {
    return execSync(cmd, { cwd: PROJECT_DIR, env: GIT_ENV, encoding: 'utf-8', timeout: 30000 }).trim();
  } catch (e) {
    console.error('  [git] 失败:', e.message.slice(0, 100));
    return null;
  }
}

function gitPull() {
  const result = git('git pull origin main 2>&1');
  if (result === null) return false;
  return true;
}

function gitPush() {
  const status = git('git status --porcelain 数据/ 2>&1');
  if (status === null) return false;
  if (!status) {
    console.log('  [git] 无变更，跳过推送');
    return true;
  }

  git('git add 数据/');
  const ts = new Date().toLocaleString('zh-CN', { hour12: false });
  const result = git(`git commit -m "sync: ${ts}" 2>&1`);
  if (result === null && !result) {
    // 可能没有变更（空提交）
  }

  const pushResult = git('git push origin main 2>&1');
  if (pushResult !== null) {
    console.log('  [git] 已推送到 GitHub');
    return true;
  }
  return false;
}

// ============================================================
// Obsidian 镜像同步（单向：GitHub → Obsidian）
// ============================================================
function syncToObsidian() {
  const files = ['待办任务.md', '学习进度.md', '理财记录.md'];
  let synced = 0;
  for (const f of files) {
    const repoFile = path.join(DATA_DIR, f);
    const obsFile = path.join(OBSIDIAN_DIR, f);
    try {
      if (!fs.existsSync(repoFile)) continue;
      const repoContent = fs.readFileSync(repoFile, 'utf-8');

      // 只在内容不同时才覆盖
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
  if (synced > 0) {
    console.log(`  [obsidian] 已将 ${synced} 个文件同步到 Obsidian Vault`);
  }
  return synced;
}

// ============================================================
// 获取局域网 IP
// ============================================================
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

// ============================================================
// 文件读写（主数据源：Git 仓库 数据/）
// ============================================================
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

// 写操作防抖定时器
let pushTimer = null;
function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    gitPush();
    // 推送后自动同步到 Obsidian
    syncToObsidian();
  }, 3000);
}

// Obsidian 每日同步记录（避免重复触发）
let lastObsidianSyncDay = '';

function dailyObsidianSync() {
  const today = new Date().toISOString().slice(0, 10);
  if (lastObsidianSyncDay !== today) {
    lastObsidianSyncDay = today;
    console.log('  [obsidian] 每日定时同步...');
    syncToObsidian();
  }
}

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

  // ---- API: Write markdown file (→ Git 仓库 → 自动 push) ----
  if (url.pathname === '/api/write' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { file, content } = JSON.parse(body);
        writeFile(file, content);
        schedulePush();  // 3 秒防抖，自动 git push + 同步 Obsidian
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // ---- API: 手动同步到 Obsidian ----
  if (url.pathname === '/api/sync-to-obsidian') {
    const count = syncToObsidian();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, synced: count, time: new Date().toISOString() }));
    return;
  }

  // ---- API: Git 拉取 + 同步 ----
  if (url.pathname === '/api/sync') {
    gitPull();
    syncToObsidian();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, time: new Date().toISOString() }));
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
  console.log('  📋 个人工作台 v3.2 — GitHub 主数据源 + Obsidian 镜像');
  console.log(`  电脑访问: http://localhost:${PORT}`);
  console.log(`  手机访问: http://${lanIP}:${PORT}`);
  console.log('');
  console.log('  主数据源: ' + DATA_DIR + '  →  GitHub 仓库');
  console.log('  Obsidian:  ' + OBSIDIAN_DIR + '  (每日镜像)');
  console.log('');

  // 启动流程：拉取 GitHub → 同步到 Obsidian
  console.log('  [sync] 正在从 GitHub 拉取最新数据...');
  gitPull();
  syncToObsidian();
  console.log('  [sync] 启动同步完成');

  // 每 120 秒 git pull（获取手机端改动）+ 自动同步 Obsidian
  setInterval(() => {
    const pulled = gitPull();
    if (pulled) {
      syncToObsidian();
    }
    // 每日固定时间也同步一次（兜底）
    dailyObsidianSync();
  }, 120000);

  console.log('');
  console.log('  按 Ctrl+C 停止服务');
  console.log('');
});
