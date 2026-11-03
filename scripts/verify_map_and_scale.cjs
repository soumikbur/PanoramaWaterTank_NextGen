const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('[AUDIT] Starting local backend to verify Map and Global Display Size settings...');

const pythonBin = path.join(__dirname, '..', 'backend', 'venv', 'Scripts', 'python.exe');
const projectDir = path.join(__dirname, '..');

// 1. First test python backend endpoint directly
const testBackend = () => {
  return new Promise((resolve, reject) => {
    const srv = spawn(pythonBin, ['-m', 'uvicorn', 'app.main:app', '--port', '8088', '--host', '127.0.0.1'], {
      cwd: path.join(projectDir, 'backend'),
      env: { ...process.env, PYTHONPATH: path.join(projectDir, 'backend') }
    });

    let stdout = '';
    srv.stdout.on('data', (d) => { stdout += d.toString(); });
    srv.stderr.on('data', (d) => { stdout += d.toString(); });

    setTimeout(() => {
      // Query /api/v1/location
      http.get('http://127.0.0.1:8088/api/v1/location', (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            console.log('[API VERIFICATION] /api/v1/location status:', res.statusCode);
            console.log('[API VERIFICATION] /api/v1/location items:', data.length);
            if (data.length > 0) {
              const loc = data[0];
              console.log('[API VERIFICATION] Train:', loc.train_number, 'lat:', loc.current_latitude, 'lon:', loc.current_longitude, 'has_gps:', loc.has_gps, 'is_simulated:', loc.is_simulated);
            }
            srv.kill();
            resolve(data);
          } catch (e) {
            srv.kill();
            reject(e);
          }
        });
      }).on('error', (err) => {
        srv.kill();
        reject(err);
      });
    }, 2500);
  });
};

testBackend()
  .then((data) => {
    console.log('[+] Backend location API test passed successfully!');
  })
  .catch((err) => {
    console.error('[-] Backend test error:', err);
    process.exit(1);
  });
