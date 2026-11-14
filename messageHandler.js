'use strict';

// ==========================================
// EXO-CYBER WHATSAPP BOT
// MAIN MESSAGE HANDLER
// ==========================================

const config = require('./config');
const log = require('./logger');
const { numberOf } = require('./jid');
const { fmtDuration } = require('./time');
const { isDuplicate } = require('./dedupe');
const { unwrap, getText, getContext } = require('./helpers');

const commands = require('./index');
const nick = require('./nick');
const settings = require('./settings');
const memory = require('./memory');
const fallback = require('./fallback');

const {
  systemPrompt,
  offlineReply,
  nameCallReply
} = require('./personality');

// ==========================================
// STORAGE
// ==========================================

const lastAiAt = new Map();
const afkNoticeAt = new Map();

const sentIds = new Map();
const extraBotIds = new Set();
const wrapped = new WeakSet();

// ==========================================
// TRACK BOT MESSAGES
// ==========================================

function trackSent(sock) {
  if (wrapped.has(sock)) return;
  wrapped.add(sock);

  const original = sock.sendMessage.bind(sock);

  sock.sendMessage = async (...args) => {
    const result = await original(...args);
    const id = result?.key?.id;

    if (id) {
      sentIds.set(id, Date.now());

      if (sentIds.size > 1000) {
        for (const key of sentIds.keys()) {
          sentIds.delete(key);
          if (sentIds.size <= 800) break;
        }
      }
    }

    return result;
  };
}

// ==========================================
// BOT IDENTIFICATION
// ==========================================

function botNumbers(sock) {
  return [
    sock.user?.id,
    sock.user?.lid
  ]
    .filter(Boolean)
    .map(numberOf)
    .concat([...extraBotIds]);
}

// ==========================================
// LEARN WHATSAPP ALIASES
// ==========================================

function learnAliases(msg) {
  const k = msg.key || {};

  const ids = [
    k.participant,
    k.participantAlt,
    k.participantPn,
    k.remoteJidAlt,
    k.remoteJid
  ]
    .filter(j =>
      typeof j === 'string' &&
      (j.endsWith('@s.whatsapp.net') || j.endsWith('@lid'))
    )
    .map(numberOf);

  const unique = [...new Set(ids)];
  if (unique.length < 2) return;

  if (unique.some(n => settings.isOwner(n))) {
    settings.addClaimed(unique);
  } else if (
    unique.some(n => settings.protectedIds().includes(n))
  ) {
    settings.addProtectAlias(unique);
  }
}

// ==========================================
// CHECK IF BOT IS ADDRESSED
// ==========================================

function isAddressed(ctx, bots) {
  if (!ctx.isGroup) return true;

  if (/\bexo[- ]?cyber\b/i.test(ctx.text)) return true;

  const quotedId = ctx.ctxInfo?.stanzaId;

  if (quotedId && sentIds.has(quotedId)) {
    if (ctx.ctxInfo?.participant) {
      extraBotIds.add(numberOf(ctx.ctxInfo.participant));
    }
    return true;
  }

  if (
    ctx.mentioned.some(j =>
      bots.includes(numberOf(j))
    )
  ) {
    return true;
  }

  if (
    ctx.ctxInfo?.participant &&
    bots.includes(numberOf(ctx.ctxInfo.participant))
  ) {
    return true;
  }

  return false;
}

// ==========================================
// GROUP ADMIN CHECK
// ==========================================

async function getGroupMetadata(sock, jid) {
  try {
    return await sock.groupMetadata(jid);
  } catch (_) {
    return null;
  }
}

function participantIsAdmin(metadata, jid) {
  const participant = metadata?.participants?.find(p => p.id === jid);
  return Boolean(participant?.admin === 'admin' || participant?.admin === 'superadmin');
}

async function botIsGroupAdmin(sock, jid) {
  const metadata = await getGroupMetadata(sock, jid);
  const botIds = botNumbers(sock);
  const botParticipant = metadata?.participants?.find(p =>
    botIds.includes(numberOf(p.id))
  );
  return Boolean(
    botParticipant?.admin === 'admin' ||
    botParticipant?.admin === 'superadmin'
  );
}

