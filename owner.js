'use strict';

const settings = require('./settings');

function getTarget(ctx) {
  const mentioned = (ctx.mentioned || []).filter(Boolean);
  if (mentioned.length) return mentioned[0];

  const replied = ctx.ctxInfo?.participant;
  if (replied) return replied;

  const raw = (ctx.args || []).join('').replace(/\D/g, '');
  return raw || null;
}

function usage(ctx, command) {
  return ctx.reply(
    `Usage: ${command} @user (or reply to a user's message).`
  );
}

module.exports = [
  {
    name: 'sudo',
    category: 'OWNER',
    menu: ['sudo'],
    run: async (ctx) => {
      if (!ctx.isOwner) return ctx.reply('Owner only.');

      const target = getTarget(ctx);
      if (!target) return usage(ctx, '.sudo');

      settings.addSudo(target);
      return ctx.reply(`Sudo access granted to ${String(target).split('@')[0]}.`);
    }
  },
  {
    name: 'delsudo',
    category: 'OWNER',
    menu: ['delsudo'],
    run: async (ctx) => {
      if (!ctx.isOwner) return ctx.reply('Owner only.');

      const target = getTarget(ctx);
      if (!target) return usage(ctx, '.delsudo');

      if (settings.isOwner(target)) {
        return ctx.reply('You cannot remove the bot owner from owner access.');
      }

      settings.delSudo(target);
      return ctx.reply(`Sudo access removed from ${String(target).split('@')[0]}.`);
    }
  },
  {
    name: 'mode',
    category: 'OWNER',
    menu: ['mode'],
    run: async (ctx) => {
      if (!ctx.isOwner) return ctx.reply('Owner only.');

      const mode = String(ctx.args?.[0] || '').toLowerCase();
      if (!['private', 'public'].includes(mode)) {
        return ctx.reply('Usage: .mode private OR .mode public');
      }

      settings.setMode(mode);
      return ctx.reply(`Bot mode set to ${mode}.`);
    }
  },
  {
    name: 'antilink',
    aliases: ['antilinkkick', 'antilinkdelete'],
    category: 'GROUP',
    menu: ['antilink'],
    run: async (ctx) => {
      if (!ctx.isOwner) return ctx.reply('Owner only.');

      let mode = String(ctx.args?.[0] || '').toLowerCase();

      if (ctx.command === 'antilinkkick') mode = 'kick';
      if (ctx.command === 'antilinkdelete') mode = 'delete';

      if (mode === 'kick-and-delete' || mode === 'kick_delete') {
        mode = 'kickanddelete';
      }

      if (!['off', 'delete', 'kick', 'kickanddelete'].includes(mode)) {
        return ctx.reply(
          'Usage: .antilink off | delete | kick | kickanddelete'
        );
      }

      settings.setAntiLinkMode(mode);
      return ctx.reply(`Anti-link mode set to ${mode}.`);
    }
  }
];
