'use strict';

// ==========================================
// SAFE PLUGIN LOADER
// ==========================================

const files = [
  './viewonce', // first, so .vv/.cute/.damn win over any old text-only versions
  './general',
  './ai',
  './sticker',
  './music',
  './profile',
  './fun',
  './group'
];

function load(file) {
  try {
    const mod = require(file);
    // supports module.exports = [..], exports.default = [..], or a single command object
    return [mod && mod.default !== undefined ? mod.default : mod]
      .flat(Infinity)
      .filter(cmd => cmd && typeof cmd.name === 'string' && typeof cmd.run === 'function');
  } catch (err) {
    console.error(`[plugins] failed to load ${file}:`, err.message);
    return [];
  }
}

// ==========================================
// COMBINE ALL COMMANDS
// ==========================================

const commands = files.flatMap(load);

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
  const lower = name.toLowerCase();

  const command = commands.find(cmd =>
    cmd.name === lower ||
    cmd.aliases?.includes(lower)
  );

  if (!command) return false;

  try {
    await command.run({
      ...ctx,
      // raw message, so .vv can read the quoted view-once message
      msg: ctx.msg ?? ctx.m ?? ctx.message ?? ctx.info,
      args,
      text: args.join(' '),
      command: lower
    });
  } catch (err) {
    console.error(`[plugins] .${lower} crashed:`, err);
    try { await ctx.reply?.('Something went wrong running that command'); } catch {}
  }

  return true;
}

module.exports = {
  run,
  commands
};