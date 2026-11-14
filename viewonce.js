// plugins/viewonce.js
import { downloadContentFromMessage } from '@whiskeysockets/baileys'
// ^ swap to your fork's package name (e.g. the itsliaaa fork) if it differs

const VO_WRAPPERS = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']
const MEDIA_TYPES = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio' }

// Unwrap the quoted message and return { type, media } if it's view-once media
function extractViewOnce(quoted) {
  if (!quoted) return null

  let inner = quoted
  let wrapped = false
  for (const key of VO_WRAPPERS) {
    if (quoted[key]?.message) {
      inner = quoted[key].message
      wrapped = true
      break
    }
  }

  for (const key of Object.keys(MEDIA_TYPES)) {
    const media = inner[key]
    if (!media) continue
    // Newer clients set viewOnce: true on the media itself, no wrapper
    if (wrapped || media.viewOnce) return { type: key, media }
  }
  return null
}

async function toBuffer(media, kind) {
  const stream = await downloadContentFromMessage(media, kind)
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function reveal(ctx, toDM) {
  const { sock, jid, sender, isOwner, reply } = ctx
  const msg = ctx.msg ?? ctx.m // the raw incoming message; adjust to whatever your ctx exposes

  if (!isOwner) return // or reply('Owner only') if you want feedback

  try {
    const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage
    const found = extractViewOnce(quoted)
    if (!found) return reply('Reply to a view-once message')

    const { type, media } = found
    const buffer = await toBuffer(media, MEDIA_TYPES[type])
    const target = toDM ? sender : jid
    const opts = toDM ? {} : { quoted: msg }
    const caption = media.caption || undefined

    if (type === 'imageMessage') {
      await sock.sendMessage(target, { image: buffer, caption }, opts)
    } else if (type === 'videoMessage') {
      await sock.sendMessage(target, { video: buffer, caption }, opts)
    } else {
      await sock.sendMessage(
        target,
        { audio: buffer, mimetype: media.mimetype || 'audio/ogg; codecs=opus', ptt: !!media.ptt },
        opts
      )
    }
  } catch (err) {
    console.error('[vv]', err)
    try { await reply('Failed to reveal that message') } catch {}
  }
}

export default [
  {
    name: 'cute',
    aliases: ['cute'],
    category: 'Media',
    menu: 'Reveal a view-once message in chat',
    run: (ctx) => reveal(ctx, false),
  },
  {
    name: 'damn',
    category: 'Media',
    menu: 'Reveal a view-once message to your DM',
    run: (ctx) => reveal(ctx, true),
  },
]