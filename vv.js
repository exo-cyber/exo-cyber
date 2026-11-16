// vv.js — retrieve a "view once" photo, video or voice note the bot can see.
//
// Reply to the view-once message with:
//   .cute    -> sends it to YOUR DM (nothing shows in the chat)
//   .damn    -> sends it in the chat where you ran the command
//   .pretty  -> sends it to your DM and in the chat
//
// Owner only. Works only if the media is still on WhatsApp's servers: once the
// recipient has opened a view-once message it is often already gone.

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const log = require('./logger');

// Peel off the wrappers WhatsApp puts around view-once / disappearing messages.
function unwrap(message) {
  let m = message;
  for (let i = 0; i < 5 && m; i++) {
    const inner =
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.ephemeralMessage?.message ||
      m.documentWithCaptionMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m;
}

function findMediaNode(message) {
  const m = unwrap(message);
  if (!m) return null;
  if (m.imageMessage) return { node: m.imageMessage, type: 'image' };
  if (m.videoMessage) return { node: m.videoMessage, type: 'video' };
  if (m.audioMessage) return { node: m.audioMessage, type: 'audio' };
  return null;
}

async function fetchBuffer(node, type) {
  const stream = await downloadContentFromMessage(node, type);
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

function buildPayload(type, node, buf, caption) {
  if (type === 'image') return { image: buf, caption };
  if (type === 'video') return { video: buf, caption };
  return { audio: buf, mimetype: node.mimetype || 'audio/ogg; codecs=opus', ptt: Boolean(node.ptt) };
}

async function retrieve(ctx, toDm, toChat) {
  const quoted = ctx.ctxInfo?.quotedMessage;
  const found = quoted && findMediaNode(quoted);
  if (!found) return ctx.reply('Reply to a view-once photo, video or voice note with this command.');

  let buf;
  try {
    buf = await fetchBuffer(found.node, found.type);
    if (!buf.length) throw new Error('empty download');
  } catch (e) {
    log.warn('view-once download failed:', e.message);
    return ctx.reply("Couldn't fetch it. View-once media is usually gone from WhatsApp once it has been opened.");
  }

  const from = (ctx.ctxInfo.participant || '').split('@')[0].split(':')[0];
  const base = found.node.caption ? `${found.node.caption}\n` : '';
  const caption = `${base}— from ${from ? '+' + from : 'unknown'}`;
  const payload = buildPayload(found.type, found.node, buf, caption);

  try {
    if (toDm) {
      // your DM: in a group that is you (the sender); in a private chat it is the chat itself
      const dmJid = ctx.isGroup ? ctx.sender : ctx.jid;
      await ctx.sock.sendMessage(dmJid, payload);
    }
    if (toChat) {
      await ctx.sock.sendMessage(ctx.jid, payload, { quoted: ctx.msg });
    }
    if (toDm && !toChat) {
      // keep the group quiet: just a reaction on your command
      await ctx.sock.sendMessage(ctx.jid, { react: { text: '✅', key: ctx.msg.key } }).catch(() => {});
    }
  } catch (e) {
    log.warn('view-once send failed:', e.message);
    return ctx.reply("Got it but couldn't send it. Try again.");
  }
}

module.exports = [
  { name: 'cute',   category: 'OWNER', menu: ['cute'],   ownerOnly: true, run: (ctx) => retrieve(ctx, true, false) },
  { name: 'damn',   category: 'OWNER', menu: ['damn'],   ownerOnly: true, run: (ctx) => retrieve(ctx, false, true) },
  { name: 'pretty', category: 'OWNER', menu: ['pretty'], ownerOnly: true, run: (ctx) => retrieve(ctx, true, true) },
];
