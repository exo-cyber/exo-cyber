

'use strict';

const { getPrefix } = require('./prefix');

const modules = [
  require('./general'),
  require('./ai'),
  require('./music'),
  require('./essentials'),
  require('./sticker'),
  require('./profile'),
  require('./fun'),
  require('./viewonce'),
  require('./group'),
  require('./interaction'),
  require('./admin'),
  require('./owner'),
  require('./tools')
];

const commands = [];
const seen = new Set();

for (const mod of modules.flat(Infinity)) {
  if (!mod || !mod.name) continue;

  const names = [mod.name, ...(mod.aliases || [])]
    .map(name => String(name).toLowerCase());

  if (names.some(name => seen.has(name))) continue;

  names.forEach(name => seen.add(name));
  commands.push(mod);
}

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
    cmd.name.toLowerCase() === lower ||
    (cmd.aliases || []).some(
      alias => alias.toLowerCase() === lower
    )
  );

  if (!command) return false;

  await command.run({
    ...ctx,
    prefix,
    args,
    argText: args.join(' '),
    text: args.join(' '),
    command: lower
  });

  return true;
}

module.exports = {
  run,
  commands
};
