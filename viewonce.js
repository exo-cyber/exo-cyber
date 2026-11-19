// viewonce.js
// Saves every incoming view-once in memory the moment it arrives, so it can still be
// revealed later (WhatsApp often strips the media from a quoted view-once).
// .cute -> reveal in the chat (owner only)
// .damn -> silently send to your DM (owner only)
const KINDS = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'];
const WRAPPERS = ['viewOnceMessageV2', 'viewOnceMessage', 'viewOnceMessageV2Extension'];
const MAX_ITEMS = 40;
const MAX_BYTES = 25 * 1024 * 1024;
const cache = new Map(); // message id -> { buf, type, data }

let dl;
async function getDownloader() {
  if (dl) return dl;
  for (const name of ['@itsliaaa/baileys', '@whiskeysockets/baileys', 'baileys']) {
    try {
      const mod = await import(name);
      const fn = mod.downloadContentFromMessage || (mod.default && mod.default.downloadContentFromMessage);
      if (fn) return (dl = fn);
    } catch { /* try next */ }
  }
  throw new Error('Baileys downloader not found');
}

function findMedia(qm) {
  let cur = qm;
  for (let i = 0; i < 4 && cur; i++) {
    for (const k of KINDS) if (cur[k]) return { type: k, data: cur[k] };
    cur = cur.viewOnceMessageV2?.message
       || cur.viewOnceMessage?.message
       || cur.viewOnceMessageV2Extension?.message
       || cur.ephemeralMessage?.message
       || cur.documentWithCaptionMessage?.message
       || null;
  }
  return null;
}

async function download(media) {
  const fn = await getDownloader();
  const stream = await fn(media.data, media.type.replace('Message', ''));
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

function isViewOnce(message) {
  let cur = message;
  for (let i = 0; i < 4 && cur; i++) {
    if (WRAPPERS.some((w) => cur[w])) return true;
    for (const k of KINDS) if (cur[k] && cur[k].viewOnce) return true;
    cur = cur.ephemeralMessage?.message || null;
  }
  return false;
}

// Called from messageHandler for every incoming message.
async function capture(sock, msg) {
  if (!msg.message || !isViewOnce(msg.message)) return;
  const media = findMedia(msg.message);
  if (!media) return;
  const buf = await download(media);
  if (!buf.length || buf.length > MAX_BYTES) return;
  cache.set(msg.key.id, { buf, type: media.type, data: media.data });
  while (cache.size > MAX_ITEMS) cache.delete(cache.keys().next().value);
}

async function fetchItem(ctx) {
  const quotedId = ctx.ctxInfo?.stanzaId;
  if (quotedId && cache.has(quotedId)) return cache.get(quotedId);
  const media = findMedia(ctx.ctxInfo?.quotedMessage); // fallback: media still inside the quote
  if (!media) return null;
  const buf = await download(media);
  return buf.length ? { buf, type: media.type, data: media.data } : null;
}

function payload(item, label) {
  const d = item.data || {};
  const caption = (d.caption ? d.caption + '\n\n' : '') + label;
  switch (item.type) {
    case 'videoMessage': return { video: item.buf, mimetype: d.mimetype || 'video/mp4', caption };
    case 'audioMessage': return { audio: item.buf, mimetype: d.mimetype || 'audio/mpeg', ptt: Boolean(d.ptt) };
    case 'documentMessage': return { document: item.buf, mimetype: d.mimetype || 'application/octet-stream', fileName: d.fileName || 'view_once_file', caption };
    default: return { image: item.buf, mimetype: d.mimetype || 'image/jpeg', caption };
  }
}

const commands = [
  {
    name: 'cute',
    category: 'MEDIA',
    menu: '.cute',
    async run(ctx) {
      if (!ctx.isOwner) return ctx.reply('Owner only.');
      if (!ctx.ctxInfo?.stanzaId) return ctx.reply('❌ Reply to a view-once message.');
      try {
        const item = await fetchItem(ctx);
        if (!item) return ctx.reply("❌ I don't have that one. I can only reveal view-once messages that arrived while I was online.");
        await ctx.sock.sendMessage(ctx.jid, payload(item, '👁️ *View-once revealed!*'), { quoted: ctx.msg });
      } catch (e) {
        console.log('[cute] error:', e.message);
        await ctx.reply('❌ Failed to reveal view-once: ' + e.message);
      }
    },
  },
  {
    name: 'damn',
    category: 'MEDIA',
    menu: '.damn',
    async run(ctx) {
      if (!ctx.isOwner || !ctx.ctxInfo?.stanzaId) return; // silent
      try {
        const item = await fetchItem(ctx);
        if (!item) return;
        await ctx.sock.sendMessage(ctx.sender, payload(item, '👁️ *View-once (saved from group)*'));
      } catch (e) {
        console.log('[damn] error:', e.message); // stay silent in the group
      }
    },
  },
];

module.exports = commands;
module.exports.capture = capture;
