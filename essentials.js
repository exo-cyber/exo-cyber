// essentials.js - .setprefix  .sticker  .play
// npm i wa-sticker-formatter yt-search yt-dlp-exec ffmpeg-static
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const yts = require('yt-search');
const ytdlp = require('yt-dlp-exec');
const ffmpegPath = require('ffmpeg-static');
const { getPrefix, setPrefix, DEFAULT } = require('./prefix');

process.env.FFMPEG_PATH = ffmpegPath; // wa-sticker-formatter uses this for video stickers

let baileys;
try { baileys = require('@itsliaaa/baileys'); } catch { baileys = require('baileys'); }

const quiet = { info() {}, warn() {}, error() {}, debug() {}, trace() {}, child() { return this; } };

// ---------- helpers ----------
const unwrap = (m) =>
  m?.ephemeralMessage?.message ||
  m?.viewOnceMessage?.message ||
  m?.viewOnceMessageV2?.message ||
  m?.documentWithCaptionMessage?.message ||
  m;

// ADJUST: whatever your handler calls the raw WhatsApp message in ctx
const rawOf = (ctx) => ctx.msg || ctx.m || ctx.message;

function quotedInfo(ctx) {
  const raw = rawOf(ctx);
  const top = unwrap(raw?.message);
  const type = top && Object.keys(top)[0];
  const ci = top?.[type]?.contextInfo;
  return { raw, top, type, ci };
}

// ---------- plugins ----------
module.exports = [
  {
    name: 'setprefix',
    category: 'OWNER',
    menu: '.setprefix',
    async run(ctx) {
      if (!ctx.isOwner && !ctx.isSudo) return ctx.reply('Owner only.');
      const p = ctx.args[0];
      if (!p) return ctx.reply(`Current prefix: ${getPrefix()}\nUse: ${getPrefix()}setprefix !  (or "reset")`);
      if (p.toLowerCase() === 'reset') {
        setPrefix(DEFAULT);
        return ctx.reply(`Prefix reset to ${DEFAULT}`);
      }
      if (p.length > 3 || /[\w\s]/.test(p)) return ctx.reply('Use 1-3 symbols only, e.g. ! # / $');
      setPrefix(p);
      return ctx.reply(`Prefix is now ${p}`);
    },
  },

  {
    name: 'sticker',
    category: 'STICKER',
    menu: '.sticker',
    async run(ctx) {
      const { raw, top, type, ci } = quotedInfo(ctx);
      const ok = ['imageMessage', 'videoMessage'];
      let target = null;

      if (ok.includes(type)) {
        target = raw; // media sent with the command as caption
      } else if (ci?.quotedMessage) {
        const q = unwrap(ci.quotedMessage);
        if (ok.includes(Object.keys(q)[0])) {
          target = {
            key: { remoteJid: ctx.jid, id: ci.stanzaId, participant: ci.participant },
            message: q,
          };
        }
      }
      if (!target) return ctx.reply('Reply to an image/video with .sticker');

      const media = unwrap(target.message);
      const secs = media.videoMessage?.seconds;
      if (secs && secs > 10) return ctx.reply('Video too long. Max 10s.');

      try {
        const buf = await baileys.downloadMediaMessage(target, 'buffer', {}, {
          logger: quiet,
          reuploadRequest: ctx.sock.updateMediaMessage,
        });
        const st = new Sticker(buf, {
          pack: 'EXO-CYBER',
          author: 'exo',
          type: StickerTypes.FULL,
          quality: 50,
        });
        await ctx.sock.sendMessage(ctx.jid, { sticker: await st.toBuffer() }, { quoted: raw });
      } catch (e) {
        console.error('sticker error:', e);
        ctx.reply('Sticker failed: ' + (e.message || e));
      }
    },
  },

  {
    name: 'play',
    category: 'MEDIA',
    menu: '.play',
    async run(ctx) {
      const q = ctx.args.join(' ');
      if (!q) return ctx.reply(`Use: ${getPrefix()}play song name`);

      const base = path.join(os.tmpdir(), `play_${Date.now()}`);
      const file = base + '.mp3';
      try {
        const res = await yts(q);
        const v = res.videos?.[0];
        if (!v) return ctx.reply('Nothing found.');
        if (v.seconds > 600) return ctx.reply('Too long (max 10 min).');

        await ctx.sock.sendMessage(ctx.jid, {
          image: { url: v.thumbnail },
          caption: `${v.title}\n${v.author?.name} | ${v.timestamp}\nDownloading...`,
        }, { quoted: rawOf(ctx) });

        await ytdlp(v.url, {
          extractAudio: true,
          audioFormat: 'mp3',
          audioQuality: 5,
          ffmpegLocation: ffmpegPath,
          output: base + '.%(ext)s',
          noPlaylist: true,
          noWarnings: true,
        });

        await ctx.sock.sendMessage(ctx.jid, {
          audio: fs.readFileSync(file),
          mimetype: 'audio/mpeg',
          fileName: v.title + '.mp3',
        }, { quoted: rawOf(ctx) });
      } catch (e) {
        console.error('play error:', e);
        ctx.reply('Could not get that song. YouTube may be blocking the server.');
      } finally {
        fs.promises.unlink(file).catch(() => {});
      }
    },
  },
];
