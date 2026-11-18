// Decides what to do with each incoming message:
// learn ids -> MR NICK protection (fast) -> AFK -> commands -> AI chat (if Exo-Cyber is addressed)
const config = require('./config');
const log = require('./logger');
const { numberOf } = require('./jid');
const { fmtDuration } = require('./time');
const { isDuplicate } = require('./dedupe');
const { unwrap, getText, getContext } = require('./helpers');
const commands = require('./index');
const nick = require('./nick');
const settings = require('./settings');
const memory = require('./memory');
const fallback = require('./fallback');
const { systemPrompt, offlineReply, nameCallReply, cleanReply, isBoilerplate, isDistress, provocation, isHumanQuestion, identityReply, isVendorClaim } = require('./personality');
const clapbacks = require('./clapbacks');
const chatlog = require('./chatlog');
const { enforceAntiLink } = require('./groupTools');
const extras = require('./extras');
const friends = require('./friends'); // if friends.js lives in plugins/, use './plugins/friends'
const human = require('./human');     // voice notes, stickers and people memory
const autoclaim = require('./autoclaim'); // NEW (or './plugins/autoclaim')

// Current bot mode ('public' or 'private'). Read fresh on every message so .mode takes effect at once.
function currentMode() {
  try {
    const raw = typeof settings.getMode === 'function' ? settings.getMode() : settings.mode;
    return String(raw || 'public').toLowerCase();
  } catch {
    return 'public';
  }
}

// How much Exo-Cyber tolerates this person (see affinity.js). Added to her instructions.
function bondNote(num, isOwner, isFriend) {
  if (isOwner) return '';
  if (isFriend) return '\n- This person is on your friends list. You are warm, playful and loyal with them. Still you, just friendlier.';
  const { level } = extras.getAffinity(num);
  if (level === 'stranger' || level === 'tolerated') return `\n- Your bond with this person: ${level}. Do not warm up to them.`;
  return `\n- Your bond with this person: ${level}. You are a little less sharp with them than with strangers, but still you.`;
}

const lastAiAt = new Map();
const afkNoticeAt = new Map();

// Owner phrases that put Exo-Cyber to sleep / wake her up in the current chat.
const SLEEP_RE = /^\s*(?:(?:hey\s+)?exo(?:[\s-]?cyber)?[\s,]+(?:go\s+(?:to\s+)?)?sleep(?:\s+now)?|sleep\s+(?:now\s+)?exo(?:[\s-]?cyber)?|go\s+(?:to\s+)?sleep\s+exo(?:[\s-]?cyber)?)\s*[.!]*\s*$/i;
const WAKE_RE = /^\s*(?:(?:hey\s+)?exo(?:[\s-]?cyber)?[\s,]+wake(?:\s+up)?|wake\s+up\s+exo(?:[\s-]?cyber)?|wake\s+exo(?:[\s-]?cyber)?(?:\s+up)?)\s*[.!]*\s*$/i;

// Ids of messages Exo-Cyber herself sent. A reply to one of these is a reply to Exo-Cyber,
// whatever id (phone number or hidden LID) WhatsApp shows for her.
const sentIds = new Map();
const extraBotIds = new Set(); // her other ids, learned from those replies
const wrapped = new WeakSet();
function trackSent(sock) {
  if (wrapped.has(sock)) return;
  wrapped.add(sock);
  const original = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...args) => {
    const res = await original(...args);
    const id = res && res.key && res.key.id;
    if (id) {
      sentIds.set(id, Date.now());
      if (sentIds.size > 1000) for (const k of sentIds.keys()) { sentIds.delete(k); if (sentIds.size <= 800) break; }
    }
    return res;
  };
}

const botNumbers = (sock) => [sock.user?.id, sock.user?.lid].filter(Boolean).map(numberOf).concat([...extraBotIds]);

