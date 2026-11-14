'use strict';

const { numberOf } = require('./jid');
const settings = require('./settings');

// all number forms a participant can have (phone, LID)
function aliases(p) {
  return [p.id, p.lid, p.jid, p.phoneNumber]
    .filter(x => typeof x === 'string')
    .map(numberOf);
}

async function guard(ctx, needBotAdmin = true) {
  if (!ctx.isGroup) {
    await ctx.reply('This command only works in groups.');
    return null;
  }

  const meta = await ctx.sock.groupMetadata(ctx.jid);
  const admins = new Set();
  for (const p of meta.participants) {
    if (p.admin) aliases(p).forEach(a => admins.add(a));
  }

  if (!ctx.isOwner && !admins.has(ctx.senderNum)) {
    await ctx.reply('Admins only.');
    return null;
  }

  const bot = [ctx.sock.user?.id, ctx.sock.user?.lid].filter(Boolean).map(numberOf);
  if (needBotAdmin && !bot.some(b => admins.has(b))) {
    await ctx.reply('Make me admin first.');
    return null;
  }

  return { meta, bot };
}

// targets: @mention, replied user, or typed number
function getTargets(ctx) {
  const list = [...(ctx.mentioned || [])];
  if (ctx.ctxInfo?.participant) list.push(ctx.ctxInfo.participant);

  const words = (ctx.text || '').split(/\s+/).slice(1);
  for (const w of words) {
    const n = w.replace(/\D/g, '');
    if (n.length >= 7) list.push(n + '@s.whatsapp.net');
  }
  return [...new Set(list)];
}

// convert a target into the id format the group actually uses
function resolve(meta, target) {
  const n = numberOf(target);
  const p = meta.participants.find(x => aliases(x).includes(n));
  return p ? p.id : target;
}

const act = (action, label) => async (ctx) => {
  const g = await guard(ctx);
  if (!g) return;

  const targets = getTargets(ctx);
  if (!targets.length) {
    return ctx.reply('Tag, reply to, or type the number of someone.');
  }

  const ids = [];
  for (const t of targets) {
    const n = numberOf(t);
    if (g.bot.includes(n)) continue;
    if (action === 'remove' && settings.isOwner(n)) continue;
    ids.push(action === 'add' ? t : resolve(g.meta, t));
  }
  if (!ids.length) return ctx.reply("I can't do that to this user.");

  try {
    const res = await ctx.sock.groupParticipantsUpdate(ctx.jid, ids, action);
    const failed = (res || []).filter(r => r.status && String(r.status) !== '200');
    await ctx.reply(failed.length
      ? `${label} failed for ${failed.length} user(s).`
      : `${label} done.`);
  } catch (e) {
    await ctx.reply(`${label} failed: ${e.message}`);
  }
};

module.exports = [
  { name: 'kick',    category: 'GROUP', menu: ['.kick @user'],    run: act('remove',  'Kick') },
  { name: 'add',     category: 'GROUP', menu: ['.add number'],    run: act('add',     'Add') },
  { name: 'promote', category: 'GROUP', menu: ['.promote @user'], run: act('promote', 'Promote') },
  { name: 'demote',  category: 'GROUP', menu: ['.demote @user'],  run: act('demote',  'Demote') },

  {
    name: 'tagall',
    category: 'GROUP',
    menu: ['.tagall'],
    run: async (ctx) => {
      const g = await guard(ctx, false);
      if (!g) return;
      const ids = g.meta.participants.map(p => p.id);
      const note = (ctx.text || '').split(/\s+/).slice(1).join(' ') || 'Attention';
      await ctx.sock.sendMessage(ctx.jid, {
        text: note + '\n\n' + ids.map(i => '@' + numberOf(i)).join(' '),
        mentions: ids
      });
    }
  },
  {
    name: 'mute',
    category: 'GROUP',
    menu: ['.mute'],
    run: async (ctx) => {
      if (!(await guard(ctx))) return;
      await ctx.sock.groupSettingUpdate(ctx.jid, 'announcement');
      ctx.reply('Group muted.');
    }
  },
  {
    name: 'unmute',
    category: 'GROUP',
    menu: ['.unmute'],
    run: async (ctx) => {
      if (!(await guard(ctx))) return;
      await ctx.sock.groupSettingUpdate(ctx.jid, 'not_announcement');
      ctx.reply('Group unmuted.');
    }
  },
  {
    name: 'link',
    category: 'GROUP',
    menu: ['.link'],
    run: async (ctx) => {
      if (!(await guard(ctx))) return;
      const code = await ctx.sock.groupInviteCode(ctx.jid);
      ctx.reply('https://chat.whatsapp.com/' + code);
    }
  }
];