// ==========================================
// ANTI-LINK
// ==========================================

const URL_PATTERN =
  /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/)[^\s<>"']+|(?:[a-z0-9-]+\.)+(?:com|net|org|ng|co|io|me|app|dev|info|biz|xyz|online|site)\b(?:\/[^\s<>"']*)?/gi;

function cleanUrl(value) {
  return String(value || '').replace(/[),.!?;:'"\]]+$/g, '');
}

function extractLinks(text) {
  return [...String(text || '').matchAll(URL_PATTERN)]
    .map(match => cleanUrl(match[0]))
    .filter(Boolean);
}

function inviteCode(url) {
  const match = String(url).match(/(?:https?:\/\/)?(?:www\.)?chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i);
  return match?.[1] || null;
}

async function isOnlyThisGroupsInvite(sock, jid, links) {
  if (!links.length) return false;

  const codes = links.map(inviteCode);
  if (codes.some(code => !code)) return false;

  try {
    const ownCode = await sock.groupInviteCode(jid);
    return Boolean(ownCode && codes.every(code => code === ownCode));
  } catch (_) {
    return false;
  }
}

async function enforceAntiLink(ctx) {
  if (!ctx.isGroup || !ctx.text) return false;

  const mode = settings.getAntiLinkMode();
  if (mode === 'off') return false;

  const links = extractLinks(ctx.text);
  if (!links.length) return false;

  // Allow this group's own invite link, but not other group links or external URLs.
  if (await isOnlyThisGroupsInvite(ctx.sock, ctx.jid, links)) return false;

  // Do not moderate the group owner/admins.
  const metadata = await getGroupMetadata(ctx.sock, ctx.jid);
  if (participantIsAdmin(metadata, ctx.sender)) return false;

  const shouldDelete = mode === 'delete' || mode === 'kickanddelete';
  const shouldKick = mode === 'kick' || mode === 'kickanddelete';

  if (shouldDelete) {
    await ctx.sock.sendMessage(ctx.jid, { delete: ctx.msg.key }).catch(err => {
      log.warn('Anti-link delete failed:', err.message);
    });
  }

  if (shouldKick) {
    const botAdmin = await botIsGroupAdmin(ctx.sock, ctx.jid);
    if (!botAdmin) {
      await ctx.reply('I need group admin permission to remove members.');
      return true;
    }

    await ctx.sock.groupParticipantsUpdate(
      ctx.jid,
      [ctx.sender],
      'remove'
    ).catch(err => {
      log.warn('Anti-link kick failed:', err.message);
    });
  }

  return true;
}

// ==========================================
// AFK HANDLING
// ==========================================

async function afkHandling(ctx, isAfkCommand) {
  const mine = settings.getAfk(ctx.senderNum);

  if (mine && !isAfkCommand) {
    settings.clearAfk(ctx.senderNum);

    await ctx.reply(
      `Welcome back! You were away for ${fmtDuration(
        Date.now() - mine.since
      )}.`
    );
  }

  if (!ctx.isGroup) return;

  const targets = [
    ...new Set([
      ...ctx.mentioned,
      ctx.ctxInfo?.participant
    ]
      .filter(Boolean)
      .map(numberOf))
  ];

  for (const n of targets) {
    const afk = settings.getAfk(n);
    if (!afk || n === ctx.senderNum) continue;

    const key = `${ctx.jid}:${n}`;

    if (Date.now() - (afkNoticeAt.get(key) || 0) < 5 * 60 * 1000) {
      continue;
    }

    afkNoticeAt.set(key, Date.now());

    await ctx.reply(
      `${afk.name || 'This person'} is AFK: ${afk.reason} ` +
      `(${fmtDuration(Date.now() - afk.since)} ago).`
    );
  }
}

// ==========================================
// MAIN MESSAGE HANDLER
// ==========================================

async function handleMessage(sock, msg) {
  try {
    trackSent(sock);

    const receivedAt = Date.now();

    // View-once messages are deliberately not cached or extracted here.
    if (!msg?.message || msg.key?.fromMe) return;

    const jid = msg.key?.remoteJid;
    if (!jid) return;

    if (jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return;
    if (isDuplicate(msg.key?.id)) return;

    const timestamp = Number(msg.messageTimestamp) || 0;
    if (timestamp && Date.now() / 1000 - timestamp > 120) return;

    const m = unwrap(msg.message);

    if (
      !m ||
      m.protocolMessage ||
      m.reactionMessage ||
      (m.senderKeyDistributionMessage && Object.keys(m).length === 1)
    ) {
      return;
    }

    learnAliases(msg);

    const text = getText(m).trim();
    const isGroup = jid.endsWith('@g.us');
    const sender = msg.key.participant || jid;
    const senderNum = numberOf(sender);
    const ctxInfo = getContext(m);
    const prefix = config.prefix || '.';

    const ctx = {
      sock,
      msg,
      m,
      jid,
      sender,
      senderNum,
      text,
      isGroup,
      ctxInfo,
      receivedAt,
      pushName: msg.pushName || '',
      mentioned: ctxInfo?.mentionedJid || [],
      isOwner: settings.isOwner(senderNum),
      isSudo: settings.isSudo(senderNum),
      commandList: commands.commands || [],
      reply: (message, extra = {}) =>
        sock.sendMessage(
          jid,
          { text: message, ...extra },
          { quoted: msg }
        )
    };

    const isCmd = text.startsWith(prefix);
    const commandText = isCmd ? text.slice(prefix.length).trim() : '';
    const commandName = commandText.split(/\s+/)[0]?.toLowerCase() || '';
    const isAfkCommand = isCmd && commandName === 'afk';

    // Moderation runs even when the bot is in private mode.
    const linkHandled = await enforceAntiLink(ctx);
    if (linkHandled) return;

    // Private mode blocks non-owner/non-sudo users from commands and AI.
    if (settings.getMode() === 'private' && !ctx.isSudo) return;

    await afkHandling(ctx, isAfkCommand).catch(error => {
      log.warn('AFK handling failed:', error.message);
    });

    // ======================================
    // COMMAND SYSTEM
    // ======================================

    if (isCmd) {
      const handled = await commands.run(ctx);
      if (handled) return;
    }

    // ======================================
    // NICK PROTECTION
    // ======================================

    const protect = nick.check(ctx);

    if (protect) {
      await sock.sendMessage(
        jid,
        { react: { text: protect.emoji, key: msg.key } }
      ).catch(() => {});

      await ctx.reply(protect.reply);
      return;
    }

    // ======================================
    // AI CHAT SYSTEM
    // ======================================

    if (!text) return;
    if (!settings.isAiOn(jid)) return;
    if (!isAddressed(ctx, botNumbers(sock))) return;

    if (/^@?\s*exo[- ]?cyber[\s!?.,]*$/i.test(text)) {
      await ctx.reply(nameCallReply());
      return;
    }

    const last = lastAiAt.get(senderNum) || 0;
    if (Date.now() - last < config.ai.userCooldownMs) return;

    lastAiAt.set(senderNum, Date.now());

    await sock.sendPresenceUpdate('composing', jid).catch(() => {});

    const messages = [
      {
        role: 'system',
        content: systemPrompt({
          isGroup,
          name: ctx.pushName
        })
      },
      ...memory.get(senderNum),
      { role: 'user', content: text }
    ];

    const result = await fallback.generate(messages);

    await sock.sendPresenceUpdate('paused', jid).catch(() => {});

    if (!result) {
      log.warn('All AI providers failed for a message.');
      await ctx.reply(offlineReply());
      return;
    }

    memory.add(senderNum, 'user', text);
    memory.add(senderNum, 'assistant', result.text);

    await ctx.reply(result.text);
  } catch (error) {
    log.warn(
      'Message handler error:',
      error.stack || error.message
    );
  }
}

// ==========================================
// EXPORT
// ==========================================

module.exports = { handleMessage };
