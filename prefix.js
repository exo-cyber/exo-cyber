// prefix.js - persistent prefix store
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'prefix.json');
const DEFAULT = '.';
let current = DEFAULT;

try {
  current = JSON.parse(fs.readFileSync(FILE, 'utf8')).prefix || DEFAULT;
} catch {}

module.exports = {
  DEFAULT,
  getPrefix: () => current,
  setPrefix(p) {
    current = p;
    try { fs.writeFileSync(FILE, JSON.stringify({ prefix: p })); } catch {}
  },
};
