'use strict';

// ==========================================
// EXO-CYBER - INTERACTION COMMANDS (GIF)
// Needs: npm i ffmpeg-static  (or ffmpeg installed on the server)
// ==========================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { numberOf } = require('./jid');

const execFileAsync = promisify(execFile);

let ffmpegPath = 'ffmpeg';
try {
  ffmpegPath = require('ffmpeg-static') || 'ffmpeg';
} catch {
  // falls back to a system-installed ffmpeg
}

const MAX_GIF_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 10000;

// Shown as a quote-style line under every GIF caption. Change or empty it.
const FOOTER = '🩸 I\'LL ONLY RETURN THE PAIN. WITH EXO-CYBER\'S POWER.';

const pick = (items) =>
  items[Math.floor(Math.random() * items.length)];

// ==========================================
// ACTIONS
// nekos / waifu = endpoint name on each GIF API
// verb = used when someone is targeted, solo = used when nobody is
// ==========================================

const actions = {
  hug:    { nekos: 'hug',    waifu: 'hug',    emoji: '🤗', verb: 'hugs',                      solo: 'hugs everyone' },
  wave:   { nekos: 'wave',   waifu: 'wave',   emoji: '👋', verb: 'waves at',                  solo: 'waves hello' },
  cuddle: { nekos: 'cuddle', waifu: 'cuddle', emoji: '🧸', verb: 'cuddles',                   solo: 'cuddles everyone' },
  wink:   { nekos: 'wink',   waifu: 'wink',   emoji: '😉', verb: 'winks at',                  solo: 'sends a wink' },
  pat:    { nekos: 'pat',    waifu: 'pat',    emoji: '😊', verb: 'pats',                      solo: 'gives everyone a pat' },
  dance:  { nekos: 'dance',  waifu: 'dance',  emoji: '💃', verb: 'dances with',               solo: 'is dancing' },
  sad:    { nekos: 'cry',    waifu: 'cry',    emoji: '🥺', verb: 'cries on the shoulder of',  solo: 'is feeling sad' },
  smile:  { nekos: 'smile',  waifu: 'smile',  emoji: '😁', verb: 'smiles at',                 solo: 'is smiling' },
  laugh:  { nekos: 'laugh',  waifu: 'happy',  emoji: '😂', verb: 'laughs at',                 solo: 'is laughing out loud' },
  tickle: { nekos: 'tickle', waifu: 'poke',   emoji: '🤣', verb: 'tickles',                   solo: 'starts a tickle battle' },
  shrug:  { nekos: 'shrug',  waifu: null,     emoji: '🤷', verb: 'shrugs at',                 solo: 'shrugs' },
  simp:   { nekos: 'blush',  waifu: 'blush',  emoji: '🌹', verb: 'is simping for',            solo: 'is simping hard' },
  kill:   { nekos: 'shoot',  waifu: 'kill',  emoji: '🔪', verb: 'takes out',                 solo: 'is in a murderous mood' },
  slap:   { nekos: 'slap',   waifu: 'slap',   emoji: '✋', verb: 'slaps',                     solo: 'is ready to slap somebody' },
  punch:  { nekos: 'punch',  waifu: null,     emoji: '👊', verb: 'punches',                   solo: 'is swinging at the air' },
  kick:   { nekos: 'kick',   waifu: 'kick',   emoji: '🦵', verb: 'kicks',                     solo: 'is warming up for a kick' },
  bite:   { nekos: 'bite',   waifu: 'bite',   emoji: '😬', verb: 'bites',                     solo: 'is feeling bitey' },
  poke:   { nekos: 'poke',   waifu: 'poke',   emoji: '👉', verb: 'pokes',                     solo: 'pokes everyone' },
  bonk:   { nekos: null,     waifu: 'bonk',   emoji: '🔨', verb: 'bonks',                     solo: 'bonks the whole group' }
};

// ==========================================
// HELPERS
// ==========================================

function getTargetJid(ctx) {
  if (ctx.mentioned?.length) return ctx.mentioned[0];
  if (ctx.ctxInfo?.participant) return ctx.ctxInfo.participant;

  const number = (ctx.args?.[0] || '').replace(/\D/g, '');
  return number.length >= 7 ? `${number}@s.whatsapp.net` : null;
}

