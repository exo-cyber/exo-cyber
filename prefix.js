
'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'prefix.json');
const DEFAULT = '.';

const OPTIONS = [
  '.', '!', '#', '$', '?', '~', '+', '-', '=', '_',
  '/', '//', '!!', '##', '@@', '>>', '**', '%%', '&&',
  '<', '>', ':', ';', '^', '~~', '++', '??'
];

let current = DEFAULT;

try {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (typeof data.prefix === 'string' && data.prefix.length > 0) {
    current = data.prefix;
  }
} catch {}

function setPrefix(prefix) {
  if (!OPTIONS.includes(prefix)) {
    return false;
  }

  try {
    fs.writeFileSync(FILE, JSON.stringify({ prefix }), 'utf8');
    current = prefix;
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  DEFAULT,
  OPTIONS,
  getPrefix: () => current,
  setPrefix
};
