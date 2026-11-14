'use strict';

module.exports = [
  {
    name: 'menu',
    aliases: ['help', 'commands'],
    category: 'GENERAL',
    menu: ['.menu'],
    run: async (ctx) => {
      const commands = ctx.commandList || [];

      if (!commands.length) {
        return ctx.reply('No commands are available.');
      }

      const categories = {};

      for (const cmd of commands) {
        const category = cmd.category || 'OTHER';

        if (!categories[category]) {
          categories[category] = [];
        }

        categories[category].push(cmd);
      }

      let output = `
╭━━━「 EXO-CYBER 」━━━╮
┃
┃  🤖 WhatsApp Assistant
┃  ⚡ Prefix: .
┃  👑 Owner: 2347075369608
┃
╰━━━━━━━━━━━━━━━━━━╯
`;

      for (const [category, list] of Object.entries(categories)) {
        output += `\n╭━━「 ${category} 」\n`;

        for (const cmd of list) {
          output += `┃ • .${cmd.name}\n`;
        }

        output += '╰━━━━━━━━━━━━━━\n';
      }

      output += '\n⚡ Powered by EXO-CYBER';

      await ctx.reply(output);
    }
  }
];
