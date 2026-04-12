// ==UserScript==
// @name         Roblox Create — Line DB (Multi-Symbol)
// @namespace    roblox-line-db
// @version      4.0
// @description  Multi-symbol → number → DB line replacement
// @author       You
// @match        https://create.roblox.com/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
  'use strict';

  const LOG  = (...a) => console.log('[LineDB]', ...a);
  const WARN = (...a) => console.warn('[LineDB]', ...a);
  const ERR  = (...a) => console.error('[LineDB]', ...a);

  LOG('v4 started');

  // ═══════════════════════════════════════════════════════════════════
  const DB_URL = 'https://raw.githubusercontent.com/Blitzedzz-alt/zz/refs/heads/main/z';

  const SYMBOL_MAP = {
    '§': 1,  '¶': 2,  '©': 3,  '®': 4,
    '™': 5,  '°': 6,  '±': 7,  '×': 8,
    '÷': 9,  '∞': 0,  // optional: made ∞ = 0 so you can do stuff like 10, 205 etc
    '≈': 11, '≠': 12,
    '←': 13, '→': 14, '↑': 15, '↓': 16,
  };
  // ═══════════════════════════════════════════════════════════════════

  const SYMS = Object.keys(SYMBOL_MAP);
  const SYM_REGEX = new RegExp(`[${SYMS.join('')}]`, 'g');

  // ── DB ───────────────────────────────────────────────────────────────
  let db = null;
  let dbPromise = null;

  function fetchDB() {
    if (db) return Promise.resolve(db);
    if (dbPromise) return dbPromise;

    LOG('fetching', DB_URL);

    dbPromise = new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: DB_URL + '?_=' + Date.now(),
        onload(res) {
          if (res.status < 200 || res.status >= 300) {
            return reject(new Error('HTTP ' + res.status));
          }

          const out = {};
          for (const line of res.responseText.split('\n')) {
            const bar = line.indexOf('|');
            if (bar < 1) continue;

            const n = parseInt(line.slice(0, bar).trim(), 10);
            if (!isNaN(n)) {
              out[n] = line.slice(bar + 1).trim();
            }
          }

          db = out;
          LOG('DB loaded:', Object.keys(db).length, 'lines');
          resolve(db);
        },
        onerror() { reject(new Error('onerror')); },
        timeout: 8000,
      });
    });

    return dbPromise;
  }

  // ── MULTI SYMBOL PARSER ───────────────────────────────────────────────
  function parseSymbols(str) {
    const matches = str.match(SYM_REGEX);
    if (!matches) return null;

    let result = '';

    for (const sym of matches) {
      const val = SYMBOL_MAP[sym];

      if (val === undefined) continue;

      // if value is multi-digit (like 11, 12), append directly
      result += String(val);
    }

    if (!result) return null;

    return parseInt(result, 10);
  }

  function getReplacementForElement(str) {
    const num = parseSymbols(str);
    if (num === null) return null;

    if (db && db[num] !== undefined) {
      LOG('symbols →', num, '→', db[num].slice(0, 60));
      return db[num];
    }

    WARN('number', num, 'not in DB');
    return null;
  }

  // ── REPLACEMENT ENGINE ────────────────────────────────────────────────
  const busy = new WeakSet();

  function replaceInTextNode(node) {
    const old = node.nodeValue;
    const next = getReplacementForElement(old);
    if (!next) return;

    node.nodeValue = next;
  }

  function replaceInContentEditable(el) {
    if (busy.has(el)) return;

    const old = el.innerText || el.textContent || '';
    const next = getReplacementForElement(old);
    if (!next) return;

    busy.add(el);

    el.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, next);
    el.dispatchEvent(new Event('input', { bubbles: true }));

    setTimeout(() => busy.delete(el), 50);
  }

  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);

  function sweepAll() {
    if (!db) return;

    // contenteditable
    document.querySelectorAll('[contenteditable]').forEach(replaceInContentEditable);

    // text nodes
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (SKIP.has(n.parentElement?.tagName)) return NodeFilter.FILTER_REJECT;

        return SYMS.some(s => n.nodeValue.includes(s))
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });

    let n;
    while ((n = walker.nextNode())) {
      replaceInTextNode(n);
    }
  }

  // ── BOOT ──────────────────────────────────────────────────────────────
  fetchDB()
    .then(() => {
      sweepAll();

      setInterval(sweepAll, 500);

      new MutationObserver(sweepAll)
        .observe(document.body, { childList: true, subtree: true, characterData: true });

      document.addEventListener('input', e => {
        const t = e.target;
        if (t?.isContentEditable) replaceInContentEditable(t);
      }, true);

      badge.textContent = `Line DB: ${Object.keys(db).length} lines — multi-symbol ON`;
    })
    .catch(err => {
      ERR(err.message);
      badge.textContent = `Line DB ERROR`;
    });

  // ── BADGE ─────────────────────────────────────────────────────────────
  const badge = Object.assign(document.createElement('div'), {
    textContent: 'Line DB: loading…',
  });

  Object.assign(badge.style, {
    position: 'fixed',
    bottom: '12px',
    right: '12px',
    background: '#1a1a2e',
    color: '#44dd88',
    border: '1px solid #44dd88',
    borderRadius: '4px',
    padding: '4px 10px',
    font: '11px Consolas,monospace',
    zIndex: '999999',
    opacity: '0.9',
    pointerEvents: 'none',
  });

  document.body.appendChild(badge);

})();
