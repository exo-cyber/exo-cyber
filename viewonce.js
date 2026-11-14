// viewonce.js

// load whichever Baileys package is installed
let B
for (const n of ['@itsliaaa/baileys', 'baileys', '@whiskeysockets/baileys', '@adiwajshing/baileys']) {
  try { B = require(n); break } catch {}
}
if (!B) throw new Error('No Baileys package found. Check package.json')
const { downloadContentFromMessage } = B

async function grab(ctx) {
  const msg = ctx.msg || ctx.m
  const reply = ctx.reply || (async (t) => ctx.sock.sendMessage(ctx.jid, { text: t }, { quoted: msg }))

  const q = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage
  if (!q) { await reply('Reply to a view once first.'); return null }

  // view once can be wrapped in different ways depending on WhatsApp version
  const inner =
    q.viewOnceMessageV2?.message ||
    q.viewOnceMessageV2Extension?.message ||
    q.viewOnceMessage?.message ||
    q

  const type = Object.keys(inner).find(k => /^(image|video|audio)Message$/.test(k))
  if (!type) { await reply('No view once media in that message.'); return null }

  const media = inner[type]
  try {
    const stream = await downloadContentFromMessage(media, type.replace('Message', ''))
    let buf = Buffer.alloc(0)
    for await (const chunk of stream) buf = Buffer.concat([buf, chunk])

    if (type === 'imageMessage') return { image: buf, caption: media.caption || '' }
    if (type === 'videoMessage') return { video: buf, caption: media.caption || '' }
    return { audio: buf, mimetype: 'audio/mp4', ptt: true }
  } catch (e) {
    await reply('Could not download it. It may have already expired.')
    return null
  }
}

module.exports = [
  {
    name: 'damn',
    category: 'Media',
    menu: 'reveal view once in the chat',
    run: async (ctx) => {
      const content = await grab(ctx); if (!content) return
      await ctx.sock.sendMessage(ctx.jid, content, { quoted: ctx.msg || ctx.m })
    }
  },
  {
    name: 'cute',
    category: 'Media',
    menu: 'send view once to your DM',
    run: async (ctx) => {
      const content = await grab(ctx); if (!content) return
      // DM goes to the person who ran the command
      await ctx.sock.sendMessage(ctx.sender, content)
    }
  }
]