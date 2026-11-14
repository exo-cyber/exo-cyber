const { numberOf } = require('./jid');

// Get group metadata
async function getGroup(ctx) {
  if (!ctx.isGroup) {
    await ctx.reply('This command only works in groups.');
    return null;
  }

  try {
    return await ctx.sock.groupMetadata(ctx.jid);
  } catch (err) {
    await ctx.reply(`Could not fetch group information: ${err.message}`);
    return null;
  }
}

// Check whether a participant is an admin
function isAdmin(metadata, id) {
  const target = numberOf(id);

  return (metadata.participants || []).some(p => {
    const ids = [p.id, p.jid, p.phoneNumber, p.lid].filter(Boolean);

    return ids.some(value => numberOf(value) === target) &&
      (p.admin === 'admin' || p.admin === 'superadmin');
  });
}

// Check bot and user permissions for admin-only actions
async function getAdminGroup(ctx) {
  const metadata = await getGroup(ctx);
  if (!metadata) return null;

  if (!ctx.isOwner && !isAdmin(metadata, ctx.sender)) {
    await ctx.reply('Only group admins or the EXO owner can use this command.');
    return null;
  }

  const botIds = [
    ctx.sock.user?.id,
    ctx.sock.user?.lid
  ].filter(Boolean);

  const botIsAdmin = botIds.some(id => isAdmin(metadata, id));

  if (!botIsAdmin) {
    await ctx.reply('Please make EXO a group admin first.');
    return null;
  }

  return metadata;
}

// Get mentioned or quoted participants
function getTargets(ctx) {
  const targets = [...(ctx.mentioned || [])];

  if (!targets.length) {
    const quoted = ctx.quotedSender || (
      ctx.ctxInfo?.quotedMessage ? ctx.ctxInfo?.participant : null
    );

    if (quoted) targets.push(quoted);
  }

  return [...new Set(targets.filter(Boolean))];
}

function argText(ctx) {
  return (ctx.args || []).join(' ').trim();
}

// Run participant actions
async function updateMembers(ctx, action, successMessage, usage) {
  const metadata = await getAdminGroup(ctx);
  if (!metadata) return;

  const targets = getTargets(ctx);

  if (!targets.length) {
    return ctx.reply(usage);
  }

  try {
    const result = await ctx.sock.groupParticipantsUpdate(
      ctx.jid,
      targets,
      action
    );

    await ctx.reply(
      `${successMessage}\n${JSON.stringify(result)}`
    );
  } catch (err) {
    await ctx.reply(`EXO: ${action} failed: ${err.message}`);
  }
}

