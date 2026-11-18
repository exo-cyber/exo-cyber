// autoclaim.js (CommonJS)
// Watches for card drops ("First to type .claim #ID keeps it") and claims them automatically.
const DROP_RE = /first to type\s+\.claim\s+(#[A-Z0-9]{5,8})/i;

let enabled = true;      // default ON
const GROUPS = [];       // optional whitelist of group JIDs, empty = all groups
const seen = new Set();  // ids already claimed (avoids double claims)

async function autoClaim(sock, msg, m, text) {
  if (!enabled) return;
  const jid = msg.key.remoteJid;
  if (!jid || !jid.endsWith('@g.us')) return;
  if (GROUPS.length && !GROUPS.includes(jid)) return;

  const caption =
    (m && m.imageMessage && m.imageMessage.caption) ||
    (m && m.videoMessage && m.videoMessage.caption) || '';
  const match = (caption || text || '').match(DROP_RE);
  if (!match) return;

  const id = match[1].toLowerCase();
  if (seen.has(id)) return;
  seen.add(id);
  setTimeout(() => seen.delete(id), 10 * 60 * 1000);

  await new Promise((r) => setTimeout(r, 200 + Math.random() * 500));
  await sock.sendMessage(jid, { text: `.claim ${id}` });
}

const commands = [
  {
    name: 'autoclaim',
    category: 'OWNER',
    menu: '.autoclaim on/off',
    run: async (ctx) => {
      if (!ctx.isOwner) return ctx.reply('Owner only.');
      const arg = (ctx.args[0] || '').toLowerCase();
      if (arg !== 'on' && arg !== 'off') {
        return ctx.reply(`Auto-claim is ${enabled ? 'ON' : 'OFF'}. Use .autoclaim on/off`);
      }
      enabled = arg === 'on';
      return ctx.reply(`Auto-claim ${enabled ? 'enabled' : 'disabled'}.`);
    },
  },
];

module.exports = commands;
module.exports.autoClaim = autoClaim;
