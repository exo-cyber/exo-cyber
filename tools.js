'use strict';

// ==========================================
// EXO-CYBER - TOOLS COMMANDS
// ==========================================

const crypto = require('crypto');

const pick = (items) =>
  items[Math.floor(Math.random() * items.length)];

function formatDuration(totalSeconds) {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);

  return [
    d ? `${d}d` : '',
    h ? `${h}h` : '',
    m ? `${m}m` : '',
    `${s}s`
  ].filter(Boolean).join(' ');
}

module.exports = [
  // ------------------------------------------
  // PING
  // ------------------------------------------
  {
    name: 'ping',
    aliases: ['speed'],
    category: 'TOOLS',
    menu: ['.ping'],
    run: async (ctx) => {
      const start = Date.now();
      await ctx.reply('🏓 Pinging...');
      const ms = Date.now() - start;

      await ctx.reply(`⚡ EXO-CYBER response time: ${ms}ms`);
    }
  },

  // ------------------------------------------
  // UPTIME
  // ------------------------------------------
  {
    name: 'uptime',
    aliases: ['runtime'],
    category: 'TOOLS',
    menu: ['.uptime'],
    run: async (ctx) => {
      const used = process.memoryUsage().rss / 1024 / 1024;

      await ctx.reply(
        '🤖 EXO-CYBER STATUS\n\n' +
        `⏱️ Uptime: ${formatDuration(process.uptime())}\n` +
        `💾 Memory: ${used.toFixed(1)} MB\n` +
        `🟢 Node: ${process.version}`
      );
    }
  },

  // ------------------------------------------
  // CALCULATOR
  // ------------------------------------------
  {
    name: 'calc',
    aliases: ['calculate', 'math'],
    category: 'TOOLS',
    menu: ['.calc 12*(3+4)'],
    run: async (ctx) => {
      const expression = (ctx.args || []).join(' ').trim();

      if (!expression) {
        return ctx.reply('Usage: .calc 12*(3+4)');
      }

      // Only digits, operators, brackets, dots and spaces are allowed
      if (!/^[0-9+\-*/%^().\s]+$/.test(expression)) {
        return ctx.reply('Only numbers and + - * / % ^ ( ) are allowed.');
      }

      try {
        const safe = expression.replace(/\^/g, '**');
        const result = Function(`"use strict"; return (${safe});`)();

        if (typeof result !== 'number' || !Number.isFinite(result)) {
          return ctx.reply('That calculation has no valid result.');
        }

        await ctx.reply(`🧮 ${expression} = ${result}`);
      } catch (error) {
        await ctx.reply('Invalid expression.');
      }
    }
  },

  // ------------------------------------------
  // TIME
  // ------------------------------------------
  {
    name: 'time',
    aliases: ['date'],
    category: 'TOOLS',
    menu: ['.time [timezone]'],
    run: async (ctx) => {
      const zone = ctx.args?.[0] || 'Africa/Lagos';

      try {
        const now = new Intl.DateTimeFormat('en-GB', {
          timeZone: zone,
          dateStyle: 'full',
          timeStyle: 'medium'
        }).format(new Date());

        await ctx.reply(`🕒 ${zone}\n${now}`);
      } catch (error) {
        await ctx.reply('Unknown timezone. Example: .time America/New_York');
      }
    }
  },

  // ------------------------------------------
  // COIN FLIP
  // ------------------------------------------
  {
    name: 'flip',
    aliases: ['coin'],
    category: 'TOOLS',
    menu: ['.flip'],
    run: async (ctx) => {
      await ctx.reply(`🪙 ${pick(['Heads', 'Tails'])}`);
    }
  },

  // ------------------------------------------
  // DICE
  // ------------------------------------------
  {
    name: 'dice',
    aliases: ['roll'],
    category: 'TOOLS',
    menu: ['.dice [sides]'],
    run: async (ctx) => {
      const sides = Math.min(
        Math.max(parseInt(ctx.args?.[0], 10) || 6, 2),
        1000
      );

      const roll = crypto.randomInt(1, sides + 1);

      await ctx.reply(`🎲 You rolled ${roll} (d${sides})`);
    }
  },

  // ------------------------------------------
  // CHOOSE
  // ------------------------------------------
  {
    name: 'choose',
    aliases: ['pickone'],
    category: 'TOOLS',
    menu: ['.choose pizza | burger | rice'],
    run: async (ctx) => {
      const options = (ctx.args || [])
        .join(' ')
        .split('|')
        .map(o => o.trim())
        .filter(Boolean);

      if (options.length < 2) {
        return ctx.reply('Usage: .choose pizza | burger | rice');
      }

      await ctx.reply(`🤔 I choose: ${pick(options)}`);
    }
  },

  // ------------------------------------------
  // PASSWORD GENERATOR
  // ------------------------------------------
  {
    name: 'password',
    aliases: ['genpass'],
    category: 'TOOLS',
    menu: ['.password [length]'],
    run: async (ctx) => {
      const length = Math.min(
        Math.max(parseInt(ctx.args?.[0], 10) || 16, 8),
        64
      );

      const chars =
        'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';

      let password = '';
      for (let i = 0; i < length; i++) {
        password += chars[crypto.randomInt(0, chars.length)];
      }

      await ctx.reply(
        `🔐 Generated password (${length} chars):\n\n${password}\n\n` +
        'Delete this message after saving it.'
      );
    }
  },

  // ------------------------------------------
  // BASE64
  // ------------------------------------------
  {
    name: 'base64',
    aliases: ['b64'],
    category: 'TOOLS',
    menu: ['.base64 encode/decode text'],
    run: async (ctx) => {
      const mode = (ctx.args?.[0] || '').toLowerCase();
      const text = (ctx.args || []).slice(1).join(' ');

      if (!['encode', 'decode'].includes(mode) || !text) {
        return ctx.reply('Usage: .base64 encode hello OR .base64 decode aGVsbG8=');
      }

      try {
        const output = mode === 'encode'
          ? Buffer.from(text, 'utf8').toString('base64')
          : Buffer.from(text, 'base64').toString('utf8');

        await ctx.reply(`🔤 ${mode.toUpperCase()}D:\n${output}`);
      } catch (error) {
        await ctx.reply('Could not process that text.');
      }
    }
  },

  // ------------------------------------------
  // REVERSE
  // ------------------------------------------
  {
    name: 'reverse',
    category: 'TOOLS',
    menu: ['.reverse text'],
    run: async (ctx) => {
      const text = (ctx.args || []).join(' ');

      if (!text) return ctx.reply('Usage: .reverse hello');

      await ctx.reply(`🔁 ${[...text].reverse().join('')}`);
    }
  },

  // ------------------------------------------
  // COUNT
  // ------------------------------------------
  {
    name: 'count',
    aliases: ['wordcount'],
    category: 'TOOLS',
    menu: ['.count text'],
    run: async (ctx) => {
      const text = (ctx.args || []).join(' ');

      if (!text) return ctx.reply('Usage: .count your text here');

      const words = text.trim().split(/\s+/).length;

      await ctx.reply(
        '📊 TEXT STATS\n\n' +
        `Characters: ${text.length}\n` +
        `Words: ${words}`
      );
    }
  }
];
