// human.js — makes EXO-CYBER act more like a real person
//   1) Voice notes: AI replies are sometimes spoken in a calm, deep voice
//   2) Stickers: she sometimes drops a sticker after a reply
//   3) People memory: she remembers names and little facts about each person
//
// Needs:  npm i msedge-tts      (ffmpeg-static is already in your bot)
// Set DATA_DIR to a Railway volume path, or saved people/stickers reset on redeploy.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const log = require('./logger');
const { findMedia, download } = require('./helpers');

// ---------------- settings you can change ----------------
const VOICE = {
  name: 'en-US-ChristopherNeural', // calm male voice. Other options: 'en-US-GuyNeural', 'en-GB-RyanNeural'
                                   // (for a deeper female voice try 'en-US-AriaNeural' with pitch '-30Hz')
  rate: 0.92,                      // 1 = normal speed, lower = slower and calmer
  pitch: '-25Hz',                  // lower = deeper
};
const VOICE_CHANCE = 0.35;   // in "auto" mode: how often a reply is sent as a voice note
const MAX_VOICE_CHARS = 280; // longer replies are always sent as text
const STICKER_CHANCE = 0.15; // how often a sticker follows a reply
const MAX_FACTS = 12;        // facts remembered per person

// ---------------- storage ----------------
const DATA = process.env.DATA_DIR || __dirname;
const PEOPLE_FILE = path.join(DATA, 'people.json');
const VOICE_FILE = path.join(DATA, 'voicemodes.json');
const STICKER_DIR = path.join(DATA, 'botstickers');

const loadJson = (file, fallback) => {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; } catch { return fallback; }
};
const people = loadJson(PEOPLE_FILE, {});
const voiceModes = loadJson(VOICE_FILE, {}); // chatId -> 'on' | 'off' | 'auto'

let saveTimer = null;
function savePeopleSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { fs.writeFileSync(PEOPLE_FILE, JSON.stringify(people, null, 2)); } catch (e) { log.warn('Could not save people.json:', e.message); }
  }, 5000);
  if (saveTimer.unref) saveTimer.unref();
}
const saveVoiceModes = () => { try { fs.writeFileSync(VOICE_FILE, JSON.stringify(voiceModes, null, 2)); } catch {} };

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const tidy = (s) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 40);