function getSenderJid(ctx) {
  if (ctx.sender) return ctx.sender;
  if (ctx.senderNum) return `${ctx.senderNum}@s.whatsapp.net`;
  return null;
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function findGifUrl(action) {
  if (action.nekos) {
    try {
      const data = await fetchJson(`https://nekos.best/api/v2/${action.nekos}`);
      const url = data?.results?.[0]?.url;
      if (url) return url;
    } catch {
      // try the next source
    }
  }

  if (action.waifu) {
    try {
      const data = await fetchJson(`https://api.waifu.pics/sfw/${action.waifu}`);
      if (data?.url) return data.url;
    } catch {
      // no more sources
    }
  }

  return null;
}

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_GIF_BYTES) throw new Error('GIF too large');

  return buffer;
}

// WhatsApp plays "GIFs" as short looping MP4 videos, so convert first
async function gifToMp4(gifBuffer) {
  const id = crypto.randomUUID();
  const input = path.join(os.tmpdir(), `${id}.gif`);
  const output = path.join(os.tmpdir(), `${id}.mp4`);

  try {
    await fs.promises.writeFile(input, gifBuffer);

    await execFileAsync(
      ffmpegPath,
      [
        '-y',
        '-i', input,
        '-movflags', 'faststart',
        '-pix_fmt', 'yuv420p',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-an',
        output
      ],
      { timeout: 30000 }
    );

    return await fs.promises.readFile(output);
  } finally {
    await Promise.allSettled([
      fs.promises.unlink(input),
      fs.promises.unlink(output)
    ]);
  }
}

// ==========================================
// BUILD COMMANDS
// ==========================================

const commands = Object.entries(actions).map(([name, action]) => ({
  name,
  category: 'INTERACTION',
  menu: [`.${name}`],

  run: async (ctx) => {
    const targetJid = getTargetJid(ctx);
    const senderJid = getSenderJid(ctx);

    const senderTag = senderJid ? `@${numberOf(senderJid)}` : 'Someone';
    const mentions = [senderJid, targetJid].filter(Boolean);

    const line = targetJid
      ? `${senderTag} ${action.verb} @${numberOf(targetJid)} ${action.emoji}`
      : `${senderTag} ${action.solo} ${action.emoji}`;

    // "> " makes WhatsApp draw the footer as a quote block
    const caption = FOOTER ? `${line}\n\n> ${FOOTER}` : line;

    try {
      const gifUrl = await findGifUrl(action);
      if (!gifUrl) throw new Error('No GIF found');

      const gif = await download(gifUrl);
      const video = await gifToMp4(gif);

      // Reply to the person's command message when the raw message is available
      const quoted = ctx.msg || ctx.message || ctx.m || null;

      await ctx.sock.sendMessage(
        ctx.jid,
        {
          video,
          gifPlayback: true,
          mimetype: 'video/mp4',
          caption,
          mentions
        },
        quoted ? { quoted } : {}
      );
    } catch (error) {
      // GIF failed (API down, no ffmpeg, etc.), so send the text version
      await ctx.reply(caption, { mentions });
    }
  }
}));

// ==========================================
// FLIRT COMMAND
// ==========================================

commands.push({
  name: 'flirt',
  aliases: ['rizz'],
  category: 'FUN',
  menu: ['.flirt'],

  run: async (ctx) => {
    const targetJid = getTargetJid(ctx);

    const lines = [
      'Are you Wi-Fi? Because I\'m feeling a strong connection 📶',
      'Not to be dramatic, but you\'re my favorite notification 🔔',
      'Are you a charger? My battery goes up every time you show up 🔋',
      'You\'re not a 10, you\'re a "no notes" 😮‍💨',
      'Is your name Google? You have everything I\'ve been searching for 🔍',
      'No cap, you\'re the best part of this group 💯',
      'Your aura is maxed out and I\'m not even mad about it ✨',
      'You\'re giving main character, and I\'d like a role in your story 🎬',
      'You\'re the reason my screen time keeps going up 📱',
      'Rizz level: you don\'t even need it, you already got me 😏',
      'Certified W. Everyone else is just an L next to you 🏆',
      'The group chat goes quiet whenever you walk in, and I get it 👀',
      'Be honest, did you download extra drip? Because it\'s showing 🔥',
      'You\'re like my last 1% battery. I\'d drop everything for you 🪫'
    ];

    const label = targetJid ? `@${numberOf(targetJid)}` : 'everyone';

    await ctx.reply(
      `💌 EXO-CYBER RIZZ MACHINE\n\nHey ${label}!\n${pick(lines)}`,
      { mentions: targetJid ? [targetJid] : [] }
    );
  }
});

module.exports = commands;
