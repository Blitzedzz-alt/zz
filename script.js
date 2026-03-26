// ==UserScript==
// @name         Roblox Create — Line DB
// @namespace    roblox-line-db
// @version      3.0
// @description  Replaces trigger symbols with GitHub DB lines anywhere on create.roblox.com
// @author       You
// @match        https://create.roblox.com/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
  'use strict';
// yes this script is skidded i dont fucking care
  const LOG  = (...a) => console.log('[LineDB]', ...a);
  const WARN = (...a) => console.warn('[LineDB]', ...a);
  const ERR  = (...a) => console.error('[LineDB]', ...a);

  LOG('v3 started');

  // ═══════════════════════════════════════════════════════════════════
  const DB_URL = 'https://raw.githubusercontent.com/Blitzedzz-alt/zz/refs/heads/main/z';

  const SYMBOL_MAP = {
    '§': 1,  '¶': 2,  '©': 3,  '®': 4,
    '™': 5,  '°': 6,  '±': 7,  '×': 8,
    '÷': 9,  '∞': 10, '≈': 11, '≠': 12,
    '←': 13, '→': 14, '↑': 15, '↓': 16,
  };
  // ═══════════════════════════════════════════════════════════════════

  const SYMS   = Object.keys(SYMBOL_MAP);
  const SYM_RE = new RegExp(`[${SYMS.join('')}][^\\n]*`, 'g');

  // ── DB ───────────────────────────────────────────────────────────────
  let db        = null;
  let dbPromise = null;

  function fetchDB() {
    if (db)        return Promise.resolve(db);
    if (dbPromise) return dbPromise;

    LOG('fetching', DB_URL);

    dbPromise = new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: DB_URL + '?_=' + Date.now(),
        onload(res) {
          LOG('status', res.status);
          LOG('body', JSON.stringify(res.responseText.slice(0, 400)));

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
              LOG('  line', n, '→', out[n].slice(0, 60));
            }
          }
          db = out;
          LOG('DB ready, keys:', Object.keys(db));
          resolve(db);
        },
        onerror()  { ERR('onerror');  reject(new Error('onerror')); },
        ontimeout() { ERR('timeout'); reject(new Error('timeout')); },
        timeout: 8000,
      });
    });

    return dbPromise;
  }

  // Returns the DB line for the first trigger symbol found in str,
  // or null if no symbol is present / line not in DB.
  // The caller replaces the ENTIRE element content with this value.
  function getReplacementForElement(str) {
    for (const sym of SYMS) {
      if (!str.includes(sym)) continue;
      const n = SYMBOL_MAP[sym];
      if (db && db[n] !== undefined) {
        LOG('symbol', sym, '→ line', n, '→', db[n].slice(0, 60));
        return db[n];
      }
      WARN('symbol', sym, '→ line', n, 'not in DB');
    }
    return null;
  }

  // ── React native setter ───────────────────────────────────────────────
  const inputSetter    = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,    'value').set;
  const textareaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;

  // ── Replace everywhere ────────────────────────────────────────────────
  // Called with the DB loaded. Scans every input, textarea, and text node.

  const busy = new WeakSet();

  function replaceInField(_el) {
    // inputs and textareas are excluded — do nothing
  }

  function replaceInTextNode(node) {
    const old  = node.nodeValue;
    const next = getReplacementForElement(old);
    if (next === null) return;

    LOG('textNode hit:', JSON.stringify(old.slice(0, 80)));
    LOG('  now:', JSON.stringify(next.slice(0, 80)));
    node.nodeValue = next;
    LOG('textNode replaced ✓');
  }

  function replaceInContentEditable(el) {
    if (busy.has(el)) return;
    const old  = el.innerText || el.textContent || '';
    const next = getReplacementForElement(old);
    if (next === null) return;

    LOG('contenteditable hit:', el.className.slice(0, 30));
    LOG('  was:', JSON.stringify(old.slice(0, 80)));
    LOG('  now:', JSON.stringify(next.slice(0, 80)));

    busy.add(el);
    el.focus();
    document.execCommand('selectAll',  false, null);
    document.execCommand('insertText', false, next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    LOG('contenteditable replaced ✓');
    setTimeout(() => busy.delete(el), 50);
  }

  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);

  function sweepAll() {
    if (!db) return;

    // 1. inputs/textareas excluded — skipped

    // 2. All contenteditable
    document.querySelectorAll('[contenteditable]').forEach(replaceInContentEditable);

    // 3. All text nodes in the DOM
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (SKIP.has(n.parentElement?.tagName)) return NodeFilter.FILTER_REJECT;
        return SYMS.some(s => n.nodeValue.includes(s))
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(replaceInTextNode);
  }

  // ── Boot ──────────────────────────────────────────────────────────────
  fetchDB()
    .then(() => {
      LOG('initial sweep');
      sweepAll();

      // Poll every 500ms — catches anything the events miss
      setInterval(sweepAll, 500);

      // Also react to every DOM change
      new MutationObserver(() => sweepAll())
        .observe(document.body, { childList: true, subtree: true, characterData: true });

      // Also react to every input event on the whole document
      document.addEventListener('input', e => {
        const t = e.target;
        if (!t) return;
        if (t.isContentEditable) replaceInContentEditable(t);
      }, true);

      badge.textContent = `Line DB: ${Object.keys(db).length} lines — watching`;
      setTimeout(() => badge.style.opacity = '0.2', 3000);
    })
    .catch(err => {
      ERR('boot failed:', err.message);
      badge.style.color = badge.style.borderColor = '#ff5555';
      badge.textContent = `Line DB: ${err.message} | Made by Blitzedzz@udgang`;
    });

  // ── Badge ─────────────────────────────────────────────────────────────
  const badge = Object.assign(document.createElement('div'), {
    textContent: 'Line DB: loading… | Made by Blitzedzz@udgang',
  });
  Object.assign(badge.style, {
    position: 'fixed', bottom: '12px', right: '12px',
    background: '#1a1a2e', color: '#44dd88',
    border: '1px solid #44dd88', borderRadius: '4px',
    padding: '4px 10px', font: '11px Consolas,monospace',
    zIndex: '999999', opacity: '0.9', pointerEvents: 'none',
  });
  document.body.appendChild(badge);

})();
