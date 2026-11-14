c// plugins/group.js
const num = (j) => j.split('@')[0].split(':')[0]

async function guard(ctx, needBotAdmin = true) {
  const { sock, jid, sender, isGroup, isOwner, reply } = ctx
  if (!isGroup) { await reply('This command only works in groups.'); return null }

  const meta = await sock.groupMetadata(jid)
  const admins = meta.participants.filter(p => p.admin).map(p => num(p.id))
  const me = num(sock.user.id)

  if (!isOwner && !admins.includes(num(sender))) {
    await reply('Admins only.'); return null
  }
  if (needBotAdmin && !admins.includes(me)) {
    await reply('Make me admin first.'); return null
  }
  return { meta, admins }
}

// target = @mention, replied-to user, or a typed number
function getTargets(ctx) {
  const { msg, mentioned = [], args = [] } = ctx
  const replied = msg.message?.extendedTextMessage?.contextInfo?.participant
  const typed = args
    .map(a => a.replace(/\D/g, ''))
    .filter(n => n.length >= 7)
    .map(n => n + '@s.whatsapp.net')
  return [...new Set([...mentioned, ...(replied ? [replied] : []), ...typed])]
}

const act = (action, label) => async (ctx) => {
  const g = await guard(ctx); if (!g) return
  const targets = getTargets(ctx)
  if (!targets.length) return ctx.reply('Tag, reply to, or type the number of someone.')

  const me = num(ctx.sock.user.id)
  const safe = targets.filter(t => num(t) !== me)
  if (action === 'remove') {
    // never kick the owner/creator
    const owner = g.meta.owner && num(g.meta.owner)
    if (safe.some(t => num(t) === owner)) return ctx.reply("Can't remove the group owner.")
  }
  try {
    const res = await ctx.sock.groupParticipantsUpdate(ctx.jid, safe, action)
    const failed = res?.filter(r => r.status && r.status !== '200') || []
    await ctx.reply(failed.length
      ? `${label} failed for ${failed.length} user(s).`
      : `${label} done.`)
  } catch (e) {
    await ctx.reply(`${label} failed: ${e.message}`)
  }
}

module.exports = [
  { name: 'kick',    category: 'Group', menu: 'remove a member',  run: act('remove',  'Kick') },
  { name: 'add',     category: 'Group', menu: 'add a number',     run: act('add',     'Add') },
  { name: 'promote', category: 'Group', menu: 'make admin',       run: act('promote', 'Promote') },
  { name: 'demote',  category: 'Group', menu: 'remove admin',     run: act('demote',  'Demote') },

  {
    name: 'tagall', category: 'Group', menu: 'mention everyone',
    run: async (ctx) => {
      const g = await guard(ctx, false); if (!g) return
      const ids = g.meta.participants.map(p => p.id)
      const text = (ctx.args.join(' ') || 'Attention') + '\n\n' +
        ids.map(i => '@' + num(i)).join(' ')
      await ctx.sock.sendMessage(ctx.jid, { text, mentions: ids })
    }
  },
  {
    name: 'mute', category: 'Group', menu: 'only admins can talk',
    run: async (ctx) => {
      if (!await guard(ctx)) return
      await ctx.sock.groupSettingUpdate(ctx.jid, 'announcement')
      ctx.reply('Group muted.')
    }
  },
  {
    name: 'unmute', category: 'Group', menu: 'everyone can talk',
    run: async (ctx) => {
      if (!await guard(ctx)) return
      await ctx.sock.groupSettingUpdate(ctx.jid, 'not_announcement')
      ctx.reply('Group unmuted.')
    }
  },
  {
    name: 'link', category: 'Group', menu: 'get invite link',
    run: async (ctx) => {
      if (!await guard(ctx)) return
      const code = await ctx.sock.groupInviteCode(ctx.jid)
      ctx.reply('https://chat.whatsapp.com/' + code)
    }
  }
];
