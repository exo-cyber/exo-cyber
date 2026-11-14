'use strict';

// ==========================================
// VIEW ONCE CACHE
// Saves view-once media the moment it arrives
// so .damn / .cute can resend it later.
// ==========================================

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

const MEDIA_RE = /^(image|video|audio)Message$/;

// wrappers WhatsApp can put around a message
const WRAPPERS = [
  'ephemeralMessage',
  'deviceSentMessage',
  'documentWithCaptionMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'editedMessage'
];

// Find view-once media inside any message shape.
// Returns { type, media } or null.
function findViewOnce(message) {
  let m = message;
  let wrappedAsViewOnce = false;

  for (let i = 0; i < 6 && m; i++) {
    const w = WRAPPERS.find(k => m[k]?.message);
    if (!w) break;
    if (w.startsWith('viewOnce')) wrappedAsViewOnce = true;
    m = m[w].message;
  }
  if (!m) return null;

  const type = Object.keys(m).find(k => MEDIA_RE.test(k));
  if (!type || !m[type]) return null;

  // counts as view once if wrapped as one, or flagged directly
  if (!wrappedAsViewOnce && !m[type].viewOnce) return null;

  return { type, media: m[type] };
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
  if (!id || store.has(id)) return;

  const found = findViewOnce(msg.message);
  if (!found) return;

  console.log('[vo] view once detected:', found.type, 'id=' + id);

  try {
    if (Number(found.media.fileLength) > MAX_BYTES) {
      console.log('[vo] too big, skipped');
      return;
    }

    const buf = await download(found.type, found.media);

    store.set(id, {
      type: found.type,
      buf,
      caption: found.media.caption || ''
    });

    console.log('[vo] saved', buf.length, 'bytes. cache size:', store.size);

    while (store.size > MAX_ITEMS) {
      store.delete(store.keys().next().value);
    }
  } catch (e) {
    console.log('[vo] download FAILED:', e.message);
  }
}

function get(id) {
  return store.get(id) || null;
}

function size() {
  return store.size;
}

module.exports = { save, get, size, download, findViewOnce };
