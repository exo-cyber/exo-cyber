
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

  if (/\bexo[- ]?cyber\b/i.test(ctx.text)) {
    return true;
  }

  const quotedId = ctx.ctxInfo?.stanzaId;

  // Reply to a message sent by Exo-Cyber
  if (quotedId && sentIds.has(quotedId)) {
    if (ctx.ctxInfo?.participant) {
      extraBotIds.add(numberOf(ctx.ctxInfo.participant));
    }

    return true;
  }

  // Bot mention
  if (
    ctx.mentioned.some(j =>
      bots.includes(numberOf(j))
    )
  ) {
    return true;
  }

  // Reply to bot participant
  if (
    ctx.ctxInfo?.participant &&
    bots.includes(numberOf(ctx.ctxInfo.participant))
  ) {
    return true;
  }

  return false;
}

// ==========================================
// AFK HANDLING
// ==========================================

async function afkHandling(ctx, isAfkCommand) {

  // Check if AFK user has returned
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

  // Check mentioned and replied users
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

    if (!msg?.message || msg.key?.fromMe) return;

    const jid = msg.key?.remoteJid;

    if (!jid) return;

    if (
      jid.endsWith('@broadcast') ||
      jid.endsWith('@newsletter')
    ) {
      return;
    }

    // Prevent duplicate messages
    if (isDuplicate(msg.key?.id)) return;

    // Ignore old messages after reconnect
    const timestamp = Number(msg.messageTimestamp) || 0;

    if (
      timestamp &&
      Date.now() / 1000 - timestamp > 120
    ) {
      return;
    }

    // Extract WhatsApp message
    const m = unwrap(msg.message);

    if (
      !m ||
      m.protocolMessage ||
      m.reactionMessage ||
      (
        m.senderKeyDistributionMessage &&
        Object.keys(m).length === 1
      )
    ) {
      return;
    }

    // Learn phone number and LID aliases
    learnAliases(msg);

    // Message information
    const text = getText(m).trim();

    const isGroup = jid.endsWith('@g.us');

    const sender = msg.key.participant || jid;

    const senderNum = numberOf(sender);

    const ctxInfo = getContext(m);

    const prefix = settings.prefix(!);

    // ======================================
    // COMMAND CONTEXT
    // ======================================

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

      reply: (message, extra = {}) =>
        sock.sendMessage(
          jid,
          {
            text: message,
            ...extra
          },
          {
            quoted: msg
          }
        )
    };

    // ======================================
    // DETECT COMMANDS
    // ======================================

    const isCmd = text.startsWith(prefix);

    const isAfkCommand =
      isCmd &&
      /^afk(\s|$)/i.test(
        text.slice(prefix.length).trim()
      );

    // ======================================
    // 1. AFK SYSTEM
    // ======================================

    await afkHandling(ctx, isAfkCommand).catch(error => {
      log.warn('AFK handling failed:', error.message);
    });

    // ======================================
    // 2. COMMAND SYSTEM
    // ======================================

    if (isCmd) {
      const handled = await commands.run(ctx);

      if (handled) return;
    }

    // ======================================
    // 3. NICK PROTECTION
    // ======================================

    const protect = nick.check(ctx);

    if (protect) {

      await sock.sendMessage(
        jid,
        {
          react: {
            text: protect.emoji,
            key: msg.key
          }
        }
      ).catch(() => {});

      await ctx.reply(protect.reply);

      return;
    }

    // ======================================
    // 4. AI CHAT SYSTEM
    // ======================================

    if (!text) return;

    if (!settings.isAiOn(jid)) return;

    if (!isAddressed(ctx, botNumbers(sock))) return;

    // Respond when someone calls Exo-Cyber
    if (
      /^@?\s*exo[- ]?cyber[\s!?.,]*$/i.test(text)
    ) {
      await ctx.reply(nameCallReply());
      return;
    }

    // ======================================
    // AI COOLDOWN
    // ======================================

    const last = lastAiAt.get(senderNum) || 0;

    if (
      Date.now() - last <
      config.ai.userCooldownMs
    ) {
      return;
    }

    lastAiAt.set(senderNum, Date.now());

    // ======================================
    // AI TYPING INDICATOR
    // ======================================

    await sock.sendPresenceUpdate(
      'composing',
      jid
    ).catch(() => {});

    // ======================================
    // AI MEMORY AND PROMPT
    // ======================================

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

    // ======================================
    // GENERATE AI RESPONSE
    // ======================================

    const result = await fallback.generate(messages);

    await sock.sendPresenceUpdate(
      'paused',
      jid
    ).catch(() => {});

    // ======================================
    // AI OFFLINE RESPONSE
    // ======================================

    if (!result) {

      log.warn(
        'All AI providers failed for a message.'
      );

      await ctx.reply(offlineReply());

      return;
    }

    // ======================================
    // SAVE CONVERSATION MEMORY
    // ======================================

    memory.add(senderNum, 'user', text);

    memory.add(
      senderNum,
      'assistant',
      result.text
    );

    // ======================================
    // SEND AI RESPONSE
    // ======================================

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


