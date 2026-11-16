const fs = require('fs');
const path = require('path');

const content = fs.readFileSync('README.md', 'utf8');
const links = [];
const linkRegex = /\[.*?\]\((.*?)\)/g;
let match;
while ((match = linkRegex.exec(content)) !== null) {
  const url = match[1];
  if (!url.startsWith('http') && !url.startsWith('#')) {
    links.push(url);
  }
}
const imgRegex = /<img.*?src=["'](.*?)["']/g;
while ((match = imgRegex.exec(content)) !== null) {
  const url = match[1];
  if (!url.startsWith('http')) {
    links.push(url);
  }
}

console.log(`Testing ${links.length} relative links...`);
let missing = 0;
for (const link of links) {
  const cleanLink = link.split('#')[0];
  if (!fs.existsSync(cleanLink)) {
    console.error('MISSING:', cleanLink);
    missing++;
  } else {
    console.log('OK:', cleanLink);
  }
}
if (missing === 0) {
  console.log('ALL RELATIVE LINKS EXIST AND ARE VERIFIED!');
} else {
  console.error(`${missing} LINKS ARE MISSING!`);
  process.exit(1);
}
