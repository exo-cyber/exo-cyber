
// plugins/viewonce.js
const { downloadContentFromMessage } = require('@itsliaaa/baileys')

async function grab(ctx) {
  const { sock, msg, jid, sender, reply } = ctx
  const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
  if (!q) return reply('Reply to a view once first.')

  const inner =
    q.viewOnceMessageV2?.message ||
    q.viewOnceMessageV2Extension?.message ||
    q.viewOnceMessage?.message || q
  const type = Object.keys(inner).find(k => /image|video|audio/.test(k))
  if (!type) return reply('No media in that message.')

  const media = inner[type]
  const stream = await downloadContentFromMessage(media, type.replace('Message', ''))
  let buf = Buffer.alloc(0)
  for await (const c of stream) buf = Buffer.concat([buf, c])

  const content =
    type === 'imageMessage' ? { image: buf, caption: media.caption || '' } :
    type === 'videoMessage' ? { video: buf, caption: media.caption || '' } :
    { audio: buf, mimetype: 'audio/mp4', ptt: true }

  return { sock, content }
}

module.exports = [
  {
    name: 'damn', category: 'Media', menu: 'reveal view once in chat',
    run: async (ctx) => {
      const r = await grab(ctx); if (!r?.content) return
      await r.sock.sendMessage(ctx.jid, r.content, { quoted: ctx.msg })
    }
  },
  {
    name: 'cute', category: 'Media', menu: 'send view once to your DM',
    run: async (ctx) => {
      const r = await grab(ctx); if (!r?.content) return
      await r.sock.sendMessage(ctx.sender, r.content)
    }
  }
]