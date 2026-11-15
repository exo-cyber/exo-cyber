
'use strict';

// npm i wa-sticker-formatter yt-search yt-dlp-exec ffmpeg-static

const fs = require('fs');
const os = require('os');
const path = require('path');

const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const yts = require('yt-search');
const ytdlp = require('yt-dlp-exec');
const ffmpegPath = require('ffmpeg-static');

const {
  getPrefix,
  setPrefix,
  DEFAULT,
  OPTIONS
} = require('./prefix');

process.env.FFMPEG_PATH = ffmpegPath;

let baileys;
try {
  baileys = require('@itsliaaa/baileys');
} catch {
  baileys = require('baileys');
}

const quiet = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  trace() {},
  child() { return this; }
};

// ---------- HELPERS ----------

const unwrap = (m) =>
  m?.ephemeralMessage?.message ||
  m?.viewOnceMessage?.message ||
  m?.viewOnceMessageV2?.message ||
  m?.documentWithCaptionMessage?.message ||
  m;

const rawOf = (ctx) => ctx.msg || ctx.m || ctx.message;

function quotedInfo(ctx) {
  const raw = rawOf(ctx);
  const top = unwrap(raw?.message);
  const type = top && Object.keys(top)[0];
  const ci = top?.[type]?.contextInfo;

  return { raw, top, type, ci };
}

// ---------- COMMANDS ----------

module.exports = [

  // PREFIX COMMAND
  {
    name: 'prefix',
    aliases: ['setprefix'],
    category: 'OWNER',
    menu: '.prefix',

    async run(ctx) {
      if (!ctx.isOwner && !ctx.isSudo) {
        return ctx.reply('Owner only.');
      }

      const action = (ctx.args?.[0] || '').toLowerCase();
      const value = ctx.args?.[1];

      if (!action) {
        return ctx.reply(
          `EXO-CYBER PREFIX\n\n` +
          `Current: ${getPrefix()}\n\n` +
          `Commands:\n` +
          `${getPrefix()}prefix set !\n` +
          `${getPrefix()}prefix list\n` +
          `${getPrefix()}prefix reset`
        );
      }

      if (action === 'list') {
        return ctx.reply(
          `AVAILABLE PREFIXES\n\n${OPTIONS.join('  ')}`
        );
      }

      if (action === 'reset') {
        if (!setPrefix(DEFAULT)) {
          return ctx.reply('Could not save prefix.');
        }

        return ctx.reply(`Prefix reset to ${DEFAULT}`);
      }

      if (action === 'set') {
        if (!value) {
          return ctx.reply(
            `Example: ${getPrefix()}prefix set !`
          );
        }

        if (!OPTIONS.includes(value)) {
          return ctx.reply(
            `Invalid prefix.\nUse ${getPrefix()}prefix list`
          );
        }

        if (!setPrefix(value)) {
          return ctx.reply('Could not save prefix.');
        }

        return ctx.reply(
          `EXO-CYBER prefix changed to: ${value}`
        );
      }

      return ctx.reply(
        'Use: prefix set, prefix list, or prefix reset.'
      );
    }
  },

  // STICKER COMMAND
  {
    name: 'sticker',
    category: 'STICKER',
    menu: '.sticker',

    async run(ctx) {
      const { raw, type, ci } = quotedInfo(ctx);
      const ok = ['imageMessage', 'videoMessage'];

      let target = null;

      if (ok.includes(type)) {
        target = raw;
      } else if (ci?.quotedMessage) {
        const q = unwrap(ci.quotedMessage);

        if (ok.includes(Object.keys(q)[0])) {
          target = {
            key: {
              remoteJid: ctx.jid,
              id: ci.stanzaId,
              participant: ci.participant
            },
            message: q
          };
        }
      }

      if (!target) {
        return ctx.reply('Reply to an image/video with .sticker');
      }

      const media = unwrap(target.message);
      const secs = media.videoMessage?.seconds;

      if (secs && secs > 10) {
        return ctx.reply('Video too long. Max 10s.');
      }

      try {
        const buf = await baileys.downloadMediaMessage(
          target,
          'buffer',
          {},
          {
            logger: quiet,
            reuploadRequest: ctx.sock.updateMediaMessage
          }
        );

        const st = new Sticker(buf, {
          pack: 'EXO-CYBER',
          author: 'exo',
          type: StickerTypes.FULL,
          quality: 50
        });

        await ctx.sock.sendMessage(
          ctx.jid,
          { sticker: await st.toBuffer() },
          { quoted: raw }
        );

      } catch (e) {
        console.error('sticker error:', e);
        ctx.reply('Sticker failed: ' + (e.message || e));
      }
    }
  },

  // PLAY COMMAND
  {
    name: 'play',
    category: 'MEDIA',
    menu: '.play',

    async run(ctx) {
      const q = ctx.argText || ctx.args?.join(' ') || '';

      if (!q.trim()) {
        return ctx.reply(`Use: ${getPrefix()}play song name`);
      }

      const base = path.join(
        os.tmpdir(),
        `play_${Date.now()}`
      );

      const file = base + '.mp3';

      try {
        const res = await yts(q);
        const v = res.videos?.[0];

        if (!v) {
          return ctx.reply('Nothing found.');
        }

        if (v.seconds > 600) {
          return ctx.reply('Too long (max 10 min).');
        }

        await ctx.sock.sendMessage(
          ctx.jid,
          {
            image: { url: v.thumbnail },
            caption:
              `${v.title}\n` +
              `${v.author?.name} | ${v.timestamp}\n` +
              `Downloading...`
          },
          { quoted: rawOf(ctx) }
        );

        await ytdlp(v.url, {
          extractAudio: true,
          audioFormat: 'mp3',
          audioQuality: 5,
          ffmpegLocation: ffmpegPath,
          output: base + '.%(ext)s',
          noPlaylist: true,
          noWarnings: true
        });

        if (!fs.existsSync(file)) {
          throw new Error('Downloaded audio file not found.');
        }

        await ctx.sock.sendMessage(
          ctx.jid,
          {
            audio: fs.readFileSync(file),
            mimetype: 'audio/mpeg',
            fileName: v.title + '.mp3'
          },
          { quoted: rawOf(ctx) }
        );

      } catch (e) {
        console.error('play error:', e);
        ctx.reply(
          'Could not get that song. YouTube may be blocking the server.'
        );
      } finally {
        fs.promises.unlink(file).catch(() => {});
      }
    }
  }

];
