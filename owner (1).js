'use strict';

// ==========================================
// EXO-CYBER - OWNER COMMANDS
// ==========================================

const settings = require('./settings');
const { numberOf } = require('./jid');

const OWNER_NUMBER = '2347075369608';

const digits = (value) => numberOf(String(value));

function isOwnerNumber(number) {
  return String(number) === OWNER_NUMBER || Boolean(settings.isOwner(number));
}

// Works for phone-number IDs and for WhatsApp's newer LID IDs in groups
async function checkOwner(ctx) {
  if (ctx.isOwner) return true;

  const ids = [ctx.senderNum, ctx.sender ? digits(ctx.sender) : null]
    .filter(Boolean)
    .map(String);

  if (ids.some(isOwnerNumber)) return true;

  if (ctx.isGroup) {
    try {
      const meta = await ctx.sock.groupMetadata(ctx.jid);

      const member = meta.participants.find(p =>
        [p.id, p.lid, p.phoneNumber]
          .filter(Boolean)
          .some(x => ids.includes(digits(x)))
      );

      if (member) {
        return [member.id, member.lid, member.phoneNumber]
          .filter(Boolean)
          .some(x => isOwnerNumber(digits(x)));
      }
    } catch (error) {
      // fall through to "not owner"
    }
  }

  return false;
}

async function ownerOnly(ctx) {
  if (await checkOwner(ctx)) return true;

  await ctx.reply('⛔ This command is restricted to the bot owner.');
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
      if (!await ownerOnly(ctx)) return;

      const target = getTarget(ctx);
      if (!target) return ctx.reply('Tag, reply to, or provide a number.');

      const number = numberOf(target);

      if (isOwnerNumber(number)) {
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
      if (!await ownerOnly(ctx)) return;

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
      if (!await ownerOnly(ctx)) return;

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
      if (!await ownerOnly(ctx)) return;

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
      if (!await ownerOnly(ctx)) return;

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
      if (!await ownerOnly(ctx)) return;

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
      if (!await ownerOnly(ctx)) return;

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
