
'use strict';

// ==========================================
// EXO-CYBER WHATSAPP BOT
// HUMAN SYSTEM
// ==========================================
// 1. People memory
// 2. ALWAYS SEND STICKERS
// 3. Manual voice notes ONLY
//
// Normal AI replies = TEXT + STICKER
// .speak <text> = VOICE NOTE
// .voice <text> = VOICE NOTE
// .vn <text> = VOICE NOTE
// ==========================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const log = require('./logger');
const { findMedia, download } = require('./helpers');

// ---------------- SETTINGS ----------------

const VOICE = {
  name: 'en-US-ChristopherNeural',
  rate: 0.92,
  pitch: '-25Hz',
};

const MAX_VOICE_CHARS = 280;
const MAX_FACTS = 12;

// ---------------- STORAGE ----------------

const DATA = process.env.DATA_DIR || __dirname;

const PEOPLE_FILE = path.join(DATA, 'people.json');
const STICKER_DIR = path.join(DATA, 'botstickers');

const loadJson = (file, fallback) => {
  try {
    return fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : fallback;
  } catch {
    return fallback;
  }
};

const people = loadJson(PEOPLE_FILE, {});

let saveTimer = null;

function savePeopleSoon() {
  if (saveTimer) return;

  saveTimer = setTimeout(() => {
    saveTimer = null;

    try {
      fs.mkdirSync(DATA, { recursive: true });
      fs.writeFileSync(
        PEOPLE_FILE,
        JSON.stringify(people, null, 2)
      );
    } catch (e) {
      log.warn('Could not save people.json:', e.message);
    }
  }, 5000);

  if (saveTimer.unref) saveTimer.unref();
}

const pick = (arr) =>
  arr[Math.floor(Math.random() * arr.length)];

const tidy = (s) =>
  String(s || '').trim().replace(/\s+/g, ' ').slice(0, 40);

// ---------------- 1) PEOPLE MEMORY ----------------

