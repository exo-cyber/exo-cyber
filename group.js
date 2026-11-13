const { numberOf } = require('./jid');

async function getGroup(ctx) {
  if (!ctx.isGroup) {
    await ctx.reply('This command only works in groups.');
    return null;
  }

  const metadata = await ctx.sock.groupMetadata(ctx.jid);
  const participants = metadata.participants || [];

  const isAdmin = (id) => {
    const num = numberOf(id);
    return participants.some(
      p => numberOf(p.id) === num && (p.admin === 'admin' || p.admin === 'superadmin')
    );
  };

  const botIds = [
    ctx.sock.user?.id,
    ctx.sock.user?.lid
  ].filter(Boolean);

  const botIsAdmin = botIds.some(isAdmin);

  if (!ctx.isOwner && !isAdmin(ctx.sender)) {
    await ctx.reply('Only group admins can use this command.');
    return null;
  }

  if (!botIsAdmin) {
    await ctx.reply('Please make EXO a group admin first.');
    return null;
  }

  return metadata;
}

// Targets from @mentions, falling back to the replied-to sender if available
function getTargets(ctx) {
  const list = [...(ctx.mentioned || [])];
  if (!list.length && ctx.quotedSender) list.push(ctx.quotedSender);
  return [...new Set(list)];
}

function argText(ctx) {
  return (ctx.args || []).join(' ').trim();
}

async function updateMembers(ctx, action, doneMsg, usage) {
  const group = await getGroup(ctx);
  if (!group) return;

  const targets = getTargets(ctx);
  if (!targets.length) return ctx.reply(usage);

  await ctx.sock.groupParticipantsUpdate(ctx.jid, targets, action);
  await ctx.reply(doneMsg);
}

