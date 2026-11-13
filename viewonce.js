function isViewOnce(message) {
  if (!message || typeof message !== 'object') return false;

  for (const [key, value] of Object.entries(message)) {
    if (/^viewOnceMessage(V2|V2Extension)?$/.test(key)) {
      return true;
    }

    if (value && typeof value === 'object' && isViewOnce(value)) {
      return true;
    }
  }

  return false;
}

module.exports = [
  {
    name: 'damn',
    category: 'VIEW ONCE',
    menu: ['damn'],
    run: async (ctx) => {
      const quoted = ctx.ctxInfo?.quotedMessage;

      if (!quoted || !isViewOnce(quoted)) {
        return ctx.reply('Reply to a View Once message with .damn');
      }

      return ctx.reply('😈 Damn! That was a View Once message.');
    },
  },
  {
    name: 'cute',
    category: 'VIEW ONCE',
    menu: ['cute'],
    run: async (ctx) => {
      const quoted = ctx.ctxInfo?.quotedMessage;

      if (!quoted || !isViewOnce(quoted)) {
        return ctx.reply('Reply to a View Once message with .cute');
      }

      return ctx.reply('🥰 Cute! That was a View Once message.');
    },
  },
];
