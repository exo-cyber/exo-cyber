'use strict';

const config = require('./config');

const modules = [
  require('./general'),
  require('./ai'),
  require('./sticker'),
  require('./music'),
  require('./profile'),
  require('./fun'),
  require('./viewonce'),
  require('./group'),
  require('./owner')
];

// ==========================================
// COMBINE ALL COMMANDS
// ==========================================

const commands = modules.flat(Infinity).filter(Boolean);

// ==========================================
// COMMAND RUNNER
// ==========================================

async function run(ctx) {
  const prefix = config.prefix || '.';

  if (!ctx.text || !ctx.text.startsWith(prefix)) return false;

  const input = ctx.text.slice(prefix.length).trim();
  if (!input) return false;

  const [name, ...args] = input.split(/\s+/);
  const commandName = name.toLowerCase();

  const command = commands.find(cmd =>
    cmd.name?.toLowerCase() === commandName ||
    cmd.aliases?.some(alias => String(alias).toLowerCase() === commandName)
  );

  if (!command) return false;

  await command.run({
    ...ctx,
    args,
    text: args.join(' '),
    command: commandName
  });

  return true;
}

module.exports = {
  run,
  commands
};