// Export commands
module.exports = [

  // KICK
  {
    name: 'kick',
    category: 'GROUP',
    menu: ['kick'],
    run: async ctx => {
      const metadata = await getAdminGroup(ctx);
      if (!metadata) return;

      const targets = getTargets(ctx);

      if (!targets.length) {
        return ctx.reply('Tag or reply to the member you want to remove.\nExample: .kick @user');
      }

      try {
        await ctx.sock.groupParticipantsUpdate(ctx.jid, targets, 'remove');
        await ctx.reply('EXO: Member removal request sent.');
      } catch (err) {
        await ctx.reply(`Kick failed: ${err.message}`);
      }
    }
  },

  // ADD
  {
    name: 'add',
    category: 'GROUP',
    menu: ['add'],
    run: async ctx => {
      const metadata = await getAdminGroup(ctx);
      if (!metadata) return;

      const number = (ctx.args || []).join('').replace(/\D/g, '');

      if (!/^\d{10,15}$/.test(number)) {
        return ctx.reply('Enter the phone number with country code.\nExample: .add 2348012345678');
      }

      try {
        const result = await ctx.sock.groupParticipantsUpdate(
          ctx.jid,
          [number + '@s.whatsapp.net'],
          'add'
        );

        await ctx.reply(`EXO: Add request completed.\n${JSON.stringify(result)}`);
      } catch (err) {
        await ctx.reply(`Add failed: ${err.message}`);
      }
    }
  },

  // PROMOTE
  {
    name: 'promote',
    category: 'GROUP',
    menu: ['promote'],
    run: ctx => updateMembers(
      ctx,
      'promote',
      'EXO: Promotion request sent.',
      'Tag or reply to the member.\nExample: .promote @user'
    )
  },

  // DEMOTE
  {
    name: 'demote',
    category: 'GROUP',
    menu: ['demote'],
    run: ctx => updateMembers(
      ctx,
      'demote',
      'EXO: Demotion request sent.',
      'Tag or reply to the admin.\nExample: .demote @user'
    )
  },

  // GROUP LINK
  {
    name: 'link',
    category: 'GROUP',
    menu: ['link'],
    run: async ctx => {
      const metadata = await getAdminGroup(ctx);
      if (!metadata) return;

      try {
        const code = await ctx.sock.groupInviteCode(ctx.jid);
        await ctx.reply(`╭━━━「 EXO GROUP LINK 」\n┃ https://chat.whatsapp.com/${code}\n╰━━━━━━━━━━━━`);
      } catch (err) {
        await ctx.reply(`Could not get group link: ${err.message}`);
      }
    }
  },

  // REVOKE LINK
  {
    name: 'revoke',
    category: 'GROUP',
    menu: ['revoke'],
    run: async ctx => {
      const metadata = await getAdminGroup(ctx);
      if (!metadata) return;

      try {
        await ctx.sock.groupRevokeInvite(ctx.jid);
        await ctx.reply('EXO: Old group invite link revoked. Use .link for the new one.');
      } catch (err) {
        await ctx.reply(`Link revoke failed: ${err.message}`);
      }
    }
  },

  // MUTE
  {
    name: 'mute',
    category: 'GROUP',
    menu: ['mute'],
    run: async ctx => {
      const metadata = await getAdminGroup(ctx);
      if (!metadata) return;

      try {
        await ctx.sock.groupSettingUpdate(ctx.jid, 'announcement');
        await ctx.reply('EXO: Group muted. Only admins can send messages.');
      } catch (err) {
        await ctx.reply(`Mute failed: ${err.message}`);
      }
    }
  },

  // UNMUTE
  {
    name: 'unmute',
    category: 'GROUP',
    menu: ['unmute'],
    run: async ctx => {
      const metadata = await getAdminGroup(ctx);
      if (!metadata) return;

      try {
        await ctx.sock.groupSettingUpdate(ctx.jid, 'not_announcement');
        await ctx.reply('EXO: Group unmuted. Everyone can send messages.');
      } catch (err) {
        await ctx.reply(`Unmute failed: ${err.message}`);
      }
    }
  },

  // LOCK GROUP INFO
  {
    name: 'lock',
    category: 'GROUP',
    menu: ['lock'],
    run: async ctx => {
      const metadata = await getAdminGroup(ctx);
      if (!metadata) return;

      try {
        await ctx.sock.groupSettingUpdate(ctx.jid, 'locked');
        await ctx.reply('EXO: Group info locked. Only admins can edit it.');
      } catch (err) {
        await ctx.reply(`Lock failed: ${err.message}`);
      }
    }
  },

  // UNLOCK GROUP INFO
  {
    name: 'unlock',
    category: 'GROUP',
    menu: ['unlock'],
    run: async ctx => {
      const metadata = await getAdminGroup(ctx);
      if (!metadata) return;

      try {
        await ctx.sock.groupSettingUpdate(ctx.jid, 'unlocked');
        await ctx.reply('EXO: Group info unlocked.');
      } catch (err) {
        await ctx.reply(`Unlock failed: ${err.message}`);
      }
    }
  },

  // SET GROUP NAME
  {
    name: 'setname',
    category: 'GROUP',
    menu: ['setname'],
    run: async ctx => {
      const metadata = await getAdminGroup(ctx);
      if (!metadata) return;

      const name = argText(ctx);

      if (!name) return ctx.reply('Enter the new group name.\nExample: .setname EXO Squad');
      if (name.length > 100) return ctx.reply('Group name must be 100 characters or less.');

      try {
        await ctx.sock.groupUpdateSubject(ctx.jid, name);
        await ctx.reply('EXO: Group name updated.');
      } catch (err) {
        await ctx.reply(`Name update failed: ${err.message}`);
      }
    }
  },

  // SET GROUP DESCRIPTION
  {
    name: 'setdesc',
    category: 'GROUP',
    menu: ['setdesc'],
    run: async ctx => {
      const metadata = await getAdminGroup(ctx);
      if (!metadata) return;

      const desc = argText(ctx);

      if (!desc) return ctx.reply('Enter the new group description.\nExample: .setdesc Welcome to EXO Squad');

      try {
        await ctx.sock.groupUpdateDescription(ctx.jid, desc);
        await ctx.reply('EXO: Group description updated.');
      } catch (err) {
        await ctx.reply(`Description update failed: ${err.message}`);
      }
    }
  },

  // TAG ALL
  {
    name: 'tagall',
    category: 'GROUP',
    menu: ['tagall'],
    run: async ctx => {
      const metadata = await getGroup(ctx);
      if (!metadata) return;

      const ids = (metadata.participants || []).map(p => p.id).filter(Boolean);
      const note = argText(ctx) || 'Attention everyone!';

      const lines = ids.map(id => `┃ @${numberOf(id)}`).join('\n');

      try {
        await ctx.sock.sendMessage(ctx.jid, {
          text: `╭━━━「 EXO TAGALL 」\n┃ ${note}\n┃\n${lines}\n╰━━━━━━━━━━━━`,
          mentions: ids
        });
      } catch (err) {
        await ctx.reply(`Tagall failed: ${err.message}`);
      }
    }
  },

  // HIDE TAG
  {
    name: 'hidetag',
    category: 'GROUP',
    menu: ['hidetag'],
    run: async ctx => {
      const metadata = await getGroup(ctx);
      if (!metadata) return;

      const text = argText(ctx);
      if (!text) return ctx.reply('Enter a message.\nExample: .hidetag Meeting at 8pm');

      try {
        await ctx.sock.sendMessage(ctx.jid, {
          text,
          mentions: (metadata.participants || []).map(p => p.id).filter(Boolean)
        });
      } catch (err) {
        await ctx.reply(`Hidetag failed: ${err.message}`);
      }
    }
  },

  // ADMINS
  {
    name: 'admins',
    category: 'GROUP',
    menu: ['admins'],
    run: async ctx => {
      const metadata = await getGroup(ctx);
      if (!metadata) return;

      const admins = (metadata.participants || []).filter(
        p => p.admin === 'admin' || p.admin === 'superadmin'
      );

      const lines = admins.map(
        p => `┃ ${p.admin === 'superadmin' ? '👑' : '🛡️'} @${numberOf(p.id)}`
      ).join('\n');

      await ctx.sock.sendMessage(ctx.jid, {
        text: `╭━━━「 EXO ADMINS 」\n${lines || '┃ No admins found'}\n╰━━━━━━━━━━━━`,
        mentions: admins.map(p => p.id)
      });
    }
  },

  // GROUP INFO
  {
    name: 'groupinfo',
    category: 'GROUP',
    menu: ['groupinfo'],
    run: async ctx => {
      const metadata = await getGroup(ctx);
      if (!metadata) return;

      const participants = metadata.participants || [];
      const total = participants.length;
      const adminCount = participants.filter(p => p.admin).length;

      const created = metadata.creation
        ? new Date(metadata.creation * 1000).toLocaleDateString()
        : 'Unknown';

      await ctx.reply(
        `╭━━━「 EXO GROUP INFO 」\n` +
        `┃ Name: ${metadata.subject}\n` +
        `┃ Members: ${total}\n` +
        `┃ Admins: ${adminCount}\n` +
        `┃ Created: ${created}\n` +
        `┃ Description: ${metadata.desc || 'None'}\n` +
        `╰━━━━━━━━━━━━`
      );
    }
  }

];
