const settings = require('./settings');
const memory = require('./memory');

module.exports = [
  {
    name: 'ai', category: 'AI SYSTEM', menu: ['ai on', 'ai off'],
    run: async (ctx) => {
      const arg = (ctx.args[0] || '').toLowerCase();
      if (arg !== 'on' && arg !== 'off') return ctx.reply('Use .ai on or .ai off');
      if (ctx.isGroup && !ctx.isOwner) return ctx.reply('Only the owner can switch AI in groups.');
      settings.setAi(ctx.jid, arg === 'on');
      return ctx.reply(arg === 'on' ? "AI is on for this chat." : 'AI is off here. Commands still work.');
    },
  },
  {
    name: 'clear', category: 'AI SYSTEM', menu: ['clear'],
    run: (ctx) => { memory.clear(ctx.senderNum); return ctx.reply("Done. I've forgotten our conversation."); },
  },
];