// ---------------- 1) people memory ----------------
// Call this only when someone is actually talking to her (DM, or addressed in a group).
function learn(ctx) {
  const num = ctx.senderNum;
  if (!num) return;
  const p = people[num] || (people[num] = { firstSeen: Date.now(), count: 0, facts: [] });
  p.lastSeen = Date.now();
  p.count += 1;
  if (ctx.pushName) p.name = ctx.pushName;

  const t = ctx.text || '';
  let m;
  const addFact = (f) => {
    f = tidy(f);
    if (!f || p.facts.includes(f)) return;
    p.facts.push(f);
    if (p.facts.length > MAX_FACTS) p.facts.shift();
  };
  if ((m = /\b(?:my name is|call me)\s+([a-z][a-z' -]{1,20})/i.exec(t))) p.callName = tidy(m[1]);
  if ((m = /\bi(?:'m| am) from ([^.,!?\n]{2,30})/i.exec(t))) addFact(`is from ${m[1]}`);
  if ((m = /\bi live in ([^.,!?\n]{2,30})/i.exec(t))) addFact(`lives in ${m[1]}`);
  if ((m = /\bi (?:really )?(love|like|enjoy|hate) ([^.,!?\n]{2,30})/i.exec(t))) {
    addFact(`${m[1].toLowerCase() === 'hate' ? 'hates' : 'likes'} ${m[2]}`);
  }
  savePeopleSoon();
}

// Text added to her instructions so she talks to people like she knows them.
function personNote(ctx) {
  const p = people[ctx.senderNum];
  if (!p || p.count < 2) return '';
  const name = p.callName || p.name;
  const since = new Date(p.firstSeen).toISOString().slice(0, 10);
  const bits = [`you have talked ${p.count} times, first on ${since}`];
  if (name) bits.unshift(`their name is ${name}`);
  if (p.facts.length) bits.push(`things they told you: ${p.facts.join('; ')}`);
  return `\n- You remember this person: ${bits.join('. ')}. Use it naturally, like a friend would. Never recite it like a list.`;
}

// ---------------- 2) voice notes ----------------
function wantsVoice(ctx) {
  const mode = voiceModes[ctx.jid] || 'auto';
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  return Math.random() < VOICE_CHANCE;
}

function promptNote(asVoice) {
  return asVoice
    ? '\n- This reply will be SPOKEN aloud as a voice note. Keep it to one or two short sentences. Calm, low, unhurried. No emojis, no markdown, no links.'
    : '';
}

function cleanForSpeech(text) {
  return String(text)
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_~`>#]/g, '')
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
  await tts.setMetadata(VOICE.name, OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS);
  const { audioStream } = await tts.toStream(text, { rate: VOICE.rate, pitch: VOICE.pitch });
  const chunks = [];
  await Promise.race([
    new Promise((resolve, reject) => {
      audioStream.on('data', (c) => chunks.push(c));
      audioStream.on('end', resolve);
      audioStream.on('close', resolve);
      audioStream.on('error', reject);
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('voice timed out')), 20000)),
  ]);
  const buf = Buffer.concat(chunks);
  if (!buf.length) throw new Error('voice came back empty');
  return buf;
}

// WhatsApp voice notes are ogg/opus
function toOgg(webm) {
  const ffmpeg = require('ffmpeg-static');
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inp = path.join(os.tmpdir(), `exo_${id}.webm`);
  const out = path.join(os.tmpdir(), `exo_${id}.ogg`);
  fs.writeFileSync(inp, webm);
  return new Promise((resolve, reject) => {
    execFile(ffmpeg, ['-y', '-i', inp, '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-ar', '48000', '-f', 'ogg', out], (err) => {
      try {
        if (err) throw err;
        resolve(fs.readFileSync(out));
      } catch (e) {
        reject(e);
      } finally {
        fs.unlink(inp, () => {});
        fs.unlink(out, () => {});
      }
    });
  });
}

async function sendVoice(ctx, text) {
  const spoken = cleanForSpeech(text);
  if (spoken.length < 2) throw new Error('nothing to say');
  const ogg = await toOgg(await synth(spoken));
  await ctx.sock.sendMessage(ctx.jid, { audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: ctx.msg });
}

// ---------------- 3) stickers ----------------
const listStickers = () => {
  try { return fs.readdirSync(STICKER_DIR).filter((f) => f.endsWith('.webp')); } catch { return []; }
};

async function sendSticker(ctx) {
  const files = listStickers();
  if (!files.length) return;
  try {
    const buf = fs.readFileSync(path.join(STICKER_DIR, pick(files)));
    await ctx.sock.sendMessage(ctx.jid, { sticker: buf }, { quoted: ctx.msg });
  } catch { /* a bad sticker file must never break a reply */ }
}

// ---------------- the one function the handler calls to answer ----------------
async function respond(ctx, answer, asVoice) {
  let sentVoice = false;
  if (asVoice && answer.length <= MAX_VOICE_CHARS) {
    try {
      await sendVoice(ctx, answer);
      sentVoice = true;
    } catch (e) {
      log.warn('Voice reply failed, sending text instead:', e.message);
    }
  }
  if (!sentVoice) await ctx.reply(answer);
  if (Math.random() < STICKER_CHANCE) await sendSticker(ctx);
}

// ---------------- commands ----------------
const commands = [
  {
    // .voice on = always voice, .voice off = never, .voice auto = sometimes (default)
    name: 'voice', category: 'OWNER', menu: ['voice <on|off|auto>'], ownerOnly: true,
    run: (ctx) => {
      const arg = (ctx.args[0] || '').toLowerCase();
      if (!['on', 'off', 'auto'].includes(arg)) {
        return ctx.reply(`Voice mode here: ${voiceModes[ctx.jid] || 'auto'}\nUse: ${'.'}voice on / off / auto`);
      }
      voiceModes[ctx.jid] = arg;
      saveVoiceModes();
      return ctx.reply(arg === 'on' ? 'Voice notes on. Every AI reply here will be spoken.'
        : arg === 'off' ? 'Voice notes off. Text only.'
        : 'Auto. I\'ll talk now and then.');
    },
  },
  {
    // .speak hello there  -> she says it as a voice note (good for testing the voice)
    name: 'speak', category: 'OWNER', menu: ['speak <text>'], ownerOnly: true,
    run: async (ctx) => {
      if (!ctx.argText) return ctx.reply('Give me something to say.');
      try {
        await sendVoice(ctx, ctx.argText.slice(0, MAX_VOICE_CHARS));
      } catch (e) {
        log.warn('.speak failed:', e.message);
        return ctx.reply("Couldn't make the voice note right now.");
      }
    },
  },
  {
    // Reply to a sticker with this to add it to her random sticker pool
    name: 'addbotsticker', category: 'OWNER', menu: ['addbotsticker'], ownerOnly: true,
    run: async (ctx) => {
      const media = findMedia(ctx.msg, ['sticker']);
      if (!media) return ctx.reply('Reply to a sticker with this command.');
      const buf = await download(ctx.sock, media.source);
      fs.mkdirSync(STICKER_DIR, { recursive: true });
      fs.writeFileSync(path.join(STICKER_DIR, `s_${Date.now()}.webp`), buf);
      return ctx.reply(`Saved. I have ${listStickers().length} sticker(s) now.`);
    },
  },
  {
    // Anyone can make her forget what she knows about them
    name: 'forgetme', category: 'GENERAL', menu: ['forgetme'],
    run: (ctx) => {
      delete people[ctx.senderNum];
      savePeopleSoon();
      return ctx.reply('Done. Who are you again?');
    },
  },
];

// Export the command array (what index.js expects) and attach the helpers as
// non-enumerable properties so the loader never mistakes them for commands.
for (const [k, v] of Object.entries({ learn, personNote, wantsVoice, promptNote, respond })) {
  Object.defineProperty(commands, k, { value: v, enumerable: false });
}
module.exports = commands;
