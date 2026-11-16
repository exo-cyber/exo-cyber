// friends.js — EXO-CYBER friends list (CommonJS)
// Owner marks people as friends. Friends get: access in private mode, no AI cooldown,
// anti-link bypass, and a warmer Exo-Cyber. Saved to friends.json (set DATA_DIR to a
// Railway volume path, or the list resets on every redeploy).

const fs = require('fs');
const path = require('path');

const FILE = path.join(process.env.DATA_DIR || __dirname, 'friends.json');

const clean = (n) => String(n || '').split('@')[0].split(':')[0].replace(/\D/g, '');

const load = () => {
  try {
    return fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : [];
  } catch {
    return [];
  }
};
const save = (list) => fs.writeFileSync(FILE, JSON.stringify(list, null, 2));

const isFriend = (num) => load().includes(clean(num));

const FRIEND_LINES = [
  'yo {name}, good to see you 🤝',
  'ayy {name}, what do you need?',
  '{name}! always a pleasure 😎',
  'my guy {name}, say less.',
];
const DEFAULT_LINES = ['hm.', 'yeah?', 'what.', 'speak.'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const targetNumber = (ctx) => clean(ctx.mentioned?.[0] || ctx.args?.[0]);

const commands = [
  {
    name: 'addfriend',
    category: 'FRIENDS',
    menu: '.addfriend',
    async run(ctx) {
      if (!ctx.isOwner) return ctx.reply('Owner only.');
      const num = targetNumber(ctx);
      if (!num) return ctx.reply('Tag someone (best) or give a number.\nExample: .addfriend @person');
      const list = load();
      if (list.includes(num)) return ctx.reply('Already a friend.');
      list.push(num);
      save(list);
      return ctx.reply(`@${num} is now a friend 🤝`, { mentions: [`${num}@s.whatsapp.net`] });
    },
  },
  {
    name: 'delfriend',
    category: 'FRIENDS',
    menu: '.delfriend',
    async run(ctx) {
      if (!ctx.isOwner) return ctx.reply('Owner only.');
      const num = targetNumber(ctx);
      if (!num) return ctx.reply('Tag someone or give a number.');
      const list = load();
      if (!list.includes(num)) return ctx.reply("Not on the friends list.");
      save(list.filter((n) => n !== num));
      return ctx.reply('Removed from friends.');
    },
  },
  {
    name: 'listfriends',
    category: 'FRIENDS',
    menu: '.listfriends',
    async run(ctx) {
      if (!ctx.isOwner) return ctx.reply('Owner only.');
      const list = load();
      if (!list.length) return ctx.reply('No friends added yet.');
      return ctx.reply(`*Friends (${list.length})*\n` + list.map((n, i) => `${i + 1}. ${n}`).join('\n'));
    },
  },
  {
    name: 'hi',
    category: 'FRIENDS',
    menu: '.hi',
    async run(ctx) {
      const line = ctx.isFriend
        ? pick(FRIEND_LINES).replace('{name}', ctx.pushName || 'friend')
        : pick(DEFAULT_LINES);
      return ctx.reply(line);
    },
  },
];

// Export the command array (what your loader expects) and attach isFriend as a
// non-enumerable property so loops over the array never see it.
Object.defineProperty(commands, 'isFriend', { value: isFriend, enumerable: false });
module.exports = commands;
