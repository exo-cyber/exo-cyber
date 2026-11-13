const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const box = (title, lines) =>
  `╭━━━「 ${title} 」\n┃\n` +
  [].concat(lines).map((l) => `┃ ${l}`).join('\n') +
  `\n┃\n╰━━━━━━━━━━━━`;

// Works with: .cmd text  OR  replying to a message
const getArgs = (ctx) => {
  if (Array.isArray(ctx.args)) return ctx.args.join(' ').trim();
  if (typeof ctx.text === 'string') return ctx.text.trim();
  return '';
};

module.exports = [
  {
    name: 'flip',
    category: 'FUN',
    menu: ['flip'],
    run: async (ctx) => {
      const side = Math.random() < 0.5 ? 'HEADS 🪙' : 'TAILS 🪙';
      await ctx.reply(box('EXO COIN', [`You got: ${side}`]));
    }
  },

  {
    name: 'dice',
    category: 'FUN',
    menu: ['dice'],
    run: async (ctx) => {
      const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
      const n = rand(1, 6);
      await ctx.reply(box('EXO DICE', [`🎲 Rolled: ${n} ${faces[n - 1]}`]));
    }
  },

  {
    name: '8ball',
    category: 'FUN',
    menu: ['8ball'],
    run: async (ctx) => {
      const q = getArgs(ctx);
      if (!q) return ctx.reply(box('EXO 8BALL', ['Ask me something first 🎱', 'Example: .8ball will I be rich?']));
      const answers = [
        'Yes, definitely ✅',
        'Without a doubt 💯',
        'Most likely 👍',
        'Ask again later 🤔',
        'Cannot predict now 🌫️',
        "Don't count on it 😬",
        'My sources say no ❌',
        'Very doubtful 💀'
      ];
      await ctx.reply(box('EXO 8BALL', [`❓ ${q}`, `🎱 ${pick(answers)}`]));
    }
  },

  {
    name: 'roast',
    category: 'FUN',
    menu: ['roast'],
    run: async (ctx) => {
      const roasts = [
        "You're the reason shampoo has instructions 🧴",
        'You bring everyone so much joy... when you leave 😂',
        "Your WiFi has better connection than your brain 📶",
        "You're proof that even autocorrect gives up 🤣",
        'If laziness was a sport, you would send a friend to compete 🛋️',
        "You're like a cloud: when you disappear, it's a beautiful day ☀️"
      ];
      await ctx.reply(box('EXO ROAST', [pick(roasts), '', '(just kidding... maybe 😏)']));
    }
  },

  {
    name: 'compliment',
    category: 'FUN',
    menu: ['compliment'],
    run: async (ctx) => {
      const nice = [
        'You light up every chat you join ✨',
        'Your vibe is unmatched 😎',
        "You're smarter than you give yourself credit for 🧠",
        'The world needs more people like you 💛',
        "You're built different (in a good way) 🔥"
      ];
      await ctx.reply(box('EXO COMPLIMENT', [pick(nice)]));
    }
  },

  {
    name: 'ship',
    category: 'FUN',
    menu: ['ship'],
    run: async (ctx) => {
      const args = getArgs(ctx);
      const names = args.split(/\s*(?:\+|&|and|x)\s*|\s+/i).filter(Boolean);
      if (names.length < 2) {
        return ctx.reply(box('EXO SHIP', ['Give me two names 💘', 'Example: .ship Alex + Sam']));
      }
      const [a, b] = names;
      const pct = rand(1, 100);
      const filled = Math.round(pct / 10);
      const bar = '❤️'.repeat(filled) + '🖤'.repeat(10 - filled);
      const verdict =
        pct > 85 ? 'Soulmates 💍' :
        pct > 60 ? 'Strong spark 🔥' :
        pct > 35 ? 'Could work 🤔' : 'Just friends 😅';
      await ctx.reply(box('EXO SHIP', [`${a} 💞 ${b}`, bar, `Match: ${pct}%`, verdict]));
    }
  },

  {
    name: 'rate',
    category: 'FUN',
    menu: ['rate'],
    run: async (ctx) => {
      const thing = getArgs(ctx) || 'you';
      await ctx.reply(box('EXO RATE', [`📊 ${thing}`, `Score: ${rand(0, 100)}/100`]));
    }
  },

  {
    name: 'iq',
    category: 'FUN',
    menu: ['iq'],
    run: async (ctx) => {
      const iq = rand(40, 200);
      const note =
        iq > 160 ? 'Certified genius 🧠⚡' :
        iq > 120 ? 'Big brain energy 😎' :
        iq > 90 ? 'Perfectly average 👌' : 'Loading... please wait ⏳';
      await ctx.reply(box('EXO IQ TEST', [`Your IQ: ${iq}`, note, '', '(100% scientifically fake)']));
    }
  },

  {
    name: 'fact',
    category: 'FUN',
    menu: ['fact'],
    run: async (ctx) => {
      const facts = [
        'Honey never spoils. Edible honey was found in ancient Egyptian tombs 🍯',
        'Octopuses have three hearts 🐙',
        'Bananas are berries, but strawberries are not 🍌',
        'A day on Venus is longer than its year 🪐',
        'Sharks existed before trees 🦈'
      ];
      await ctx.reply(box('EXO FACTS', [pick(facts)]));
    }
  },

  {
    name: 'truth',
    category: 'FUN',
    menu: ['truth'],
    run: async (ctx) => {
      const q = [
        "What's the most embarrassing thing in your gallery? 📸",
        'Who was your last Google search about? 🔍',
        "What's a lie you told that got out of hand? 🤥",
        'What app do you waste the most time on? 📱',
        'Who in this chat would you trust with your phone? 🤝'
      ];
      await ctx.reply(box('EXO TRUTH', [pick(q)]));
    }
  },

  {
    name: 'dare',
    category: 'FUN',
    menu: ['dare'],
    run: async (ctx) => {
      const d = [
        'Send a voice note singing your favorite song 🎤',
        'Change your status to "I love potatoes" for 1 hour 🥔',
        'Text your last contact only emojis 😂',
        'Send the 5th photo in your gallery (no cheating) 📷',
        'Speak in rhymes for the next 10 minutes 🎭'
      ];
      await ctx.reply(box('EXO DARE', [pick(d)]));
    }
  },

  {
    name: 'emojify',
    category: 'FUN',
    menu: ['emojify'],
    run: async (ctx) => {
      const text = getArgs(ctx);
      if (!text) return ctx.reply(box('EXO EMOJIFY', ['Give me some text 😎', 'Example: .emojify hello world']));
      const out = [...text.toLowerCase()]
        .map((c) =>
          /[a-z]/.test(c)
            ? String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 97)
            : c === ' ' ? '   ' : c
        )
        .join(' ');
      await ctx.reply(box('EXO EMOJIFY', [out]));
    }
  },

  {
    name: 'mock',
    category: 'FUN',
    menu: ['mock'],
    run: async (ctx) => {
      const text = getArgs(ctx);
      if (!text) return ctx.reply(box('EXO MOCK', ['Give me some text 🧽']));
      const out = text
        .split('')
        .map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase()))
        .join('');
      await ctx.reply(box('EXO MOCK', [out]));
    }
  },

  {
    name: 'reverse',
    category: 'FUN',
    menu: ['reverse'],
    run: async (ctx) => {
      const text = getArgs(ctx);
      if (!text) return ctx.reply(box('EXO REVERSE', ['Give me some text 🔄']));
      await ctx.reply(box('EXO REVERSE', [[...text].reverse().join('')]));
    }
  },

  {
    name: 'slot',
    category: 'FUN',
    menu: ['slot'],
    run: async (ctx) => {
      const icons = ['🍒', '🍋', '🍇', '🔔', '💎', '7️⃣'];
      const r = [pick(icons), pick(icons), pick(icons)];
      const win = r[0] === r[1] && r[1] === r[2];
      const two = !win && (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]);
      await ctx.reply(
        box('EXO SLOTS', [
          `[ ${r.join(' | ')} ]`,
          win ? '🎉 JACKPOT!!! 🎉' : two ? 'So close! 😮' : 'You lose 💀 Try again!'
        ])
      );
    }
  },

  {
    name: 'rps',
    category: 'FUN',
    menu: ['rps'],
    run: async (ctx) => {
      const choices = { rock: '🪨', paper: '📄', scissors: '✂️' };
      const user = getArgs(ctx).toLowerCase();
      if (!choices[user]) {
        return ctx.reply(box('EXO RPS', ['Pick one: rock, paper or scissors', 'Example: .rps rock']));
      }
      const bot = pick(Object.keys(choices));
      const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      const result =
        user === bot ? "It's a tie 🤝" :
        beats[user] === bot ? 'You win 🎉' : 'I win 😎';
      await ctx.reply(
        box('EXO RPS', [`You: ${choices[user]} ${user}`, `Me: ${choices[bot]} ${bot}`, result])
      );
    }
  }
];
  {
    name: 'joke',
    category: 'FUN',
    menu: ['joke'],
    run: async (ctx) => {
      const jokes = [
        "Why did the computer go to the doctor? Because it had a virus! 😂",
        "Why was the math book sad? Because it had too many problems! 🤣",
        "Why don't skeletons fight? They don't have the guts! 💀",
        "Why did the phone wear glasses? It lost its contacts! 😂",
        "What do you call a sleeping bull? A bulldozer! 🤣"
      ];

      const joke = pick(jokes);
      await ctx.reply(box('EXO JOKES', [joke]));
    }
  }
];