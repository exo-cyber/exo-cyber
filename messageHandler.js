
'use strict';

// ==========================================
// EXO-CYBER WHATSAPP BOT
// MAIN MESSAGE HANDLER
// ==========================================

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
const vo = require('./vocache');

const {
  systemPrompt,
  offlineReply,
  nameCallReply
} = require('./personality');

// ==========================================
// STORAGE
// ==========================================

const lastAiAt = new Map();
const afkNoticeAt = new Map();

const sentIds = new Map();
const extraBotIds = new Set();
const wrapped = new WeakSet();

// ==========================================
// TRACK BOT MESSAGES
// ==========================================

function trackSent(sock) {
  if (wrapped.has(sock)) return;

  wrapped.add(sock);

  const original = sock.sendMessage.bind(sock);

  sock.sendMessage = async (...args) => {
    const result = await original(...args);

    const id = result?.key?.id;

    if (id) {
      sentIds.set(id, Date.now());

      if (sentIds.size > 1000) {
        for (const key of sentIds.keys()) {
          sentIds.delete(key);

          if (sentIds.size