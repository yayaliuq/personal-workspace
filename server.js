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

// Obsidian Vault 数据目录（Mac 本地读写）
const OBSIDIAN_DATA_DIR = '/Users/liuquan/Desktop/工作/2026年/000学习/obsidian/obsidian/个人工作台/数据';

// Git 仓库数据目录（用于 GitHub 同步）
const REPO_DATA_DIR = path.join(PROJECT_DIR, '数据');

// SSH key 路径
const SSH_KEY = path.join(PROJECT_DIR, 'github_key');

// ============================================================
// 目录初始化
// ============================================================
for (const dir of [OBSIDIAN_DATA_DIR, REPO_DATA_DIR]) {
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
    console.error('  [git] 失败:', cmd, e.message.slice(0, 100));
    return null;
  }
}

// 从 GitHub 拉取最新数据
function gitPull() {
  const result = git('git pull origin main 2>&1');
  if (result === null) return false;
  // "Already up to date." 也算成功
  return true;
}

// 推送本地数据到 GitHub
function gitPush() {
  // 先把数据文件复制到 repo 数据目录
  syncObsidianToRepo();

  // 检查是否有变更
  const status = git('git status --porcelain 数据/ 2>&1');
  if (status === null) return false;
  if (!status) {
    console.log('  [git] 无变更，跳过推送');
    return true;
  }

  git('git add 数据/');
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const result = git(`git commit -m "sync: ${ts}" 2>&1`);
  if (result === null) return false;  // 可能没有变更

  const pushResult = git('git push origin main 2>&1');
  if (pushResult !== null) {
    console.log('  [git] 已推送到 GitHub');
    return true;
  }
  return false;
}

// ============================================================
// 文件同步
// ============================================================

// 复制 Obsidian Vault 数据到 Git 仓库数据目录
function syncObsidianToRepo() {
  const files = ['待办任务.md', '学习进度.md', '理财记录.md'];
  for (const f of files) {
    const src = path.join(OBSIDIAN_DATA_DIR, f);
    const dst = path.join(REPO_DATA_DIR, f);
    try {
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
      }
    } catch (e) {
      console.error('  [sync] 复制失败:', f, e.message);
    }
  }
}

// 从 Git 仓库同步到 Obsidian Vault（手机改动回传）
function syncRepoToObsidian() {
  const files = ['待办任务.md', '学习进度.md', '理财记录.md'];
  let synced = 0;
  for (const f of files) {
    const repoFile = path.join(REPO_DATA_DIR, f);
    const obsidianFile = path.join(OBSIDIAN_DATA_DIR, f);
    try {
      if (!fs.existsSync(repoFile)) continue;
      const repoStat = fs.statSync(repoFile);
      const repoMtime = repoStat.mtimeMs;

      let obsidianNewer = false;
      if (fs.existsSync(obsidianFile)) {
        const obsStat = fs.statSync(obsidianFile);
        obsidianNewer = obsStat.mtimeMs >= repoMtime;
      }

      // 只在 repo 版本更新时才覆盖 Obsidian
      if (!obsidianNewer) {
        fs.copyFileSync(repoFile, obsidianFile);
        synced++;
      }
    } catch (e) {
      console.error('  [sync] 同步失败:', f, e.message);
    }
  }
  if (synced > 0) {
    console.log(`  [sync] 已将 ${synced} 个文件从 GitHub 同步到 Obsidian Vault`);
  }
}

// 启动时全量同步
function fullSync() {
  console.log('  [sync] 正在从 GitHub 拉取最新数据...');
  const pulled = gitPull();
  if (pulled) {
    syncRepoToObsidian();
    // 同时也把 Obsidian 的最新数据推上去（如果有本地离线编辑的）
    gitPush();
  }
  console.log('  [sync] 同步完成');
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
// 文件读写（读写 Obsidian Vault）
// ============================================================
function readFile(filename) {
  const filepath = path.join(OBSIDIAN_DATA_DIR, filename);
  try {
    return fs.readFileSync(filepath, 'utf-8');
  } catch (e) {
    return '';
  }
}

function writeFile(filename, content) {
  // 同时写入两个位置
  const obsidianPath = path.join(OBSIDIAN_DATA_DIR, filename);
  const repoPath = path.join(REPO_DATA_DIR, filename);
  fs.writeFileSync(obsidianPath, content, 'utf-8');
  fs.writeFileSync(repoPath, content, 'utf-8');
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

// 写操作防抖定时器（避免频繁 git push）
let pushTimer = null;
function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    gitPush();
  }, 3000);  // 3秒内无操作再推送
}

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
        // 延迟推送（3 秒防抖）
        schedulePush();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // ---- API: Manual sync ----
  if (url.pathname === '/api/sync') {
    gitPull();
    syncRepoToObsidian();
    syncObsidianToRepo();
    gitPush();
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
  console.log('  📋 个人工作台 v3.1 — GitHub 双向同步');
  console.log(`  电脑访问: http://localhost:${PORT}`);
  console.log(`  手机访问: http://${lanIP}:${PORT}`);
  console.log('');
  console.log('  数据目录: ' + OBSIDIAN_DATA_DIR);
  console.log('  GitHub:  https://github.com/yayaliuq/personal-workspace');
  console.log('');
  
  // 启动时同步
  fullSync();

  // 每 120 秒自动从 GitHub 拉取（手机端改动）
  setInterval(() => {
    console.log('  [sync] 定期拉取...');
    gitPull();
    syncRepoToObsidian();
  }, 120000);

  console.log('  按 Ctrl+C 停止服务');
  console.log('');
});
