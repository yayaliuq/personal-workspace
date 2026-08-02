// CloudBase 文件上传脚本 - 用用户名密码登录后上传到文件存储
const http = require('https');
const fs = require('fs');

const ENV_ID = 'yayaliu-d4g1i1dc2fdb04417';
const GATEWAY = `${ENV_ID}.api.tcloudbasegateway.com`;

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  // 1. 登录获取 access_token
  console.log('1. 登录 CloudBase...');
  const loginRes = await fetch(`https://${GATEWAY}/auth/v1/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-device-id': 'workbuddy-sandbox-001' },
    body: JSON.stringify({ username: 'admin', password: 'Admin123' })
  });
  const loginData = JSON.parse(loginRes.data);
  if (!loginData.access_token) { console.error('登录失败:', loginData); return; }
  console.log('   登录成功, token长度:', loginData.access_token.length);
  const token = loginData.access_token;

  // 2. 获取上传签名URL
  console.log('2. 获取上传签名URL...');
  const signRes = await fetch(`https://${GATEWAY}/storage/v1/upload-sign?path=index.html`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ path: 'index.html' })
  });
  console.log('   签名响应状态:', signRes.status);
  console.log('   签名响应:', signRes.data.substring(0, 300));

  // 尝试不同的API路径
  const paths = [
    '/storage/v1/upload',
    '/storage/v1/files',
    '/storage/v1/objects',
    '/api/v1/storage/upload',
    '/v1/storage/upload',
  ];
  for (const p of paths) {
    const r = await fetch(`https://${GATEWAY}${p}?path=index.html`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'index.html' })
    });
    console.log(`   ${p}: ${r.status} ${r.data.substring(0, 100)}`);
  }
}

main().catch(e => console.error('Error:', e.message));
