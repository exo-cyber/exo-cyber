'use strict';

const modules = [
  require('./general'),
  require('./ai'),
  require('./sticker'),
  require('./music'),
  require('./profile'),
  require('./fun'),
  require('./viewonce'),
  require('./group'),
  require('./interaction'),
  require('./admin'),
  require('./interaction'),
  require('./owner'),
  require('./tools')
];

// ==========================================
// COMBINE ALL COMMANDS
// ==========================================

const commands = modules.flat(Infinity).filter(Boolean);

// ==========================================
// COMMAND RUNNER
// ==========================================

async function run(ctx) {
  const prefix = '.';

  if (!ctx.text || !ctx.text.startsWith(prefix)) {
    return false;
  }

  const input = ctx.text.slice(prefix.length).trim();

  if (!input) return false;

  const [name, ...args] = input.split(/\s+/);

  const command = commands.find(cmd =>
    cmd.name === name.toLowerCase() ||
    cmd.aliases?.includes(name.toLowerCase())
  );

  if (!command) return false;

  await command.run({
    ...ctx,
    args,
    text: args.join(' '),
    command: name.toLowerCase()
  });

  return true;
}

module.exports = {
  run,
  commands
};