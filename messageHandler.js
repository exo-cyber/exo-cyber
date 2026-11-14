

'use strict';

// ==========================================
// EXO-CYBER WHATSAPP BOT
// MAIN MESSAGE HANDLER
// ==========================================

const config = require('./config');
const log = require('./logger');
const { numberOf } = require('./jid');
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
// OWNER
// ==========================================

const OWNER_NUMBER = '2347075369608';

function isOwnerNumber(number) {
  return String(number) === OWNER_NUMBER || Boolean(settings.isOwner(number));
}

function isSudoNumber(number) {
  if (isOwnerNumber(number)) return true;

  return typeof settings.isSudo === 'function'
    ? Boolean(settings.isSudo(number))
    : false;
}

// ==========================================
// STORAGE
// ==========================================

const lastAiAt = new Map();
const afkNoticeAt = new Map();
const sentIds = new Map();
const extraBotIds = new Set();
const wrapped = new WeakSet();
const aliasCache = new Map();

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
      (j.endsWith('@s.whatsapp.net') ||
       j.endsWith('@lid'))
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

  if (/\bexo[- ]?cyber\b/i.test(ctx.text)) {
    return true;
  }

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
// GROUP ADMIN HELPERS
// ==========================================

async function getGroupMetadata(sock, jid) {
  try {
    return await sock.groupMetadata(jid);
  } catch (error) {
    log.warn('Group metadata error:', error.message);
    return null;
  }
}

function isParticipantAdmin(metadata, jid) {
  const participant = metadata?.participants?.find(p =>
    p.id === jid ||
    numberOf(p.id) === numberOf(jid)
  );

  return Boolean(
    participant?.admin === 'admin' ||
    participant?.admin === 'superadmin'
  );
}

async function isBotGroupAdmin(sock, jid) {
  const metadata = await getGroupMetadata(sock, jid);
  const ids = botNumbers(sock);

  return Boolean(
    metadata?.participants?.some(p =>
      ids.includes(numberOf(p.id)) &&
      (p.admin === 'admin' || p.admin === 'superadmin')
    )
  );
}

// ==========================================
// RESOLVE ALL IDS (PHONE + LID) OF A SENDER
// WhatsApp groups often show members as @lid,
// so we also look up their real phone number.
// ==========================================

async function resolveSenderNumbers(sock, msg, jid, isGroup, sender) {
  const k = msg.key || {};

  const direct = [
    sender,
    k.participant,
    k.participantAlt,
    k.participantPn,
    k.remoteJidAlt
  ].filter(j =>
    typeof j === 'string' &&
    (j.endsWith('@s.whatsapp.net') || j.endsWith('@lid'))
  );

  const nums = new Set(direct.map(numberOf));

  // Already the owner, or we already have a real phone number: nothing to look up.
  if (!isGroup || [...nums].some(isOwnerNumber)) return [...nums];
  if (direct.some(j => j.endsWith('@s.whatsapp.net'))) return [...nums];

  const lidNum = numberOf(sender);
  const cached = aliasCache.get(lidNum);

  if (cached && Date.now() - cached.at < 30 * 60 * 1000) {
    cached.nums.forEach(n => nums.add(n));
    return [...nums];
  }

  const metadata = await getGroupMetadata(sock, jid);

  const member = metadata?.participants?.find(p =>
    [p.id, p.lid, p.phoneNumber]
      .filter(Boolean)
      .some(x => numberOf(x) === lidNum)
  );

  const found = member
    ? [member.id, member.lid, member.phoneNumber].filter(Boolean).map(numberOf)
    : [];

  aliasCache.set(lidNum, { nums: found, at: Date.now() });

  found.forEach(n => nums.add(n));

  return [...nums];
}

// ==========================================
// ANTI-LINK
// ==========================================

