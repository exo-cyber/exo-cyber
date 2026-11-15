// Switches and small facts that survive restarts:
// AI on/off per chat, MR NICK protection, claimed owner ids, prefix, AFK list.
const config = require('./config');
const { createStore } = require('./jsonStore');

const store = createStore('settings', { aiOff: {}, protectEnabled: null, claimed: [], protectAlias: [], subOwners: [], prefix: null, afk: {}, sleeping: {}, antilink: {}, antilinkWarns: {} });

function d() {
  const s = store.data;
  s.aiOff = s.aiOff || {};
  s.claimed = s.claimed || [];
  s.protectAlias = s.protectAlias || [];
  s.subOwners = s.subOwners || [];
  s.sleeping = s.sleeping || {};
  s.afk = s.afk || {};
  s.antilink = s.antilink || {};
  s.antilinkWarns = s.antilinkWarns || {};
  if (s.protectEnabled === undefined) s.protectEnabled = null;
  if (s.prefix === undefined) s.prefix = null;
  return s;
}
const uniq = (a) => [...new Set(a)];

// --- AI on/off per chat
const isAiOn = (chatId) => !d().aiOff[chatId];
function setAi(chatId, on) { if (on) delete d().aiOff[chatId]; else d().aiOff[chatId] = true; store.save(); }

// --- MR NICK protection switch
const isProtectOn = () => (d().protectEnabled === null ? config.protectedContact.enabled : d().protectEnabled);
function setProtect(on) { d().protectEnabled = Boolean(on); store.save(); }

// --- Command prefix
const prefix = () => d().prefix || config.prefix;
function setPrefix(p) { d().prefix = p && p !== config.prefix ? p : null; store.save(); }

// --- Owner / protected identities (phone numbers AND hidden LIDs, digits only)
const claimed = () => d().claimed.slice();
const isMainOwner = (num) => config.owner.ids.includes(num) || d().claimed.includes(num);
const isSubOwner = (num) => d().subOwners.includes(num);
const isOwner = (num) => isMainOwner(num) || isSubOwner(num); // may use owner-only commands
const subOwners = () => d().subOwners.slice();
function addSubOwners(nums) {
  const before = d().subOwners.length;
  d().subOwners = uniq([...d().subOwners, ...nums.filter((n) => n && !isMainOwner(n))]);
  if (d().subOwners.length !== before) store.save();
  return d().subOwners.length - before;
}
function removeSubOwners(nums) {
  const before = d().subOwners.length;
  d().subOwners = d().subOwners.filter((n) => !nums.includes(n));
  if (d().subOwners.length !== before) store.save();
  return before - d().subOwners.length;
}
function addClaimed(nums) {
  const before = d().claimed.length;
  d().claimed = uniq([...d().claimed, ...nums.filter(Boolean)]);
  if (d().claimed.length !== before) store.save();
  return d().claimed.length !== before;
}
function clearClaimed() { d().claimed = []; d().protectAlias = []; store.save(); }
function addProtectAlias(nums) {
  const before = d().protectAlias.length;
  d().protectAlias = uniq([...d().protectAlias, ...nums.filter(Boolean)]);
  if (d().protectAlias.length !== before) store.save();
}
const protectedIds = () => uniq([...config.protectedContact.ids, ...d().claimed, ...d().protectAlias]);

// --- Sleep: while asleep in a chat, Exo-Cyber ignores everything there except the owner's wake-up
const isAsleep = (chatId) => Boolean(d().sleeping[chatId]);
function setSleep(chatId, on) { if (on) d().sleeping[chatId] = true; else delete d().sleeping[chatId]; store.save(); }

// --- Anti-link per group: { action: 'delete' | 'warn' | 'kick', scope: 'all' | 'gc' } or null (off)
// scope 'all' = any link, 'gc' = only WhatsApp group invite links
function antiLink(chatId) {
  const v = d().antilink[chatId];
  if (!v) return null;
  if (typeof v === 'string') return { action: 'delete', scope: v === 'gc' ? 'gc' : 'all' }; // older saved format
  return v;
}
function setAntiLink(chatId, cfg) { if (!cfg) delete d().antilink[chatId]; else d().antilink[chatId] = cfg; store.save(); }

// Warning counts for anti-link (per group, per person)
function addAntiLinkWarn(chatId, num) {
  const w = d().antilinkWarns[chatId] || (d().antilinkWarns[chatId] = {});
  w[num] = (w[num] || 0) + 1;
  store.save();
  return w[num];
}
function clearAntiLinkWarn(chatId, num) { if (d().antilinkWarns[chatId]) { delete d().antilinkWarns[chatId][num]; store.save(); } }

// --- AFK
const getAfk = (num) => d().afk[num] || null;
function setAfk(num, info) { d().afk[num] = info; store.save(); }
function clearAfk(num) { delete d().afk[num]; store.save(); }

module.exports = {
  isAiOn, setAi, isProtectOn, setProtect, prefix, setPrefix,
  claimed, isOwner, isMainOwner, isSubOwner, subOwners, addSubOwners, removeSubOwners, addClaimed, clearClaimed, addProtectAlias, protectedIds,
  getAfk, setAfk, clearAfk, isAsleep, setSleep, antiLink, setAntiLink, addAntiLinkWarn, clearAntiLinkWarn,
  init: async () => { await store.load(); d(); },
};
