'use strict';

// ==========================================
// EXO-CYBER - INTERACTION COMMANDS
// ==========================================

const pick = (items) =>
  items[Math.floor(Math.random() * items.length)];

function getTarget(ctx) {
  if (ctx.mentioned?.length) {
    return '@' + String(ctx.mentioned[0]).split('@')[0];
  }

  if (ctx.ctxInfo?.participant) {
    return '@' + String(ctx.ctxInfo.participant).split('@')[0];
  }

  return ctx.args?.join(' ') || 'everyone';
}

const actions = {
  hug: [
    'sent a warm virtual hug 🤗',
    'is sharing some good vibes 💛',
    'gave a friendly hug 🫂'
  ],
  wave: [
    'waves hello 👋',
    'says hey there! 🌟'
  ],
  cuddle: [
    'shares a cozy virtual cuddle 🧸',
    'sends some comfort and good vibes 💛'
  ],
  wink: [
    'sends a playful wink 😉',
    'winks like a movie star 😎'
  ],
  pat: [
    'gives a friendly head pat 😊',
    'sends an encouraging pat 🌟'
  ],
  dance: [
    'starts dancing 💃🕺',
    'shows off some dance moves 🔥'
  ],
  sad: [
    'is feeling a little sad 🥺',
    'needs some encouragement today 💙'
  ],
  smile: [
    'shares a big smile 😊',
    'is spreading happiness 😁'
  ],
  laugh: [
    'bursts into laughter 😂',
    'cannot stop laughing 🤣'
  ],
  tickle: [
    'starts a harmless tickle battle 😂',
    'tries to make everyone laugh 🤣'
  ],
  shrug: [
    'shrugs 🤷',
    'has absolutely no idea 🤷‍♂️'
  ],
  simp: [
    'is showing appreciation 🌹',
    'is being extra supportive 💐'
  ]
};

const commands = Object.entries(actions).map(([name, messages]) => ({
  name,
  category: 'INTERACTION',
  menu: [`.${name} @user`],
  run: async (ctx) => {
    const target = getTarget(ctx);

    await ctx.reply(
      `✨ @${target.replace(/^@/, '')} ${pick(messages)}`,
      {
        mentions: ctx.mentioned?.length
          ? [ctx.mentioned[0]]
          : ctx.ctxInfo?.participant
            ? [ctx.ctxInfo.participant]
            : []
      }
    );
  }
}));

// ==========================================
// FLIRT COMMAND
// ==========================================

commands.push({
  name: 'flirt',
  aliases: ['rizz'],
  category: 'FUN',
  menu: ['.flirt @user'],

  run: async (ctx) => {
    const target = getTarget(ctx);

    const lines = [
      'Your smile deserves its own spotlight ✨',
      'You bring good vibes wherever you go 🌟',
      'If confidence were a superpower, you would be unstoppable 😎',
      'You just made this chat a little brighter ☀️',
      'Even the stars are taking notes from your shine ⭐',
      'Your energy is seriously impressive 🔥',
      'Someone clearly woke up with main-character energy today 😁'
    ];

    const mentions = ctx.mentioned?.length
      ? [ctx.mentioned[0]]
      : ctx.ctxInfo?.participant
        ? [ctx.ctxInfo.participant]
        : [];

    await ctx.reply(
      `💌 EXO-CYBER RIZZ MACHINE\n\nHey ${target}!\n${pick(lines)}`,
      { mentions }
    );
  }
});

module.exports = commands;
