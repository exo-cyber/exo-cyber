// Group tools: add, kick, promote, demote, mute, unmute, link, antilink. Only group admins (or the owner) can use them,
// and Exo-Cyber must be a group admin herself (WhatsApp's rule, not ours).
const settings = require('./settings');
const { numberOf } = require('./jid');
const { groupInfo } = require('./groupTools');

const targetsOf = (ctx) => [...new Set(ctx.mentioned.length ? ctx.mentioned : (ctx.ctxInfo?.participant ? [ctx.ctxInfo.participant] : []))];

async function guard(ctx) {
  if (!ctx.isGroup) { await ctx.reply('Groups only.'); return null; }
  const info = await groupInfo(ctx.sock, ctx.jid);
  if (!ctx.isOwner && !info.admins.has(ctx.senderNum)) { await ctx.reply('Admins only.'); return null; }
  if (!info.botIsAdmin) { await ctx.reply("Make me an admin first. I can't do that otherwise."); return null; }
  return info;
}

const ADD_STATUS = {
  200: 'added',
  403: "their privacy settings block adding them",
  408: 'they left recently and cannot be re-added yet',
  409: 'already in the group',
};

module.exports = [
  {
    name: 'add', category: 'GROUP TOOLS', menu: ['add <number>'],
    run: async (ctx) => {
      const info = await guard(ctx);
      if (!info) return;
      const nums = ctx.args.map((a) => a.replace(/\D/g, '')).filter((n) => n.length >= 7 && n.length <= 15);
      if (!nums.length) return ctx.reply(`Give me a number with country code.\nExample: ${settings.prefix()}add 2348012345678`);
      const res = await ctx.sock.groupParticipantsUpdate(ctx.jid, nums.map((n) => `${n}@s.whatsapp.net`), 'add');
      const lines = (res || []).map((r) => `${numberOf(r.jid)}: ${ADD_STATUS[r.status] || `failed (${r.status})`}`);
      return ctx.reply(lines.join('\n') || 'Nothing happened.');
    },
  },
  {
    name: 'kick', category: 'GROUP TOOLS', menu: ['kick @user'],
    run: async (ctx) => {
      const info = await guard(ctx);
      if (!info) return;
      let targets = ctx.mentioned.length ? ctx.mentioned : (ctx.ctxInfo?.participant ? [ctx.ctxInfo.participant] : []);
      targets = [...new Set(targets)];
      if (!targets.length) return ctx.reply(`Tag who to remove, or reply to their message.\nExample: ${settings.prefix()}kick @user`);
      const protectedIds = settings.protectedIds();
      const blocked = targets.filter((j) => {
        const n = numberOf(j);
        return info.botNumbers.includes(n) || settings.isOwner(n) || protectedIds.includes(n);
      });
      if (blocked.length) return ctx.reply("Not him. Not me either. Pick someone else.");
      const res = await ctx.sock.groupParticipantsUpdate(ctx.jid, targets, 'remove');
      const failed = (res || []).filter((r) => String(r.status) !== '200');
      return ctx.reply(failed.length ? "Couldn't remove everyone. Admins can't be removed by me." : 'Gone.');
    },
  },
  {
    name: 'promote', category: 'GROUP TOOLS', menu: ['promote @user'],
    run: async (ctx) => {
      const info = await guard(ctx);
      if (!info) return;
      const targets = targetsOf(ctx);
      if (!targets.length) return ctx.reply(`Tag who to make admin, or reply to their message.\nExample: ${settings.prefix()}promote @user`);
      const res = await ctx.sock.groupParticipantsUpdate(ctx.jid, targets, 'promote');
      const failed = (res || []).filter((r) => String(r.status) !== '200');
      return ctx.reply(failed.length ? "Couldn't promote everyone." : 'Promoted. Try not to abuse it.');
    },
  },
  {
    name: 'demote', category: 'GROUP TOOLS', menu: ['demote @user'],
    run: async (ctx) => {
      const info = await guard(ctx);
      if (!info) return;
      const targets = targetsOf(ctx);
      if (!targets.length) return ctx.reply(`Tag who to demote, or reply to their message.\nExample: ${settings.prefix()}demote @user`);
      const protectedIds = settings.protectedIds();
      if (targets.some((j) => { const n = numberOf(j); return info.botNumbers.includes(n) || settings.isOwner(n) || protectedIds.includes(n); })) {
        return ctx.reply('Not him. Not me either. Pick someone else.');
      }
      const res = await ctx.sock.groupParticipantsUpdate(ctx.jid, targets, 'demote');
      const failed = (res || []).filter((r) => String(r.status) !== '200');
      return ctx.reply(failed.length ? "Couldn't demote everyone." : 'Demoted.');
    },
  },
  {
    name: 'mute', aliases: ['close'], category: 'GROUP TOOLS', menu: ['mute'],
    run: async (ctx) => {
      const info = await guard(ctx);
      if (!info) return;
      await ctx.sock.groupSettingUpdate(ctx.jid, 'announcement');
      return ctx.reply('Group closed. Only admins can talk now.');
    },
  },
  {
    name: 'unmute', aliases: ['open'], category: 'GROUP TOOLS', menu: ['unmute'],
    run: async (ctx) => {
      const info = await guard(ctx);
      if (!info) return;
      await ctx.sock.groupSettingUpdate(ctx.jid, 'not_announcement');
      return ctx.reply('Group open. Everyone can talk again.');
    },
  },
  {
    name: 'link', aliases: ['invite', 'grouplink'], category: 'GROUP TOOLS', menu: ['link'],
    run: async (ctx) => {
      const info = await guard(ctx);
      if (!info) return;
      const code = await ctx.sock.groupInviteCode(ctx.jid);
      return ctx.reply(`https://chat.whatsapp.com/${code}`);
    },
  },
  {
    name: 'antilink', category: 'GROUP TOOLS', menu: ['antilink <delete|warn|kick|off>'],
    run: async (ctx) => {
      const info = await guard(ctx);
      if (!info) return;
      const pre = settings.prefix();
      const words = ctx.args.map((x) => x.toLowerCase());
      const action = words.find((w) => ['delete', 'warn', 'kick', 'off', 'on'].includes(w));
      const scope = words.includes('gc') ? 'gc' : 'all';
      if (!action) {
        const cur = settings.antiLink(ctx.jid);
        const now = cur ? `on: ${cur.action}${cur.scope === 'gc' ? ' (group invite links only)' : ' (all links)'}` : 'off';
        return ctx.reply(`Anti-link is ${now}.\n${pre}antilink delete = delete links\n${pre}antilink warn = delete + warn, remove after 3 warnings\n${pre}antilink kick = delete + remove\n${pre}antilink off\nAdd "gc" to only catch WhatsApp group links, e.g. ${pre}antilink kick gc`);
      }
      if (action === 'off') { settings.setAntiLink(ctx.jid, null); return ctx.reply('Anti-link off.'); }
      const act = action === 'on' ? 'delete' : action;
      settings.setAntiLink(ctx.jid, { action: act, scope });
      const what = scope === 'gc' ? 'group invite links' : 'links';
      const result = { delete: 'get deleted', warn: 'get deleted and the sender warned (removed after 3 warnings)', kick: 'get deleted and the sender removed' }[act];
      return ctx.reply(`Anti-link on: ${what} from non-admins ${result}.`);
    },
  },
];
