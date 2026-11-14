'use strict';

// ==========================================
// EXO-CYBER - ADMIN COMMANDS
// ==========================================

const settings = require('./settings');
const { numberOf } = require('./jid');

const warnings = new Map();

// ==========================================
// GROUP ADMIN CHECK
// ==========================================

async function guard(ctx) {
  if (!ctx.isGroup) {
    await ctx.reply('This command only works in groups.');
    return false;
  }

  try {
    const meta = await ctx.sock.groupMetadata(ctx.jid);

    const sender = meta.participants.find(p =>
      numberOf(p.id) === ctx.senderNum ||
      (p.lid && numberOf(p.lid) === ctx.senderNum)
    );

    const isAdmin = Boolean(sender?.admin);

    if (!ctx.isOwner && !isAdmin) {
      await ctx.reply('Admins only.');
      return false;
    }

    return true;
  } catch (error) {
    await ctx.reply('Could not verify group permissions.');
    return false;
  }
}

// ==========================================
// TARGET HELPER
// ==========================================

function getTarget(ctx) {
  if (ctx.mentioned?.length) {
    return ctx.mentioned[0];
  }

  if (ctx.ctxInfo?.participant) {
    return ctx.ctxInfo.participant;
  }

  return null;
}

// ==========================================
// DELETE
// ==========================================

async function deleteMessage(ctx) {
  if (!await guard(ctx)) return;

  const quotedId = ctx.ctxInfo?.stanzaId;

  if (!quotedId) {
    return ctx.reply('Reply to the message you want to delete.');
  }

  const key = {
    remoteJid: ctx.jid,
    fromMe: false,
    id: quotedId,
    participant: ctx.ctxInfo.participant
  };

  try {
    await ctx.sock.sendMessage(ctx.jid, {
      delete: key
    });
  } catch (error) {
    await ctx.reply('Could not delete that message. Check my admin permissions.');
  }
}

// ==========================================
// ANTI-LINK
// ==========================================

async function antiLink(ctx) {
  if (!await guard(ctx)) return;

  const mode = (ctx.args?.[0] || '').toLowerCase();

  const allowed = [
    'off',
    'delete',
    'kick',
    'kickanddelete'
  ];

  if (!allowed.includes(mode)) {
    return ctx.reply(
      'ANTI-LINK SETTINGS\n\n' +
      '.antilink off\n' +
      '.antilink delete\n' +
      '.antilink kick\n' +
      '.antilink kickanddelete'
    );
  }

  settings.setAntiLinkMode(mode);

  await ctx.reply(
    `Anti-link mode updated to: ${mode.toUpperCase()}`
  );
}

// ==========================================
// WARN
// ==========================================

async function warn(ctx) {
  if (!await guard(ctx)) return;

  const target = getTarget(ctx);

  if (!target) {
    return ctx.reply('Tag or reply to the member you want to warn.');
  }

  const targetNum = numberOf(target);

  if (targetNum === ctx.senderNum) {
    return ctx.reply("You can't warn yourself.");
  }

  const meta = await ctx.sock.groupMetadata(ctx.jid);

  const member = meta.participants.find(p =>
    numberOf(p.id) === targetNum ||
    (p.lid && numberOf(p.lid) === targetNum)
  );

  if (member?.admin) {
    return ctx.reply("You can't warn a group admin.");
  }

  const key = `${ctx.jid}:${targetNum}`;
  const count = (warnings.get(key) || 0) + 1;

  warnings.set(key, count);

  const reason = ctx.args?.filter(a => !/^\d+$/.test(a)).join(' ') || 'No reason given';

  await ctx.reply(
    `⚠️ WARNING ISSUED\n\n` +
    `Member: @${targetNum}\n` +
    `Reason: ${reason}\n` +
    `Warnings: ${count}/3`,
    { mentions: [target] }
  );

  if (count >= 3) {
    warnings.delete(key);

    await ctx.reply(
      `⚠️ @${targetNum} has reached 3 warnings. Admin review is required.`,
      { mentions: [target] }
    );
  }
}

// ==========================================
// RESET WARNINGS
// ==========================================

async function resetWarn(ctx) {
  if (!await guard(ctx)) return;

  const target = getTarget(ctx);

  if (!target) {
    return ctx.reply('Tag or reply to a member.');
  }

  const key = `${ctx.jid}:${numberOf(target)}`;

  warnings.delete(key);

  await ctx.reply(
    `Warnings cleared for @${numberOf(target)}.`,
    { mentions: [target] }
  );
}

// ==========================================
// EXPORT COMMANDS
// ==========================================

module.exports = [
  {
    name: 'delete',
    aliases: ['del'],
    category: 'ADMIN',
    menu: ['.delete (reply to message)'],
    run: deleteMessage
  },
  {
    name: 'antilink',
    category: 'ADMIN',
    menu: ['.antilink off/delete/kick/kickanddelete'],
    run: antiLink
  },
  {
    name: 'antilinkgc',
    category: 'ADMIN',
    menu: ['.antilinkgc off/delete/kick/kickanddelete'],
    run: antiLink
  },
  {
    name: 'warn',
    category: 'ADMIN',
    menu: ['.warn @user reason'],
    run: warn
  },
  {
    name: 'resetwarn',
    category: 'ADMIN',
    menu: ['.resetwarn @user'],
    run: resetWarn
  }
];
