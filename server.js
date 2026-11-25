const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const UPLOADS_DIR = path.join(ROOT, 'uploads');

// Permanent Cloud Scan URL (Tencent EdgeOne / Custom Cloud Hosting)
const CLOUD_SCAN_URL = process.env.CLOUD_SCAN_URL || 'https://digital-plum-ftdtrsmm.edgeone.dev/scan.html';

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

// Global tunnel state
let publicTunnelUrl = null;
let tunnelProcess = null;

// Detect local IPv4 addresses
function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// 1. Primary Cloud Upload: Catbox.moe (Free, Fast, Permanent, CORS *)
function uploadToCatbox(buffer, filename) {
  return new Promise((resolve, reject) => {
    const boundary = '----NodeFormBoundary' + Math.random().toString(36).substring(2);
    const postData = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const req = https.request({
      hostname: 'catbox.moe',
      port: 443,
      path: '/user/api.php',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': postData.length,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 12000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const trimmed = data.trim();
        if (res.statusCode === 200 && trimmed.startsWith('https://')) {
          resolve(trimmed);
        } else {
          reject(new Error(`Catbox error (${res.statusCode}): ${trimmed}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Catbox timeout')); });
    req.write(postData);
    req.end();
  });
}

// 2. Secondary Cloud Upload Fallback: Tmpfiles.org
function uploadToTmpfiles(buffer, filename) {
  return new Promise((resolve, reject) => {
    const boundary = '----NodeFormBoundary' + Math.random().toString(36).substring(2);
    const postData = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const req = https.request({
      hostname: 'tmpfiles.org',
      port: 443,
      path: '/api/v1/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': postData.length,
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 12000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'success' && json.data && json.data.url) {
            const directUrl = json.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
            resolve(directUrl);
          } else {
            reject(new Error('Tmpfiles error: ' + data));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Tmpfiles timeout')); });
    req.write(postData);
    req.end();
  });
}

// Multi-cloud uploader with automatic failover
async function uploadPhotoToCloud(buffer, filename) {
  try {
    const catboxUrl = await uploadToCatbox(buffer, filename);
    console.log(`[Cloud Storage] Sukses upload ke Catbox: ${catboxUrl}`);
    return catboxUrl;
  } catch (err1) {
    console.warn(`[Cloud Storage] Catbox fallback (${err1.message}), mencoba Tmpfiles...`);
    try {
      const tmpUrl = await uploadToTmpfiles(buffer, filename);
      console.log(`[Cloud Storage] Sukses upload ke Tmpfiles: ${tmpUrl}`);
      return tmpUrl;
    } catch (err2) {
      console.error(`[Cloud Storage] Semua cloud uploader gagal: ${err2.message}`);
      return null;
    }
  }
}

const server = http.createServer((req, res) => {
  // CORS enabled
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // API 1: Upload Photo from Kiosk Camera (Local + Auto Cloud Multi-Storage)
  if (req.method === 'POST' && pathname === '/api/upload-photo') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 15 * 1024 * 1024) req.destroy();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const id = (data.id || 'photo_' + Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_');
        const photoStr = data.photo || '';

        if (!photoStr) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No photo provided' }));
          return;
        }

        const base64Data = photoStr.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `${id}.jpg`;
        const filepath = path.join(UPLOADS_DIR, filename);

        // 1. Local backup save
        fs.writeFileSync(filepath, buffer);
        console.log(`[Local Upload] Foto tersimpan lokal: uploads/${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);

        // 2. Multi-Cloud Upload
        let cloudUrl = null;
        try {
          cloudUrl = await uploadPhotoToCloud(buffer, filename);
        } catch (e) {
          console.warn('[Cloud Upload Warn]', e.message);
        }

        const host = req.headers.host || `localhost:${PORT}`;
        const proto = req.headers['x-forwarded-proto'] || 'http';
        const localFullUrl = publicTunnelUrl ? `${publicTunnelUrl}/uploads/${filename}` : `${proto}://${host}/uploads/${filename}`;
        const finalUrl = cloudUrl || localFullUrl;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          filename: filename,
          cloudUrl: cloudUrl,
          url: finalUrl,
          fullUrl: finalUrl,
          localUrl: `/uploads/${filename}`
        }));
      } catch (err) {
        console.error('[Upload Error]', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to process photo' }));
      }
    });
    return;
  }

  // API 2: Dynamic Booth Config (Cloud Scan URL & Ports)
  if (req.method === 'GET' && pathname === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      cloudScanUrl: CLOUD_SCAN_URL,
      tunnelUrl: publicTunnelUrl,
      localIps: getLocalIps(),
      port: PORT,
      timestamp: Date.now()
    }));
    return;
  }

  // Static File Serving
  let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

// Launch Cloudflare Tunnel as fallback
function startCloudflareTunnel() {
  const possiblePaths = [
    '/home/archmam/.local/bin/cloudflared',
    'cloudflared'
  ];

  let binary = null;
  for (const p of possiblePaths) {
    if (p === 'cloudflared' || fs.existsSync(p)) {
      binary = p;
      break;
    }
  }

  if (!binary) {
    return;
  }

  try {
    tunnelProcess = spawn(binary, ['tunnel', '--url', `http://127.0.0.1:${PORT}`]);

    tunnelProcess.stderr.on('data', chunk => {
      const line = chunk.toString();
      const match = line.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !publicTunnelUrl) {
        publicTunnelUrl = match[0];
        printBanner();
      }
    });

    tunnelProcess.on('error', err => {
      console.warn('[Tunnel] Gagal menjalankan cloudflared:', err.message);
    });

    tunnelProcess.on('exit', () => {
      publicTunnelUrl = null;
    });
  } catch (e) {
    console.warn('[Tunnel Error]', e);
  }
}

function printBanner() {
  const ips = getLocalIps();
  console.log('\n===============================================================');
  console.log("  STROOP'S PARADOX - SERVER BOOTH (DIES NATALIS UNTAG 2026)");
  console.log('===============================================================');
  console.log(`  [OK] Server Booth Lokal : http://localhost:${PORT}`);
  console.log(`  [OK] Link Scan Cloud    : ${CLOUD_SCAN_URL} (PERMANEN)`);
  console.log('  [OK] Cloud Photo Engine : Catbox + Tmpfiles Multi-Cloud Aktif');
  if (publicTunnelUrl) {
    console.log(`  [OK] Cloudflare Tunnel  : ${publicTunnelUrl} (Cadangan)`);
  }
  console.log('\n  >>> LINK SCAN BARCODE HP PESERTA (PERMANEN CLOUD):');
  console.log(`      ${CLOUD_SCAN_URL}`);
  console.log('\n  >>> FOTO & TTD UDARA OTOMATIS TERSIMPAN DI CLOUD (BISA DIAKSES HP)');
  if (ips.length > 0) {
    console.log(`\n  Alternatif Wi-Fi Lokal  : http://${ips[0]}:${PORT}/scan.html`);
  }
  console.log('===============================================================\n');
}

server.listen(PORT, '0.0.0.0', () => {
  printBanner();
  if (!process.argv.includes('--no-tunnel')) {
    startCloudflareTunnel();
  }
});

// Clean shutdown
process.on('SIGINT', () => {
  if (tunnelProcess) tunnelProcess.kill();
  process.exit(0);
});
process.on('SIGTERM', () => {
  if (tunnelProcess) tunnelProcess.kill();
  process.exit(0);
});