// WhatsApp can show the same person as a phone number AND as a hidden id (LID).
// When we see both for a known owner/protected person, remember both.
function learnAliases(msg) {
  const k = msg.key;
  const ids = [k.participant, k.participantAlt, k.participantPn, k.remoteJidAlt, k.remoteJid]
    .filter((j) => j && (j.endsWith('@s.whatsapp.net') || j.endsWith('@lid')))
    .map(numberOf);
  const uniq = [...new Set(ids)];
  if (uniq.length < 2) return;
  if (uniq.some((n) => settings.isMainOwner(n))) settings.addClaimed(uniq);
  else if (uniq.some((n) => settings.isSubOwner(n))) settings.addSubOwners(uniq);
  else if (uniq.some((n) => settings.protectedIds().includes(n))) settings.addProtectAlias(uniq);
}

// In groups Exo-Cyber only answers when addressed: her name, an @mention, or a reply to her.
function isAddressed(ctx, bots) {
  if (!ctx.isGroup) return true;
  if (/\bexo(?:[\s-]?cyber)?\b/i.test(ctx.text)) return true;
  const quotedId = ctx.ctxInfo?.stanzaId;
  if (quotedId && sentIds.has(quotedId)) {           // a reply to something Exo-Cyber said
    if (ctx.ctxInfo.participant) extraBotIds.add(numberOf(ctx.ctxInfo.participant));
    return true;
  }
  if (ctx.mentioned.some((j) => bots.includes(numberOf(j)))) return true;
  if (ctx.ctxInfo?.participant && bots.includes(numberOf(ctx.ctxInfo.participant))) return true;
  return false;
}

async function afkHandling(ctx, isAfkCommand) {
  // 1) The AFK person is back
  const mine = settings.getAfk(ctx.senderNum);
  if (mine && !isAfkCommand) {
    settings.clearAfk(ctx.senderNum);
    await ctx.reply(`Back already? You were gone ${fmtDuration(Date.now() - mine.since)}.`);
  }
  // 2) Someone tagged / replied to an AFK person (groups only, max once per 5 min per person)
  if (!ctx.isGroup) return;
  const targets = [...new Set([...ctx.mentioned, ctx.ctxInfo?.participant].filter(Boolean).map(numberOf))];
  for (const n of targets) {
    const afk = settings.getAfk(n);
    if (!afk || n === ctx.senderNum) continue;
    const key = `${ctx.jid}:${n}`;
    if (Date.now() - (afkNoticeAt.get(key) || 0) < 5 * 60 * 1000) continue;
    afkNoticeAt.set(key, Date.now());
    await ctx.reply(`${afk.name || 'They'} is AFK: ${afk.reason} (${fmtDuration(Date.now() - afk.since)} ago).`);
  }
}

