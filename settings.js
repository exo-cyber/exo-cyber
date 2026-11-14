'use strict';

// ==========================================
// EXO-CYBER WHATSAPP BOT
// SETTINGS SYSTEM
// ==========================================

const config = require('./config');
const { createStore } = require('./jsonStore');

// ==========================================
// STORAGE
// ==========================================

const store = createStore('settings', {
  aiOff: {},
  protectEnabled: null,
  claimedOwnerIds: [],
  protectedAliases: [],
  afk: {}
});

// ==========================================
// HELPERS
// ==========================================

function normalize(value) {
  if (!value) return '';

  return String(value)
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');
}

function uniqueNumbers(values) {
  return [...new Set(
    values.flat(Infinity)
      .map(normalize)
      .filter(Boolean)
  )];
}

function save() {
  try {
    const result = store.save();

    if (result && typeof result.catch === 'function') {
      result.catch(err => {
        console.error('[SETTINGS SAVE ERROR]', err.message);
      });
    }
  } catch (err) {
    console.error('[SETTINGS SAVE ERROR]', err.message);
  }
}

// ==========================================
// OWNER NUMBERS
// ==========================================

function configuredOwners() {
  return uniqueNumbers([
    process.env.OWNER_NUMBER,
    process.env.OWNER_NUMBERS,

    config.owner,
    config.owners,
    config.ownerNumber,
    config.ownerNumbers,
    config.ownerJid,
    config.ownerJids,
    config.creator,
    config.sudo
  ].filter(Boolean));
}

function isOwner(number) {
  const n = normalize(number);

  if (!n) return false;

  const owners = [
    ...configuredOwners(),
    ...(store.data.claimedOwnerIds || [])
  ];

  return owners.includes(n);
}

// ==========================================
// OWNER ALIASES
// ==========================================

function addClaimed(numbers) {
  const ids = uniqueNumbers(numbers);

  if (!Array.isArray(store.data.claimedOwnerIds)) {
    store.data.claimedOwnerIds = [];
  }

  store.data.claimedOwnerIds = uniqueNumbers([
    ...store.data.claimedOwnerIds,
    ...ids
  ]);

  save();
}

// ==========================================
// PROTECTED CONTACTS
// ==========================================

function protectedIds() {
  const p = config.protectedContact || {};

  return uniqueNumbers([
    config.protectedIds,
    config.protectedNumbers,
    p.number,
    p.numbers,
    p.ids,
    p.contacts,
    store.data.protectedAliases
  ]);
}

function addProtectAlias(numbers) {
  const ids = uniqueNumbers(numbers);

  if (!Array.isArray(store.data.protectedAliases)) {
    store.data.protectedAliases = [];
  }

  store.data.protectedAliases = uniqueNumbers([
    ...store.data.protectedAliases,
    ...ids
  ]);

  save();
}

function isProtectOn() {
  return store.data.protectEnabled === null
    ? Boolean(config.protectedContact?.enabled)
    : Boolean(store.data.protectEnabled);
}

function setProtect(on) {
  store.data.protectEnabled = Boolean(on);
  save();
}

// ==========================================
// AI SETTINGS
// ==========================================

function isAiOn(chatId) {
  return !store.data.aiOff[chatId];
}

function setAi(chatId, on) {
  if (on) {
    delete store.data.aiOff[chatId];
  } else {
    store.data.aiOff[chatId] = true;
  }

  save();
}

// ==========================================
// AFK SYSTEM
// ==========================================

function getAfk(number) {
  return store.data.afk[normalize(number)] || null;
}

function setAfk(number, reason = 'AFK', name = '') {
  const n = normalize(number);

  if (!n) return;

  store.data.afk[n] = {
    reason,
    name,
    since: Date.now()
  };

  save();
}

function clearAfk(number) {
  const n = normalize(number);

  if (!n) return;

  delete store.data.afk[n];

  save();
}

// ==========================================
// INITIALIZATION
// ==========================================

async function init() {
  await store.load();

  store.data.aiOff = store.data.aiOff || {};

  store.data.claimedOwnerIds =
    store.data.claimedOwnerIds || [];

  store.data.protectedAliases =
    store.data.protectedAliases || [];

  store.data.afk = store.data.afk || {};

  if (store.data.protectEnabled === undefined) {
    store.data.protectEnabled = null;
  }

  console.log('[SETTINGS] Settings loaded successfully.');
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  init,

  isOwner,
  addClaimed,

  protectedIds,
  addProtectAlias,

  isProtectOn,
  setProtect,

  isAiOn,
  setAi,

  getAfk,
  setAfk,
  clearAfk
};
