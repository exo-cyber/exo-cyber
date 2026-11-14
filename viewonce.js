'use strict';

const vo = require('./vocache');

function toContent(type, buf, caption) {
  if (type === 'imageMessage') return { image: buf, caption: caption || '' };
  if (type === 'videoMessage') return { video: buf, caption: caption || '' };
  return { audio: buf, mimetype: 'audio/mp4', ptt: true };
}

async function grab(ctx) {
  const id = ctx.ctxInfo?.stanzaId;
  console.log('[vo] command used. replied id =', id, '| cache size =', vo.size());

  if (!id) {
    await ctx.reply('Reply to a view once first.');
    return null;
  }

  // 1. saved copy from when it arrived (most reliable)
  const saved = vo.get(id);
  if (saved) return toContent(saved.type, saved.buf, saved.caption);

  // 2. fallback: try the quoted copy
  const found = vo.findViewOnce(ctx.ctxInfo?.quotedMessage);
  if (found) {
    try {
      const buf = await vo.download(found.type, found.media);
      return toContent(found.type, buf, found.media.caption);
    } catch (e) {
      console.log('[vo] quoted download failed:', e.message);
    }
  } else {
    console.log('[vo] quoted message has no view once media');
  }

  await ctx.reply('I did not catch that one. It must arrive while I am online.');
  return null;
}

module.exports = [
  {
    name: 'damn',
    category: 'MEDIA',
    menu: ['.damn (reply to view once)'],
    run: async (ctx) => {
      const content = await grab(ctx);
      if (!content) return;
      await ctx.sock.sendMessage(ctx.jid, content, { quoted: ctx.msg });
    }
  },
  {
    name: 'cute',
    category: 'MEDIA',
    menu: ['.cute (view once to your DM)'],
    run: async (ctx) => {
      const content = await grab(ctx);
      if (!content) return;
      await ctx.sock.sendMessage(ctx.sender, content);
    }
  },
  {
    name: 'votest',
    category: 'MEDIA',
    menu: ['.votest (check view once system)'],
    run: async (ctx) => {
      await ctx.reply('View once system is loaded. Saved items: ' + vo.size());
    }
  }
];
