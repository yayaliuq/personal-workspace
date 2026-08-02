/**
 * CloudBase 无密钥部署脚本
 * 
 * 原理：用用户名密码登录 CloudBase → 把 index.html 内容写入数据库 → 前端 loader 页面读取并渲染
 * 
 * 用法：node deploy.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const ENV_ID = 'yayaliu-d4g1i1dc2fdb04417';
const GATEWAY = `${ENV_ID}.api.tcloudbasegateway.com`;

function httpReq(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = options.body || '';
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: { ...options.headers, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const fileToDeploy = process.argv[2] || 'index.html';
  const filePath = path.join(__dirname, fileToDeploy);
  
  if (!fs.existsSync(filePath)) {
    console.error(`文件不存在: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  console.log(`准备部署: ${fileToDeploy} (${content.length} 字节)`);

  // 1. 登录
  console.log('1. 登录 CloudBase...');
  const loginRes = await httpReq(`https://${GATEWAY}/auth/v1/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-device-id': 'workbuddy-deploy' },
    body: JSON.stringify({ username: 'admin', password: 'Admin123' })
  });
  const loginData = JSON.parse(loginRes.data);
  if (!loginData.access_token) {
    console.error('登录失败:', loginData);
    process.exit(1);
  }
  const token = loginData.access_token;
  console.log('   登录成功');

  // 2. 写入数据库（用旧版 CloudBase 数据库 HTTP API）
  console.log('2. 写入数据库 site_files 集合...');
  
  // 先查询是否已有记录
  const queryRes = await httpReq(`https://${GATEWAY}/api/v2/db?env=${ENV_ID}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'database.queryDocument',
      data: { env: ENV_ID, query: 'db.collection("site_files").where({filename:"' + fileToDeploy + '"}).get()' }
    })
  });
  
  let existingId = null;
  try {
    const queryData = JSON.parse(queryRes.data);
    if (queryData.data && queryData.data.data && queryData.data.data.length > 0) {
      existingId = queryData.data.data[0]._id;
      console.log('   找到已有记录:', existingId);
    }
  } catch (e) {
    console.log('   查询结果:', queryRes.data.substring(0, 200));
  }

  // 写入/更新记录
  const action = existingId ? 'database.updateDocument' : 'database.addDocument';
  const docData = {
    env: ENV_ID,
    collection: 'site_files',
    data: { filename: fileToDeploy, content: content, updatedAt: new Date().toISOString() }
  };
  if (existingId) docData.id = existingId;

  const writeRes = await httpReq(`https://${GATEWAY}/api/v2/db?env=${ENV_ID}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: action,
      data: docData
    })
  });
  
  console.log('   写入结果:', writeRes.status, writeRes.data.substring(0, 200));
  console.log('\n部署完成！手机访问 loader.html 即可看到最新版。');
}

main().catch(e => console.error('Error:', e));
