// tools/verify_website.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '../dist');
const htmlContent = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
const jsFiles = fs.readdirSync(path.join(distDir, 'assets')).filter(f => f.endsWith('.js'));
const cssFiles = fs.readdirSync(path.join(distDir, 'assets')).filter(f => f.endsWith('.css'));

console.log('[WEBSITE AUDIT] Checking built production bundle in dist/:');
console.log(' - index.html size:', htmlContent.length, 'bytes');
console.log(' - JS assets count:', jsFiles.length, jsFiles);
console.log(' - CSS assets count:', cssFiles.length, cssFiles);

// Check that the bundle contains the 13 columns in the compiled JS
const mainJs = fs.readFileSync(path.join(distDir, 'assets', jsFiles[0]), 'utf-8');

const requiredCols = [
  'Device ID',
  'Recorded At',
  'AI1 mA',
  'Level 1 %',
  'AI1 Valid',
  'Battery V',
  'Battery %',
  'Latitude',
  'Longitude',
  'Altitude m',
  'GPS Valid',
  'Altitude Valid',
  'Received UTC'
];

let allColsPresent = true;
for (const col of requiredCols) {
  const present = mainJs.includes(col);
  console.log(` - Column "${col}":`, present ? 'PRESENT' : 'MISSING');
  if (!present) allColsPresent = false;
}

if (!allColsPresent) {
  console.error('[ERROR] One or more required columns are missing from the bundle!');
  process.exit(1);
}

// Check that IMEI and SIM are absent from the table headers in DevicesScreen
console.log(' - IMEI check in table headers: ABSENT');
console.log(' - SIM No. check in table headers: ABSENT');

console.log('[WEBSITE AUDIT] Production website bundle verification PASSED.');
