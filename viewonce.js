
'use strict';

// ==========================================
// EXO-CYBER WHATSAPP BOT
// CUTE & DAMN COMMANDS
// ==========================================

// Detect View Once messages
function isViewOnce(message) {
  if (!message || typeof message !== 'object') {
    return false;
  }

  for (const [key, value] of Object.entries(message)) {
    if (/^viewOnceMessage(V2|V2Extension)?$/.test(key)) {
      return true;
    }

    if (
      value &&
      typeof value === 'object' &&
      isViewOnce(value)
    ) {
      return true;
    }
  }

  return false;
}

// Detect normal photos
function isPhoto(message) {
  if (!message || typeof message !== 'object') {
    return false;
  }

  if (message.imageMessage) {
    return true;
  }

  for (const key of [
    'ephemeralMessage',
    'documentWithCaptionMessage'
  ]) {
    if (message[key]?.message &&
        isPhoto(message[key].message)) {
      return true;
    }
  }

  return false;
}

// ==========================================
// COMMANDS
// ==========================================

module.exports = [
  {
    name: 'damn',
    category: 'FUN',
    menu: ['damn'],

    run: async (ctx) => {
      const quoted = ctx.ctxInfo?.quotedMessage;

      if (!quoted) {
        return ctx.reply(
          'Reply to a photo with .damn'
        );
      }

      if (isViewOnce(quoted)) {
        return ctx.reply(
          '😈 Damn! That was a View Once message.'
        );
      }

      if (isPhoto(quoted)) {
        return ctx.reply(
          '😈 DAMNN! That picture is something else!'
        );
      }

      return ctx.reply(
        'Please reply to a photo with .damn'
      );
    }
  },

  {
    name: 'cute',
    category: 'FUN',
    menu: ['cute'],

    run: async (ctx) => {
      const quoted = ctx.ctxInfo?.quotedMessage;

      if (!quoted) {
        return ctx.reply(
          'Reply to a photo with .cute'
        );
      }

      if (isViewOnce(quoted)) {
        return ctx.reply(
          '🥰 Cute! That was a View Once message.'
        );
      }

      if (isPhoto(quoted)) {
        return ctx.reply(
          '🥰 Awww! Such a cute picture!'
        );
      }

      return ctx.reply(
        'Please reply to a photo with .cute'
      );
    }
  }
];
;
