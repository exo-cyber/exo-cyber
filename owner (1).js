'use strict';

// ==========================================
// EXO-CYBER - OWNER COMMANDS
// ==========================================

const settings = require('./settings');
const { numberOf } = require('./jid');

function ownerOnly(ctx) {
  if (settings.isOwner(ctx.senderNum)) return true;

  ctx.reply('⛔ This command is restricted to the bot owner.');
  return false;
}

function getTarget(ctx) {
  if (ctx.mentioned?.length) return ctx.mentioned[0];
  if (ctx.ctxInfo?.participant) return ctx.ctxInfo.participant;

  const number = (ctx.args?.[0] || '').replace(/\D/g, '');
  return number.length >= 7 ? number + '@s.whatsapp.net' : null;
}

module.exports = [
  {
    name: 'sudo',
    category: 'OWNER',
    menu: ['.sudo @user'],
    run: async (ctx) => {
      if (!ownerOnly(ctx)) return;

      const target = getTarget(ctx);
      if (!target) return ctx.reply('Tag, reply to, or provide a number.');

      const number = numberOf(target);

      if (settings.isOwner(number)) {
        return ctx.reply('That user is already the owner.');
      }

      settings.addSudo(number);
      await ctx.reply(`✅ @${number} is now a Sudo user.`, {
        mentions: [target]
      });
    }
  },

  {
    name: 'delsudo',
    aliases: ['removesudo'],
    category: 'OWNER',
    menu: ['.delsudo @user'],
    run: async (ctx) => {
      if (!ownerOnly(ctx)) return;

      const target = getTarget(ctx);
      if (!target) return ctx.reply('Tag, reply to, or provide a number.');

      const number = numberOf(target);
      settings.delSudo(number);

      await ctx.reply(`✅ Sudo access removed from @${number}.`, {
        mentions: [target]
      });
    }
  },

  {
    name: 'listsudo',
    category: 'OWNER',
    menu: ['.listsudo'],
    run: async (ctx) => {
      if (!ownerOnly(ctx)) return;

      const users = settings.getSudoUsers();

      await ctx.reply(
        users.length
          ? '👑 SUDO USERS\n\n' + users.map((n, i) => `${i + 1}. ${n}`).join('\n')
          : 'No Sudo users have been added.'
      );
    }
  },

  {
    name: 'mode',
    category: 'OWNER',
    menu: ['.mode public/private'],
    run: async (ctx) => {
      if (!ownerOnly(ctx)) return;

      const mode = (ctx.args?.[0] || '').toLowerCase();

      if (!settings.setMode(mode)) {
        return ctx.reply('Usage: .mode public OR .mode private');
      }

      await ctx.reply(`✅ Bot mode changed to ${mode.toUpperCase()}.`);
    }
  },

  {
    name: 'block',
    category: 'OWNER',
    menu: ['.block @user'],
    run: async (ctx) => {
      if (!ownerOnly(ctx)) return;

      const target = getTarget(ctx);
      if (!target) return ctx.reply('Tag, reply to, or provide a number.');

      try {
        await ctx.sock.updateBlockStatus(target, 'block');
        await ctx.reply(`✅ Blocked ${numberOf(target)}.`);
      } catch (error) {
        await ctx.reply(`Block failed: ${error.message}`);
      }
    }
  },

  {
    name: 'unblock',
    category: 'OWNER',
    menu: ['.unblock @user'],
    run: async (ctx) => {
      if (!ownerOnly(ctx)) return;

      const target = getTarget(ctx);
      if (!target) return ctx.reply('Tag, reply to, or provide a number.');

      try {
        await ctx.sock.updateBlockStatus(target, 'unblock');
        await ctx.reply(`✅ Unblocked ${numberOf(target)}.`);
      } catch (error) {
        await ctx.reply(`Unblock failed: ${error.message}`);
      }
    }
  },

  {
    name: 'listblocked',
    category: 'OWNER',
    menu: ['.listblocked'],
    run: async (ctx) => {
      if (!ownerOnly(ctx)) return;

      try {
        const result = await ctx.sock.fetchBlocklist();
        const users = result || [];

        await ctx.reply(
          users.length
            ? '🚫 BLOCKED USERS\n\n' + users.map((u, i) => `${i + 1}. ${u}`).join('\n')
            : 'Your blocklist is empty.'
        );
      } catch (error) {
        await ctx.reply(`Could not fetch blocklist: ${error.message}`);
      }
    }
  }
];