async function handleMessage(sock, msg) {
  trackSent(sock);
  const receivedAt = Date.now();
  if (!msg.message || msg.key.fromMe) return;
  const jid = msg.key.remoteJid;
  if (!jid || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return;
  if (isDuplicate(msg.key.id)) return;

  const ts = Number(msg.messageTimestamp) || 0;
  if (ts && Date.now() / 1000 - ts > 120) return; // ignore old backlog after reconnect

  const m = unwrap(msg.message);
  if (!m || m.protocolMessage || m.reactionMessage || (m.senderKeyDistributionMessage && Object.keys(m).length === 1)) return;

  learnAliases(msg);

  const text = getText(m).trim();
  const isGroup = jid.endsWith('@g.us');
  const sender = msg.key.participant || jid;
  const senderNum = numberOf(sender);
  const ctxInfo = getContext(m);
  const isOwner = settings.isOwner(senderNum);
  const ctx = {
    sock, msg, m, jid, sender, senderNum, text, isGroup, ctxInfo, receivedAt,
    pushName: msg.pushName || '',
    mentioned: ctxInfo?.mentionedJid || [],
    isOwner,
    isMainOwner: settings.isMainOwner(senderNum),
    isFriend: isOwner || friends.isFriend(senderNum),
    isBotMessage: (id, participant) => sentIds.has(id) || Boolean(participant && botNumbers(sock).includes(numberOf(participant))),
    reply: (t, extra = {}) => sock.sendMessage(jid, { text: t, ...extra }, { quoted: msg }),
  };

  // PRIVATE MODE: only owners and friends get commands and AI answers. Everyone else is ignored
  // (MR NICK protection, anti-link and AFK still run).
  const blocked = currentMode() === 'private' && !ctx.isFriend;

  ctx.addressed = isAddressed(ctx, botNumbers(sock));
  const parsed = commands.parse(text, ctx);
  const isAfkCommand = Boolean(parsed && parsed.cmd.name === 'afk');

  // Keep the last group messages in memory (never saved) so .recap has something to read.
  if (isGroup && text && !parsed) chatlog.add(jid, { name: ctx.pushName || senderNum, text });

  // Sleep mode: asleep = total silence in this chat (no replies, tags, reactions or commands),
  // except the owner waking her up.
  const wantsWake = ctx.isOwner && (WAKE_RE.test(text) || Boolean(parsed && parsed.cmd.name === 'wake'));
  if (settings.isAsleep(jid)) {
    if (wantsWake) { settings.setSleep(jid, false); await ctx.reply("Yeah, yeah. I'm up."); }
    return;
  }
  if (ctx.isOwner && SLEEP_RE.test(text)) {
    settings.setSleep(jid, true);
    await ctx.reply("Fine. I'm out. Wake me with 'exo wake up' when you need me.");
    return;
  }

  // NEW: Auto-claim card drops (fire and forget, never delays anything else)
  autoclaim.autoClaim(sock, msg, m, text).catch((e) => log.warn('Autoclaim failed:', e.message));

  // Anti-link: act on links from non-admins in groups where it is switched on (friends are exempt).
  if (isGroup && !parsed && !ctx.isFriend && settings.antiLink(jid)) {
    const acted = await enforceAntiLink(ctx, settings.antiLink(jid), settings).catch((e) => { log.warn('Anti-link failed:', e.message); return false; });
    if (acted) return;
  }

  // FAST PATH: someone tagged MR NICK in a group (and it is not a command). Answer right away,
  // before AFK bookkeeping, sending the reaction and the reply at the same time.
  const protectNow = async () => {
    const protect = nick.check(ctx);
    if (!protect) return false;
    await Promise.all([
      sock.sendMessage(jid, { react: { text: protect.emoji, key: msg.key } }).catch(() => {}),
      ctx.reply(protect.reply),
    ]);
    return true;
  };
  if (!parsed && (await protectNow())) return;

  // 0) AFK bookkeeping (never blocks the rest)
  await afkHandling(ctx, isAfkCommand).catch((e) => log.warn('AFK handling failed:', e.message));

  // 1) Commands (skipped in private mode for people who are not owners/friends)
  if (parsed && !blocked && (await commands.run(ctx))) return;
  if (parsed && (await protectNow())) return; // a command that did not run but tagged MR NICK

  // 3) AI conversation
  if (blocked || !text || !settings.isAiOn(jid) || !isAddressed(ctx, botNumbers(sock))) return;

  // She is being talked to: remember this person (name, small facts).
  human.learn(ctx);

  // Just her name ("Exo-Cyber") -> a quick answer with no AI call.
  if (/^@?\s*exo(?:[\s-]?cyber)?[\s!?.,]*$/i.test(text)) { await ctx.reply(nameCallReply(ctx.isOwner)); return; }

  // Owners and friends are never rate-limited.
  if (!ctx.isFriend) {
    const last = lastAiAt.get(senderNum) || 0;
    if (Date.now() - last < config.ai.userCooldownMs) return;
    lastAiAt.set(senderNum, Date.now());
  }

  // "Who built you?" and "what model are you?" are answered directly: never by the AI.
  const who = identityReply(text, ctx.isOwner);
  if (who) {
    memory.add(senderNum, 'user', text);
    memory.add(senderNum, 'assistant', who);
    await ctx.reply(who);
    return;
  }

  // Sincerely asked if she's human: honest, in her own voice.
  if (isHumanQuestion(text)) { await ctx.reply(clapbacks.pick(ctx.isOwner ? 'notHumanOwner' : 'notHuman')); return; }

  // Provoked (insult, slur, pet name, "you're a bot"): she always hits back. No AI needed.
  // For her owner it goes to the AI instead, with a "tease, don't go cold" note.
  const provoked = provocation(text);
  if (provoked && !ctx.isOwner) { await ctx.reply(clapbacks.pick(provoked)); return; }

  const asVoice = human.wantsVoice(ctx); // sometimes she answers with a voice note
  sock.sendPresenceUpdate(asVoice ? 'recording' : 'composing', jid).catch(() => {}); // not awaited: don't delay the AI call
  // Drop any old answers that wrongly named a company as her maker.
  const history = memory.get(senderNum).filter((h) => !(h.role === 'assistant' && isVendorClaim(h.content)));
  const messages = [
    { role: 'system', content: systemPrompt({ isGroup, name: ctx.pushName, isOwner: ctx.isOwner, provocation: provoked }) + bondNote(senderNum, ctx.isOwner, ctx.isFriend) + human.personNote(ctx) + human.promptNote(asVoice) },
    ...history,
    { role: 'user', content: text },
  ];
  const result = await fallback.generate(messages);
  sock.sendPresenceUpdate('paused', jid).catch(() => {});

  if (!result) {
    log.warn('All AI providers failed for a message.');
    await ctx.reply(offlineReply());
    return;
  }
  let answer = cleanReply(result.text);
  // Assistant-style safety boilerplate is replaced by a rude one-liner, unless the person seems to be in real distress.
  if (isBoilerplate(answer) && !isDistress(text)) answer = clapbacks.pick(ctx.isOwner ? 'deflectOwner' : 'deflect');
  memory.add(senderNum, 'user', text);
  memory.add(senderNum, 'assistant', answer);
  extras.gainAffinity(senderNum); // +1 affinity per conversation (max once per 30 s per person)
  await human.respond(ctx, answer, asVoice); // voice note or text, and now and then a sticker
}

module.exports = { handleMessage };ldownMs) return;
    lastAiAt.set(senderNum, Date.now());
  }

  // "Who built you?" and "what model are you?" are answered directly: never by the AI.
  const who = identityReply(text, ctx.isOwner);
  if (who) {
    memory.add(senderNum, 'user', text);
    memory.add(senderNum, 'assistant', who);
    await ctx.reply(who);
    return;
  }

  // Sincerely asked if she's human: honest, in her own voice.
  if (isHumanQuestion(text)) { await ctx.reply(clapbacks.pick(ctx.isOwner ? 'notHumanOwner' : 'notHuman')); return; }

  // Provoked (insult, slur, pet name, "you're a bot"): she always hits back. No AI needed.
  // For her owner it goes to the AI instead, with a "tease, don't go cold" note.
  const provoked = provocation(text);
  if (provoked && !ctx.isOwner) { await ctx.reply(clapbacks.pick(provoked)); return; }

  const asVoice = human.wantsVoice(ctx); // sometimes she answers with a voice note
  sock.sendPresenceUpdate(asVoice ? 'recording' : 'composing', jid).catch(() => {}); // not awaited: don't delay the AI call
  // Drop any old answers that wrongly named a company as her maker.
  const history = memory.get(senderNum).filter((h) => !(h.role === 'assistant' && isVendorClaim(h.content)));
  const messages = [
    { role: 'system', content: systemPrompt({ isGroup, name: ctx.pushName, isOwner: ctx.isOwner, provocation: provoked }) + bondNote(senderNum, ctx.isOwner, ctx.isFriend) + human.personNote(ctx) + human.promptNote(asVoice) },
    ...history,
    { role: 'user', content: text },
  ];
  const result = await fallback.generate(messages);
  sock.sendPresenceUpdate('paused', jid).catch(() => {});

  if (!result) {
    log.warn('All AI providers failed for a message.');
    await ctx.reply(offlineReply());
    return;
  }
  let answer = cleanReply(result.text);
  // Assistant-style safety boilerplate is replaced by a rude one-liner, unless the person seems to be in real distress.
  if (isBoilerplate(answer) && !isDistress(text)) answer = clapbacks.pick(ctx.isOwner ? 'deflectOwner' : 'deflect');
  memory.add(senderNum, 'user', text);
  memory.add(senderNum, 'assistant', answer);
  extras.gainAffinity(senderNum); // +1 affinity per conversation (max once per 30 s per person)
  await human.respond(ctx, answer, asVoice); // voice note or text, and now and then a sticker
}

module.exports = { handleMessage };