const LINK_PATTERN =
  /(?:https?:\/\/|www\.)[^\s<>"']+|chat\.whatsapp\.com\/[A-Za-z0-9_-]+|(?:[a-z0-9-]+\.)+(?:com|net|org|ng|co|io|me|app|dev|info|biz|xyz|online|site)(?:\/[^\s<>"']*)?/gi;

function cleanLink(value) {
  return String(value || '').replace(/[),.!?;:'"\]]+$/g, '');
}

function extractLinks(text) {
  return [...String(text || '').matchAll(LINK_PATTERN)]
    .map(m => cleanLink(m[0]))
    .filter(Boolean);
}

function getInviteCode(link) {
  const match = String(link).match(
    /(?:https?:\/\/)?(?:www\.)?chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i
  );

  return match?.[1] || null;
}

async function containsOnlyOwnGroupInvite(sock, jid, links) {
  if (!links.length) return false;

  const codes = links.map(getInviteCode);

  if (codes.some(code => !code)) return false;

  try {
    const ownCode = await sock.groupInviteCode(jid);

    return Boolean(
      ownCode &&
      codes.every(code => code === ownCode)
    );
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

  // Allow only this group's own invite link.
  if (
    await containsOnlyOwnGroupInvite(
      ctx.sock,
      ctx.jid,
      links
    )
  ) {
    return false;
  }

  const metadata = await getGroupMetadata(
    ctx.sock,
    ctx.jid
  );

  // Do not moderate group admins.
  if (isParticipantAdmin(metadata, ctx.sender)) {
    return false;
  }

  const shouldDelete =
    mode === 'delete' ||
    mode === 'kickanddelete';

  const shouldKick =
    mode === 'kick' ||
    mode === 'kickanddelete';

  if (shouldDelete) {
    try {
      await ctx.sock.sendMessage(ctx.jid, {
        delete: ctx.msg.key
      });
    } catch (error) {
      log.warn('Anti-link deletion failed:', error.message);
    }
  }

  if (shouldKick) {
    if (!(await isBotGroupAdmin(ctx.sock, ctx.jid))) {
      await ctx.reply(
        'I need group admin permission to remove members.'
      );

      return true;
    }

    try {
      await ctx.sock.groupParticipantsUpdate(
        ctx.jid,
        [ctx.sender],
        'remove'
      );
    } catch (error) {
      log.warn('Anti-link removal failed:', error.message);

      await ctx.reply(
        'I could not remove that member. Check my group admin permissions.'
      );
    }
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
      `Welcome back! You were away for ${
        Date.now() - mine.since
      } milliseconds.`
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

    if (
      Date.now() - (afkNoticeAt.get(key) || 0) <
      5 * 60 * 1000
    ) {
      continue;
    }

    afkNoticeAt.set(key, Date.now());

    await ctx.reply(
      `${afk.name || 'This person'} is AFK: ${afk.reason}`
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

    if (!msg?.message || msg.key?.fromMe) return;

    const jid = msg.key?.remoteJid;

    if (!jid) return;

    if (
      jid.endsWith('@broadcast') ||
      jid.endsWith('@newsletter')
    ) {
      return;
    }

    if (isDuplicate(msg.key?.id)) return;

    const timestamp =
      Number(msg.messageTimestamp) || 0;

    if (
      timestamp &&
      Date.now() / 1000 - timestamp > 120
    ) {
      return;
    }

    const m = unwrap(msg.message);

    if (
      !m ||
      m.protocolMessage ||
      m.reactionMessage
    ) {
      return;
    }

    learnAliases(msg);

    const text = getText(m).trim();
    const isGroup = jid.endsWith('@g.us');

    const sender =
      msg.key.participant || jid;

    const senderNum = numberOf(sender);
    const ctxInfo = getContext(m);

    const prefix = config.prefix || '.';

    // Every ID this sender is known by (phone number and LID)
    const senderNums = await resolveSenderNumbers(
      sock,
      msg,
      jid,
      isGroup,
      sender
    );

    const owner = senderNums.some(isOwnerNumber);
    const sudo = owner || senderNums.some(isSudoNumber);

    // Remember the owner's other IDs so later checks are instant
    if (
      owner &&
      senderNums.length > 1 &&
      typeof settings.addClaimed === 'function'
    ) {
      settings.addClaimed(senderNums);
    }

    const ctx = {
      sock,
      msg,
      m,
      jid,
      sender,
      senderNum,
      senderNums,
      text,
      isGroup,
      ctxInfo,
      receivedAt,

      pushName: msg.pushName || '',

      mentioned:
        ctxInfo?.mentionedJid || [],

      isOwner: owner,
      isSudo: sudo,

      commandList:
        commands.commands || [],

      reply: (message, extra = {}) =>
        sock.sendMessage(
          jid,
          {
            text: String(message),
            ...extra
          },
          {
            quoted: msg
          }
        )
    };

    const isCmd = text.startsWith(prefix);

    const commandText = isCmd
      ? text.slice(prefix.length).trim()
      : '';

    const commandName =
      commandText.split(/\s+/)[0]?.toLowerCase() || '';

    const isAfkCommand =
      isCmd && commandName === 'afk';

    // ANTI-LINK
    if (await enforceAntiLink(ctx)) return;

    // PRIVATE MODE
    const mode =
      typeof settings.getMode === 'function'
        ? settings.getMode()
        : 'public';

    if (mode === 'private' && !ctx.isSudo) {
      return;
    }

    // AFK
    await afkHandling(ctx, isAfkCommand).catch(error => {
      log.warn('AFK error:', error.message);
    });

    // COMMANDS
    if (isCmd) {
      const handled = await commands.run(ctx);

      if (handled) return;
    }

    // NICK PROTECTION
    const protect = nick.check(ctx);

    if (protect) {
      await sock.sendMessage(jid, {
        react: {
          text: protect.emoji,
          key: msg.key
        }
      }).catch(() => {});

      await ctx.reply(protect.reply);
      return;
    }

    // AI
    if (!text) return;

    if (!settings.isAiOn(jid)) return;

    if (!isAddressed(ctx, botNumbers(sock))) {
      return;
    }

    if (
      /^@?\s*exo[- ]?cyber[\s!?.,]*$/i.test(text)
    ) {
      await ctx.reply(nameCallReply());
      return;
    }

    const last =
      lastAiAt.get(senderNum) || 0;

    if (
      Date.now() - last <
      config.ai.userCooldownMs
    ) {
      return;
    }

    lastAiAt.set(senderNum, Date.now());

    await sock.sendPresenceUpdate(
      'composing',
      jid
    ).catch(() => {});

    const messages = [
      {
        role: 'system',
        content: systemPrompt({
          isGroup,
          name: ctx.pushName
        })
      },

      ...memory.get(senderNum),

      {
        role: 'user',
        content: text
      }
    ];

    const result =
      await fallback.generate(messages);

    await sock.sendPresenceUpdate(
      'paused',
      jid
    ).catch(() => {});

    if (!result) {
      log.warn('AI providers failed.');

      await ctx.reply(offlineReply());
      return;
    }

    memory.add(senderNum, 'user', text);

    memory.add(
      senderNum,
      'assistant',
      result.text
    );

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

module.exports = {
  handleMessage
};