function learn(ctx) {
  const num = ctx.senderNum;
  if (!num) return;

  const p = people[num] || (people[num] = {
    firstSeen: Date.now(),
    count: 0,
    facts: [],
  });

  p.lastSeen = Date.now();
  p.count += 1;

  if (ctx.pushName) p.name = ctx.pushName;

  const t = ctx.text || '';
  let m;

  const addFact = (f) => {
    f = tidy(f);

    if (!f || p.facts.includes(f)) return;

    p.facts.push(f);

    if (p.facts.length > MAX_FACTS) {
      p.facts.shift();
    }
  };

  if ((m = /\b(?:my name is|call me)\s+([a-z][a-z' -]{1,20})/i.exec(t))) {
    p.callName = tidy(m[1]);
  }

  if ((m = /\bi(?:'m| am) from ([^.,!?\n]{2,30})/i.exec(t))) {
    addFact(`is from ${m[1]}`);
  }

  if ((m = /\bi live in ([^.,!?\n]{2,30})/i.exec(t))) {
    addFact(`lives in ${m[1]}`);
  }

  if ((m = /\bi (?:really )?(love|like|enjoy|hate) ([^.,!?\n]{2,30})/i.exec(t))) {
    addFact(
      `${m[1].toLowerCase() === 'hate' ? 'hates' : 'likes'} ${m[2]}`
    );
  }

  savePeopleSoon();
}

function personNote(ctx) {
  const p = people[ctx.senderNum];

  if (!p || p.count < 2) return '';

  const name = p.callName || p.name;
  const since = new Date(p.firstSeen).toISOString().slice(0, 10);

  const bits = [
    `you have talked ${p.count} times, first on ${since}`
  ];

  if (name) bits.unshift(`their name is ${name}`);

  if (p.facts.length) {
    bits.push(`things they told you: ${p.facts.join('; ')}`);
  }

  return `\n- You remember this person: ${bits.join('. ')}. Use it naturally, like a friend would. Never recite it like a list.`;
}

// ---------------- 2) VOICE NOTES ----------------

// Automatic voice is permanently disabled.
// Voice notes only happen through .speak, .voice or .vn.

function wantsVoice() {
  return false;
}

function promptNote() {
  return '';
}

function cleanForSpeech(text) {
  return String(text)
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_~\`>#]/g, '')
    .replace(/@\d+/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function synth(text) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

  const tts = new MsEdgeTTS();

  await tts.setMetadata(
    VOICE.name,
    OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS
  );

  const { audioStream } = await tts.toStream(text, {
    rate: VOICE.rate,
    pitch: VOICE.pitch,
  });

  const chunks = [];

  await Promise.race([
    new Promise((resolve, reject) => {
      audioStream.on('data', (c) => chunks.push(c));
      audioStream.on('end', resolve);
      audioStream.on('close', resolve);
      audioStream.on('error', reject);
    }),

    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('voice timed out')), 20000)
    ),
  ]);

  const buf = Buffer.concat(chunks);

  if (!buf.length) {
    throw new Error('voice came back empty');
  }

  return buf;
}

// Convert WEBM to OGG/OPUS for WhatsApp voice notes.

function toOgg(webm) {
  const ffmpeg = require('ffmpeg-static');

  if (!ffmpeg) {
    throw new Error('ffmpeg-static is unavailable');
  }

  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const inp = path.join(os.tmpdir(), `exo_${id}.webm`);
  const out = path.join(os.tmpdir(), `exo_${id}.ogg`);

  fs.writeFileSync(inp, webm);

  return new Promise((resolve, reject) => {
    execFile(
      ffmpeg,
      [
        '-y',
        '-i', inp,
        '-c:a', 'libopus',
        '-b:a', '32k',
        '-ac', '1',
        '-ar', '48000',
        '-f', 'ogg',
        out,
      ],
      (err) => {
        try {
          if (err) throw err;

          resolve(fs.readFileSync(out));
        } catch (e) {
          reject(e);
        } finally {
          fs.unlink(inp, () => {});
          fs.unlink(out, () => {});
        }
      }
    );
  });
}

async function sendVoice(ctx, text) {
  const spoken = cleanForSpeech(text);

  if (spoken.length < 2) {
    throw new Error('nothing to say');
  }

  const ogg = await toOgg(await synth(spoken));

  await ctx.sock.sendMessage(
    ctx.jid,
    {
      audio: ogg,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true,
    },
    { quoted: ctx.msg }
  );
}

// ---------------- 3) STICKERS ----------------

const listStickers = () => {
  try {
    return fs.readdirSync(STICKER_DIR)
      .filter((f) => f.endsWith('.webp'));
  } catch {
    return [];
  }
};

async function sendSticker(ctx) {
  const files = listStickers();

  if (!files.length) return;

  try {
    const buf = fs.readFileSync(
      path.join(STICKER_DIR, pick(files))
    );

    await ctx.sock.sendMessage(
      ctx.jid,
      { sticker: buf },
      { quoted: ctx.msg }
    );
  } catch (e) {
    log.warn('Sticker send failed:', e.message);
  }
}

// ---------------- 4) AI RESPONSE ----------------

// Every normal AI response sends text followed by a sticker.

async function respond(ctx, answer) {
  await ctx.reply(answer);
  await sendSticker(ctx);
}

// ---------------- 5) COMMANDS ----------------

const commands = [
  {
    name: 'speak',
    aliases: ['voice', 'vn'],
    category: 'VOICE TOOLS',
    menu: ['speak <text>', 'voice <text>', 'vn <text>'],

    run: async (ctx) => {
      if (!ctx.argText) {
        return ctx.reply(
          'Give me something to say.\nExample: .vn Hello there'
        );
      }

      try {
        await sendVoice(
          ctx,
          ctx.argText.slice(0, MAX_VOICE_CHARS)
        );
      } catch (e) {
        log.warn('Voice command failed:', e.message);

        return ctx.reply(
          "Couldn't make the voice note right now."
        );
      }
    },
  },

  {
    name: 'addbotsticker',
    category: 'OWNER',
    menu: ['addbotsticker'],
    ownerOnly: true,

    run: async (ctx) => {
      const media = findMedia(ctx.msg, ['sticker']);

      if (!media) {
        return ctx.reply(
          'Reply to a sticker with this command.'
        );
      }

      try {
        const buf = await download(ctx.sock, media.source);

        fs.mkdirSync(STICKER_DIR, { recursive: true });

        fs.writeFileSync(
          path.join(STICKER_DIR, `s_${Date.now()}.webp`),
          buf
        );

        return ctx.reply(
          `Saved. I have ${listStickers().length} sticker(s) now.`
        );
      } catch (e) {
        log.warn('Saving sticker failed:', e.message);
        return ctx.reply("Couldn't save that sticker.");
      }
    },
  },

  {
    name: 'forgetme',
    category: 'GENERAL',
    menu: ['forgetme'],

    run: (ctx) => {
      delete people[ctx.senderNum];
      savePeopleSoon();

      return ctx.reply('Done. Who are you again?');
    },
  },
];

// ---------------- EXPORTS ----------------

for (const [k, v] of Object.entries({
  learn,
  personNote,
  wantsVoice,
  promptNote,
  respond,
})) {
  Object.defineProperty(commands, k, {
    value: v,
    enumerable: false,
  });
}

module.exports = commands;
es them for commands.
for (const [k, v] of Object.entries({ learn, personNote, wantsVoice, promptNote, respond })) {
  Object.defineProperty(commands, k, { value: v, enumerable: false });
}
module.exports = commands;
