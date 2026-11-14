'use strict';

// load whichever Baileys package is installed
let B;
for (const n of ['@itsliaaa/baileys', 'baileys', '@whiskeysockets/baileys', '@adiwajshing/baileys']) {
  try { B = require(n); break; } catch {}
}
if (!B) throw new Error('No Baileys package found. Check package.json');
const { downloadContentFromMessage } = B;

const store = new Map(); // message id -> { type, buf, caption }
const MAX_ITEMS = 30;
const MAX_BYTES = 25 * 1024 * 1024;

function findViewOnce(message) {
  let m = message;
  if (m?.ephemeralMessage) m = m.ephemeralMessage.message;
  if (m?.deviceSentMessage) m = m.deviceSentMessage.message;

  const inner =
    m?.viewOnceMessageV2?.message ||
    m?.viewOnceMessageV2Extension?.message ||
    m?.viewOnceMessage?.message;

  const src = inner || m;
  if (!src) return null;

  const type = Object.keys(src).find(k => /^(image|video|audio)Message$/.test(k));
  if (!type) return null;
  if (!inner && !src[type].viewOnce) return null;

  return { type, media: src[type] };
}

async function download(type, media) {
  const stream = await downloadContentFromMessage(media, type.replace('Message', ''));
  let buf = Buffer.alloc(0);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
  return buf;
}

// called for every incoming message
async function save(msg) {
  const id = msg?.key?.id;
  if (!id) return;

  const found = findViewOnce(msg.message);
  if (!found) return;
  if (Number(found.media.fileLength) > MAX_BYTES) return;

  const buf = await download(found.type, found.media);
  store.set(id, { type: found.type, buf, caption: found.media.caption || '' });

  while (store.size > MAX_ITEMS) {
    store.delete(store.keys().next().value);
  }
}

function get(id) {
  return store.get(id) || null;
}

module.exports = { save, get, download, findViewOnce };
