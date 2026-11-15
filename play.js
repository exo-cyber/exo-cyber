const { reply } = require('../lib/helpers');

const MAX_SECONDS = 10 * 60;          // refuse tracks longer than 10 minutes
const MAX_BYTES = 30 * 1024 * 1024;   // refuse downloads larger than 30 MB

module.exports = {
  name: 'play',
  alias: ['song', 'music'],
  category: 'MEDIA',

  async run({ sock, msg, text }) {
    const query = (text || '').trim();
    if (!query) {
      return reply(sock, msg, 'Tell me what to look for.\nExample: .play artist - song');
    }

    const yts = require('yt-search');
    const ytdl = require('@distube/ytdl-core');
    const jid = msg.key.remoteJid;

    try {
      // 1. Search
      const result = await yts(query);
      const v = result.videos && result.videos[0];
      if (!v) return reply(sock, msg, `Nothing found for "${query}".`);

      if (v.seconds > MAX_SECONDS) {
        return reply(
          sock,
          msg,
          `"${v.title}" is ${v.timestamp} long. Max allowed is ${MAX_SECONDS / 60} minutes.`
        );
      }

      // 2. Show what was found
      await sock.sendMessage(
        jid,
        {
          image: { url: v.thumbnail },
          caption: `🎵 ${v.title}\n👤 ${v.author.name}\n⏱ ${v.timestamp}\n\nDownloading...`,
        },
        { quoted: msg }
      );

      // 3. Pick an m4a audio format (plays natively on WhatsApp)
      const info = await ytdl.getInfo(v.url);
      let format = info.formats.find(
        (f) => f.hasAudio && !f.hasVideo && f.container === 'mp4'
      );
      if (!format) {
        format = ytdl.chooseFormat(info.formats, {
          quality: 'highestaudio',
          filter: 'audioonly',
        });
      }

      // 4. Download into memory with a size cap
      const chunks = [];
      let size = 0;
      const stream = ytdl.downloadFromInfo(info, {
        format,
        highWaterMark: 1 << 25,
      });

      await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            stream.destroy();
            return reject(new Error('File too large'));
          }
          chunks.push(chunk);
        });
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      const buffer = Buffer.concat(chunks);

      // 5. Send the audio
      const safeName = v.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 80);
      await sock.sendMessage(
        jid,
        {
          audio: buffer,
          mimetype: 'audio/mp4',
          fileName: `${safeName}.m4a`,
          ptt: false,
        },
        { quoted: msg }
      );
    } catch (err) {
      console.error('[play] error:', err);
      const reason =
        err.message === 'File too large'
          ? 'That file is too large to send.'
          : 'Could not download that track. Try a different search.';
      await reply(sock, msg, reason);
    }
  },
};
