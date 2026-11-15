'use strict';

const { getPrefix } = require('./prefix');

// essentials goes BEFORE sticker/music so its .sticker and .play
// win over the old (faulty) ones with the same name
const modules = [
  require('./general'),
  require('./ai'),
  require('./essentials'),
  require('./sticker'),
  require('./music'),
  require('./profile'),
  require('./fun'),
  require('./viewonce'),
  require('./group'),
  require('./interaction'),
  require('./admin'),
  require('./owner'),
  require('./tools')
];

// ==========================================
// COMBINE ALL COMMANDS (first one with a name wins, no duplicates)
// ==========================================

const seen = new Set();

const commands = modules
  .flat(Infinity)
  .filter(Boolean)
  .filter(cmd => {
    if (!cmd.name || seen.has(cmd.name)) return false;
    seen.add(cmd.name);
    return true;
  });

// ==========================================
// COMMAND RUNNER
// ==========================================

async function run(ctx) {
  const prefix = getPrefix();

  if (!ctx.text || !ctx.text.startsWith(prefix)) {
    return false;
  }

  const input = ctx.text.slice(prefix.length).trim();

  if (!input) return false;

  const [name, ...args] = input.split(/\s+/);
  const lower = name.toLowerCase();

  const command = commands.find(cmd =>
    cmd.name === lower ||
    cmd.aliases?.includes(lower)
  );

  if (!command) return false;

  await command.run({
    ...ctx,
    args,
    text: args.join(' '),
    command: lower
  });

  return true;
}

module.exports = {
  run,
  commands
};
