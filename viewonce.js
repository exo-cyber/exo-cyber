// viewonce.js
// .cute -> reveal the replied view-once media in the chat (owner only)
// .damn -> silently send it to the owner's DM, nothing shown in the group (owner only)
const KINDS = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'];
const LABEL = '👁️ *View-once revealed!*';

// Load Baileys' downloader lazily (works whether the package is CJS or ESM).
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

// Find the media inside a quoted message, through any view-once / ephemeral wrapper.
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

function payload(media, buf, label) {
  const d = media.data;
  const caption = (d.caption ? d.caption + '\n\n' : '') + label;
  switch (media.type) {
    case 'videoMessage':
      return { video: buf, mimetype: d.mimetype || 'video/mp4', caption };
    case 'audioMessage':
      return { audio: buf, mimetype: d.mimetype || 'audio/mpeg', ptt: Boolean(d.ptt) };
    case 'documentMessage':
      return { document: buf, mimetype: d.mimetype || 'application/octet-stream', fileName: d.fileName || 'view_once_file', caption };
    default:
      return { image: buf, mimetype: d.mimetype || 'image/jpeg', caption };
  }
}

module.exports = [
  {
    name: 'cute',
    category: 'MEDIA',
    menu: '.cute',
    async run(ctx) {
      if (!ctx.isOwner) return ctx.reply('Owner only.');
      const media = findMedia(ctx.ctxInfo?.quotedMessage);
      if (!media) return ctx.reply('❌ Reply to a view-once image, video, audio or document.');
      try {
        const buf = await download(media);
        if (!buf.length) return ctx.reply('❌ Could not download the view-once content.');
        await ctx.sock.sendMessage(ctx.jid, payload(media, buf, LABEL), { quoted: ctx.msg });
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
      if (!ctx.isOwner) return; // silent
      const media = findMedia(ctx.ctxInfo?.quotedMessage);
      if (!media) return; // silent in the group
      try {
        const buf = await download(media);
        if (!buf.length) return;
        await ctx.sock.sendMessage(ctx.sender, payload(media, buf, '👁️ *View-once (saved from group)*'));
      } catch (e) {
        console.log('[damn] error:', e.message); // stay silent in the group
      }
    },
  },
];
