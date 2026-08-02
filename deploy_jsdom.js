const { JSDOM } = require('jsdom');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ENV_ID = 'yayaliu-d4g1i1dc2fdb04417';

function nodeFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const body = options.body || '';
    const req = mod.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        text: () => Promise.resolve(data),
        json: () => Promise.resolve(JSON.parse(data)),
        headers: { get: (k) => res.headers[k.toLowerCase()] }
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const filePath = path.join(__dirname, 'index.html');
  const content = fs.readFileSync(filePath, 'utf-8');
  console.log(`准备部署 index.html (${content.length} 字节)`);

  // 下载 SDK
  console.log('1. 下载 CloudBase SDK...');
  const sdkCode = await new Promise((resolve, reject) => {
    https.get('https://static.cloudbase.net/cloudbase-js-sdk/2.32.0/cloudbase.full.js', (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    }).on('error', reject);
  });
  console.log(`   SDK ${sdkCode.length} 字节`);

  // 创建 jsdom
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: `https://${ENV_ID}.tcloudbaseapp.com/`,
    runScripts: 'dangerously'
  });
  const { window } = dom;

  // 注入 AbortController
  window.AbortController = class AbortController {
    constructor() { this.signal = { aborted: false, addEventListener: () => {}, removeEventListener: () => {} }; }
    abort() { this.signal.aborted = true; }
  };
  global.AbortController = window.AbortController;

  // 注入 fetch（带 signal 支持）
  window.fetch = function(url, options = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const mod = u.protocol === 'https:' ? https : http;
      const body = options.body || '';
      const req = mod.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: () => Promise.resolve(data),
          json: () => Promise.resolve(JSON.parse(data)),
          headers: { get: (k) => res.headers[k.toLowerCase()] }
        }));
      });
      req.on('error', reject);
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
      if (body) req.write(body);
      req.end();
    });
  };
  global.fetch = window.fetch;
  window.Request = class Request {
    constructor(url, opts = {}) { this.url = url; this.method = opts.method || 'GET'; this.headers = new Map(Object.entries(opts.headers || {})); this.body = opts.body; }
  };
  window.Response = class Response {};

  // 注入 XMLHttpRequest（jsdom 自带但可能不完整，用 fetch 实现）
  window.XMLHttpRequest = class XMLHttpRequest {
    constructor() {
      this.readyState = 0;
      this.status = 0;
      this.responseText = '';
      this.response = '';
      this._headers = {};
      this._method = 'GET';
      this._url = '';
      this._async = true;
    }
    open(method, url, async) {
      this._method = method;
      this._url = url;
      this._async = async !== false;
      this.readyState = 1;
      if (this.onreadystatechange) this.onreadystatechange();
    }
    setRequestHeader(k, v) { this._headers[k] = v; }
    send(body) {
      nodeFetch(this._url, {
        method: this._method,
        headers: this._headers,
        body: body
      }).then(res => {
        this.status = res.status;
        this.readyState = 4;
        return res.text();
      }).then(text => {
        this.responseText = text;
        this.response = text;
        if (this.onreadystatechange) this.onreadystatechange();
        if (this.onload) this.onload();
      }).catch(err => {
        this.readyState = 4;
        this.status = 0;
        if (this.onerror) this.onerror(err);
      });
    }
  };

  // 注入 SDK
  window.eval(sdkCode);
  console.log('2. SDK 注入完成');

  // 初始化
  const app = window.cloudbase.init({ env: ENV_ID });
  console.log('   app methods:', Object.keys(app).join(', '));
  
  const auth = app.auth({ persistence: 'local' });
  
  // 登录
  console.log('3. 登录...');
  const loginResult = await auth.signInWithPassword({ username: 'admin', password: 'Admin123' });
  if (loginResult.error) {
    console.error('   登录失败:', loginResult.error.code, loginResult.error.message || '');
    window.close();
    return;
  }
  console.log('   登录成功!');

  // 尝试上传
  console.log('4. 上传文件...');
  
  // 检查 storage 是否可用
  if (typeof app.storage === 'function') {
    const storage = app.storage();
    console.log('   storage 方法:', Object.getOwnPropertyNames(Object.getPrototypeOf(storage)).join(', '));
    
    try {
      const result = await storage.uploadFile({
        cloudPath: 'index.html',
        filePath: filePath
      });
      console.log('   上传成功:', JSON.stringify(result).substring(0, 200));
      
      const urls = await storage.getDownloadURL(['index.html']);
      console.log('   访问URL:', JSON.stringify(urls));
    } catch (e) {
      console.error('   上传失败:', e.message || e);
    }
  } else {
    console.log('   storage 不可用，尝试数据库方式...');
    
    // 用数据库存储 HTML 内容
    const db = app.database();
    const _ = db.command;
    
    // 查询是否已有记录
    try {
      const existing = await db.collection('site_files').where({ filename: 'index.html' }).get();
      console.log('   现有记录:', existing.data.length, '条');
      
      if (existing.data.length > 0) {
        // 更新
        const id = existing.data[0]._id;
        await db.collection('site_files').doc(id).update({
          content: content,
          updatedAt: new Date().toISOString()
        });
        console.log('   数据库更新成功! ID:', id);
      } else {
        // 新增
        const result = await db.collection('site_files').add({
          filename: 'index.html',
          content: content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        console.log('   数据库新增成功! ID:', result._id);
      }
    } catch (e) {
      console.error('   数据库操作失败:', e.message || e);
    }
  }

  window.close();
  console.log('\n部署完成!');
}

main().catch(e => console.error('Fatal:', e.message || e));
