// Reads who the admins are in a group (works with phone numbers and hidden LIDs).
const { numberOf } = require('./jid');

async function groupInfo(sock, jid) {
  const meta = await sock.groupMetadata(jid);
  const nums = (p) => [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).map(numberOf);
  const admins = new Set(meta.participants.filter((p) => p.admin).flatMap(nums));
  const bots = [sock.user?.id, sock.user?.lid].filter(Boolean).map(numberOf);
  return { meta, admins, botNumbers: bots, botIsAdmin: bots.some((b) => admins.has(b)) };
}

const LINK_ALL = /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|me|co|xyz|link|ly|gg)\/\S*/i;
const LINK_GC = /chat\.whatsapp\.com\/\S+/i;

const MAX_WARNS = Math.max(1, Number(process.env.ANTILINK_WARNS) || 3);

// Called for every group message that is not a command. cfg = { action, scope } from settings.antiLink().
// Returns true if it acted on a link.
async function enforceAntiLink(ctx, cfg, settings) {
  if (!cfg || !ctx.text) return false;
  if (!(cfg.scope === 'gc' ? LINK_GC : LINK_ALL).test(ctx.text)) return false;
  if (ctx.isOwner || settings.protectedIds().includes(ctx.senderNum)) return false;
  const info = await groupInfo(ctx.sock, ctx.jid);
  if (info.admins.has(ctx.senderNum) || !info.botIsAdmin) return false;

  await ctx.sock.sendMessage(ctx.jid, { delete: ctx.msg.key }); // every mode deletes the link
  const tag = `@${ctx.senderNum}`;
  const say = (text) => ctx.sock.sendMessage(ctx.jid, { text, mentions: [ctx.sender] });

  if (cfg.action === 'kick') {
    await ctx.sock.groupParticipantsUpdate(ctx.jid, [ctx.sender], 'remove');
    await say(`${tag} sent a link and got removed.`);
  } else if (cfg.action === 'warn') {
    const n = settings.addAntiLinkWarn(ctx.jid, ctx.senderNum);
    if (n >= MAX_WARNS) {
      settings.clearAntiLinkWarn(ctx.jid, ctx.senderNum);
      await ctx.sock.groupParticipantsUpdate(ctx.jid, [ctx.sender], 'remove');
      await say(`${tag} hit ${MAX_WARNS}/${MAX_WARNS} warnings for links and got removed.`);
    } else {
      await say(`${tag} no links here. Warning ${n}/${MAX_WARNS}.`);
    }
  }
  return true; // 'delete' = silent delete
}

module.exports = { groupInfo, enforceAntiLink };