module.exports = [
  {
    name: 'kick',
    category: 'GROUP',
    menu: ['kick'],
    run: async (ctx) => {
      const group = await getGroup(ctx);
      if (!group) return;

      const targets = [...new Set(ctx.mentioned || [])];

      if (!targets.length) {
        return ctx.reply('Tag the member you want to remove.\nExample: .kick @user');
      }

      await ctx.sock.groupParticipantsUpdate(
        ctx.jid, targets, 'remove'
      );

      await ctx.reply('EXO: Member removal request completed.');
    }
  },

  {
    name: 'add',
    category: 'GROUP',
    menu: ['add'],
    run: async (ctx) => {
      const group = await getGroup(ctx);
      if (!group) return;

      const number = (ctx.args || []).join('').replace(/\D/g, '');

      if (!/^\d{10,15}$/.test(number)) {
        return ctx.reply(
          'Enter the phone number with country code.\nExample: .add 2348012345678'
        );
      }

      const jid = number + '@s.whatsapp.net';

      await ctx.sock.groupParticipantsUpdate(
        ctx.jid, [jid], 'add'
      );

      await ctx.reply('EXO: Add member request completed.');
    }
  },

  {
    name: 'promote',
    category: 'GROUP',
    menu: ['promote'],
    run: (ctx) =>
      updateMembers(
        ctx,
        'promote',
        'EXO: Member promoted to admin.',
        'Tag the member you want to promote.\nExample: .promote @user'
      )
  },

  {
    name: 'demote',
    category: 'GROUP',
    menu: ['demote'],
    run: (ctx) =>
      updateMembers(
        ctx,
        'demote',
        'EXO: Admin demoted to member.',
        'Tag the admin you want to demote.\nExample: .demote @user'
      )
  },

  {
    name: 'link',
    category: 'GROUP',
    menu: ['link'],
    run: async (ctx) => {
      const group = await getGroup(ctx);
      if (!group) return;

      const code = await ctx.sock.groupInviteCode(ctx.jid);
      await ctx.reply(`EXO: Group invite link\nhttps://chat.whatsapp.com/${code}`);
    }
  },

  {
    name: 'revoke',
    category: 'GROUP',
    menu: ['revoke'],
    run: async (ctx) => {
      const group = await getGroup(ctx);
      if (!group) return;

      await ctx.sock.groupRevokeInvite(ctx.jid);
      await ctx.reply('EXO: Old invite link revoked. Use .link for the new one.');
    }
  },

  {
    name: 'mute',
    category: 'GROUP',
    menu: ['mute'],
    run: async (ctx) => {
      const group = await getGroup(ctx);
      if (!group) return;

      await ctx.sock.groupSettingUpdate(ctx.jid, 'announcement');
      await ctx.reply('EXO: Group muted. Only admins can send messages now.');
    }
  },

  {
    name: 'unmute',
    category: 'GROUP',
    menu: ['unmute'],
    run: async (ctx) => {
      const group = await getGroup(ctx);
      if (!group) return;

      await ctx.sock.groupSettingUpdate(ctx.jid, 'not_announcement');
      await ctx.reply('EXO: Group unmuted. Everyone can send messages.');
    }
  },

  {
    name: 'lock',
    category: 'GROUP',
    menu: ['lock'],
    run: async (ctx) => {
      const group = await getGroup(ctx);
      if (!group) return;

      await ctx.sock.groupSettingUpdate(ctx.jid, 'locked');
      await ctx.reply('EXO: Group info locked. Only admins can edit it.');
    }
  },

  {
    name: 'unlock',
    category: 'GROUP',
    menu: ['unlock'],
    run: async (ctx) => {
      const group = await getGroup(ctx);
      if (!group) return;

      await ctx.sock.groupSettingUpdate(ctx.jid, 'unlocked');
      await ctx.reply('EXO: Group info unlocked. Everyone can edit it.');
    }
  },

  {
    name: 'setname',
    category: 'GROUP',
    menu: ['setname'],
    run: async (ctx) => {
      const group = await getGroup(ctx);
      if (!group) return;

      const name = argText(ctx);
      if (!name) return ctx.reply('Enter the new group name.\nExample: .setname EXO Squad');
      if (name.length > 100) return ctx.reply('Group name must be 100 characters or less.');

      await ctx.sock.groupUpdateSubject(ctx.jid, name);
      await ctx.reply('EXO: Group name updated.');
    }
  },

  {
    name: 'setdesc',
    category: 'GROUP',
    menu: ['setdesc'],
    run: async (ctx) => {
      const group = await getGroup(ctx);
      if (!group) return;

      const desc = argText(ctx);
      if (!desc) return ctx.reply('Enter the new group description.\nExample: .setdesc Be nice here');

      await ctx.sock.groupUpdateDescription(ctx.jid, desc);
      await ctx.reply('EXO: Group description updated.');
    }
  },

  {
    name: 'tagall',
    category: 'GROUP',
    menu: ['tagall'],
    run: async (ctx) => {
      const group = await getGroup(ctx);
      if (!group) return;

      const ids = (group.participants || []).map(p => p.id);
      const note = argText(ctx) || 'Attention everyone!';

      const lines = ids.map(id => `┃ @${numberOf(id)}`).join('\n');

      await ctx.sock.sendMessage(ctx.jid, {
        text:
          `╭━━━「 EXO TAGALL 」\n` +
          `┃ ${note}\n┃\n` +
          `${lines}\n` +
          `╰━━━━━━━━━━━━`,
        mentions: ids
      });
    }
  },

  {
    name: 'hidetag',
    category: 'GROUP',
    menu: ['hidetag'],
    run: async (ctx) => {
      const group = await getGroup(ctx);
      if (!group) return;

      const text = argText(ctx);
      if (!text) return ctx.reply('Enter the message to send.\nExample: .hidetag Meeting at 8pm');

      await ctx.sock.sendMessage(ctx.jid, {
        text,
        mentions: (group.participants || []).map(p => p.id)
      });
    }
  },

  {
    name: 'admins',
    category: 'GROUP',
    menu: ['admins'],
    run: async (ctx) => {
      if (!ctx.isGroup) return ctx.reply('This command only works in groups.');

      const metadata = await ctx.sock.groupMetadata(ctx.jid);
      const admins = (metadata.participants || []).filter(
        p => p.admin === 'admin' || p.admin === 'superadmin'
      );

      const lines = admins
        .map(p => `┃ ${p.admin === 'superadmin' ? '👑' : '🛡️'} @${numberOf(p.id)}`)
        .join('\n');

      await ctx.sock.sendMessage(ctx.jid, {
        text: `╭━━━「 EXO ADMINS 」\n${lines}\n╰━━━━━━━━━━━━`,
        mentions: admins.map(p => p.id)
      });
    }
  },

  {
    name: 'groupinfo',
    category: 'GROUP',
    menu: ['groupinfo'],
    run: async (ctx) => {
      if (!ctx.isGroup) return ctx.reply('This command only works in groups.');

      const m = await ctx.sock.groupMetadata(ctx.jid);
      const total = (m.participants || []).length;
      const adminCount = (m.participants || []).filter(p => p.admin).length;
      const created = m.creation
        ? new Date(m.creation * 1000).toLocaleDateString()
        : 'Unknown';

      await ctx.reply(
        `╭━━━「 EXO GROUP INFO 」\n` +
        `┃ Name: ${m.subject}\n` +
        `┃ Members: ${total}\n` +
        `┃ Admins: ${adminCount}\n` +
        `┃ Created: ${created}\n` +
        `┃ Description: ${m.desc || 'None'}\n` +
        `╰━━━━━━━━━━━━`
      );
    }
  }
];
