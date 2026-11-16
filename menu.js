
'use strict';

// ==========================================
// EXO-CYBER AUTOMATIC MENU SYSTEM
// ==========================================

const settings = require('./settings');
const { label } = require('./personality');

const ORDER = [
  'GENERAL',
  'AI SYSTEM',
  'FRIENDS',
  'VOICE TOOLS',
  'STICKER TOOLS',
  'MEDIA',
  'DOWNLOAD',
  'PROFILE',
  'GROUP TOOLS',
  'GAMES',
  'UTILITY',
  'OWNER',
];

function buildMenu(commands) {
  const prefix = settings.prefix();
  const groups = new Map();

  for (const c of commands) {
    if (!c || c.hidden) continue;

    const cat = c.category || 'OTHER';

    if (!groups.has(cat)) {
      groups.set(cat, []);
    }

    // Fix: accept both string and array menu formats.
    const entries = Array.isArray(c.menu)
      ? c.menu
      : typeof c.menu === 'string'
        ? [c.menu]
        : [c.name];

    for (const entry of entries) {
      if (entry) {
        groups.get(cat).push(String(entry));
      }
    }
  }

  const cats = [
    ...ORDER.filter((c) => groups.has(c)),
    ...[...groups.keys()].filter((c) => !ORDER.includes(c)),
  ];

  const lines = [
    '╭━━━「 E X O - C Y B E R 」',
    '┃',
    '┃ Status: Online',
    `┃ Personality: ${label()}`,
    '┃',
  ];

  for (const cat of cats) {
    lines.push(`┣━━━「 ${cat} 」`);

    for (const entry of groups.get(cat)) {
      lines.push(`┃ ◈ ${prefix}${entry}`);
    }

    lines.push('┃');
  }

  lines.push(
    '╰━━━━━━━━━━━━',
    '',
    'Choose a command. I suppose.'
  );

  return lines.join('\n');
}

module.exports = { buildMenu };
