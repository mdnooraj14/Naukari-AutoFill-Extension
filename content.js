/**
 * Naukri Auto-Fill Assistant - Content Script
 *
 * Supported question types:
 *   TEXT     → free-text input (input, textarea, contenteditable)
 *   RADIO    → single-choice radio buttons (pick one)
 *   CHECKBOX → multi-choice checkboxes (pick many)
 *   UNKNOWN  → falls back to text overlay so the user can type manually
 *
 * The extension NEVER clicks Naukri's Save button. You do that when ready.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'naukriQnA';
  const SETTINGS_KEY = 'naukriSettings';
  const OVERLAY_ID   = 'naukri-autofill-overlay';
  const TOAST_ID     = 'naukri-autofill-toast';

  const TYPE = { TEXT: 'text', RADIO: 'radio', CHECKBOX: 'checkbox', UNKNOWN: 'unknown' };

  let qnaStore = {};

  // sessionQuestions: questions seen in the current chat session (cleared when chat reopens)
  let sessionQuestions   = new Set();
  // cancelledQuestions: { normalized → timestamp } — 5s cooldown after user cancels
  let cancelledQuestions = new Map();
  let isProcessing       = false;
  let chatWasOpen        = false;

  // ─── Storage ──────────────────────────────────────────────────────────────
  function loadStorage(cb) {
    try {
      chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY], (result) => {
        if (chrome.runtime.lastError) {
          console.warn('[NAF] Storage read:', chrome.runtime.lastError); return;
        }
        qnaStore = result[STORAGE_KEY] || {};
        if (cb) cb();
      });
    } catch (e) { console.warn('[NAF] Storage error:', e); if (cb) cb(); }
  }

  function saveQnA(cb) {
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: qnaStore }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[NAF] Storage write:', chrome.runtime.lastError);
        }
        if (cb) cb(); // always call cb so the fill proceeds even if storage fails
      });
    } catch (e) {
      console.warn('[NAF] Storage save:', e);
      if (cb) cb(); // still fill even if chrome context is invalidated
    }
  }

  // ─── Normalize ────────────────────────────────────────────────────────────
  function normalize(text) {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  // ─── Visibility ───────────────────────────────────────────────────────────
  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
  }

  // ─── Find chat container ──────────────────────────────────────────────────
  function findContainer() {
    const tries = [
      '.chatbot_DrawerContentWrapper',
      '[class*="DrawerContentWrapper"]',
      '[class*="chatbot_Drawer"]',
      '[class*="chatDrawer"]',
      '[class*="chat-drawer"]',
      '[class*="ChatDrawer"]',
      '[class*="questionnaire"]',
      '[class*="Questionnaire"]',
      '[class*="chatModal"]',
      '[class*="applyChat"]',
      '[class*="apply-chat"]',
    ];
    for (const sel of tries) {
      try {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) return el;
      } catch (e) { /* skip invalid */ }
    }
    return null;
  }

  // ─── Session: reset tracking when chat reopens ────────────────────────────
  function syncSession() {
    const container = findContainer();
    const open = !!container;
    if (open && !chatWasOpen) {
      console.log('[NAF] Chat opened — new session');
      sessionQuestions.clear();
      cancelledQuestions.clear();
      isProcessing = false;
    }
    chatWasOpen = open;
    return container;
  }

  // ─── Find question text from chat messages ────────────────────────────────
  function findQuestions(container) {
    if (!container) return [];
    const out = new Set();

    const msgSelectors = [
      'li.botItem', '[class*="botItem"]', '[class*="bot-item"]',
      '[class*="botMessage"]', '[class*="bot-message"]',
      '[class*="recruiter-msg"]', '[class*="recruiterMsg"]',
      '[class*="system-msg"]', '[class*="question"]',
    ];

    // A recruiter message is a question if it has "?" OR if it appears alongside an input/choice UI
    function isQuestion(t) {
      return t.length > 5 && t.length < 600 && (
        t.includes('?') ||
        /\b(open|willing|ready|available|comfortable|interest|experience|skills?|years?|ctc|salary|notice|location|relocat|join|work|current|expected)\b/i.test(t)
      );
    }

    let found = false;
    for (const sel of msgSelectors) {
      try {
        container.querySelectorAll(sel).forEach(el => {
          const t = el.textContent.trim();
          if (isQuestion(t)) { out.add(t); found = true; }
        });
      } catch (e) { /* skip */ }
    }

    // Broad fallback: leaf text nodes
    if (!found) {
      container.querySelectorAll('p, span, div, li').forEach(el => {
        if (el.children.length > 0) return;
        if (el.closest('input, textarea, button, [contenteditable], label, select')) return;
        const t = el.textContent.trim();
        if (isQuestion(t)) out.add(t);
      });
    }

    return [...out];
  }

  // ─── Detect question type ─────────────────────────────────────────────────
  function detectType(container) {
    if (!container) return TYPE.UNKNOWN;
    // Checkbox before radio (a panel might have both)
    if (container.querySelector('input[type="checkbox"]')) return TYPE.CHECKBOX;
    if (container.querySelector('input[type="radio"]'))   return TYPE.RADIO;
    const hasText = container.querySelector(
      '[contenteditable="true"], input[type="text"], input:not([type]), textarea'
    );
    if (hasText) return TYPE.TEXT;
    return TYPE.UNKNOWN;
  }

  // ─── Get label text for a form control ───────────────────────────────────
  function getLabelText(container, el) {
    // label[for=id]
    if (el.id) {
      try {
        const lbl = container.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl) return lbl.textContent.trim();
      } catch (e) { /* skip */ }
    }
    // ancestor label
    const anc = el.closest('label');
    if (anc) return anc.textContent.trim();
    // parent element text (strip input's own value)
    const par = el.parentElement;
    if (par) {
      const clone = par.cloneNode(true);
      clone.querySelectorAll('input, textarea, select').forEach(n => n.remove());
      const t = clone.textContent.trim();
      if (t) return t;
    }
    return el.value || '';
  }

  // ─── Get choice options for radio / checkbox ──────────────────────────────
  function getOptions(container, type) {
    if (!container) return [];
    const inputType = type === TYPE.RADIO ? 'radio' : 'checkbox';
    const results = [];
    const seen = new Set();

    container.querySelectorAll(`input[type="${inputType}"]`).forEach(el => {
      const text = getLabelText(container, el).trim();
      if (text && !seen.has(text)) {
        seen.add(text);
        results.push({ text, element: el });
      }
    });

    // Custom-UI fallback (div/li with role="radio" etc.)
    if (results.length === 0) {
      const roleAttr = type === TYPE.RADIO ? 'radio' : 'checkbox';
      container.querySelectorAll(`[role="${roleAttr}"], [class*="radio"], [class*="option-item"], [class*="optionItem"]`).forEach(el => {
        const text = el.textContent.trim();
        if (text && text.length < 150 && !seen.has(text)) {
          seen.add(text);
          results.push({ text, element: el });
        }
      });
    }

    console.log(`[NAF] Options found (${type}):`, results.map(o => o.text));
    return results;
  }

  // ─── Find text input field ────────────────────────────────────────────────
  function findTextInput(container) {
    if (!container) return null;

    const ce = container.querySelector('[contenteditable="true"]');
    if (ce && isVisible(ce)) return ce;

    const inputs = [...container.querySelectorAll('input[type="text"], input:not([type]), input[placeholder]')];
    for (const inp of inputs) {
      if (!isVisible(inp)) continue;
      const ph = (inp.getAttribute('placeholder') || '').toLowerCase();
      if (ph.includes('message') || ph.includes('type') || ph.includes('answer') || ph.includes('here')) return inp;
    }

    const ta = container.querySelector('textarea');
    if (ta && isVisible(ta)) return ta;

    for (const inp of inputs) {
      if (isVisible(inp)) return inp;
    }
    return null;
  }

  // ─── Type into text field (React-compatible) ──────────────────────────────
  function typeIntoField(el, text) {
    if (!el) return;
    el.focus();
    if (el.isContentEditable) {
      // Select all existing content and replace — triggers React's mutation observers
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      // Fallback if execCommand didn't work
      if (el.textContent.trim() !== text.trim()) {
        el.textContent = text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
      }
    } else {
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (setter) setter.set.call(el, text); else el.value = text;
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // ─── Click a radio/checkbox option matching saved answer ──────────────────
  function clickMatchingOption(options, savedAnswer) {
    const n = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const answers = Array.isArray(savedAnswer) ? savedAnswer : [savedAnswer];

    let anyClicked = false;
    answers.forEach(ans => {
      const exact = options.find(o => n(o.text) === n(ans));
      const fuzzy = !exact && options.find(o => n(o.text).includes(n(ans)) || n(ans).includes(n(o.text)));
      const match = exact || fuzzy;
      if (match) {
        match.element.click();
        match.element.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[NAF] Clicked option:', match.text);
        anyClicked = true;
      }
    });
    return anyClicked;
  }

  // ─── Process a detected question ──────────────────────────────────────────
  async function processQuestion(question) {
    if (isProcessing) return;

    const key = normalize(question);

    // Cooldown after cancel
    const cancelTime = cancelledQuestions.get(key);
    if (cancelTime && Date.now() - cancelTime < 5000) return;

    if (sessionQuestions.has(key)) return;
    sessionQuestions.add(key);
    isProcessing = true;

    console.log('[NAF] Question detected:', question);

    try {
      await wait(500); // let Naukri's UI settle
      const container = findContainer();
      const qType     = detectType(container);
      const saved     = qnaStore[key];

      console.log('[NAF] Type:', qType, '| Saved:', saved ? JSON.stringify(saved) : 'none');

      if (saved) {
        let filled = false;

        if (qType === TYPE.TEXT || qType === TYPE.UNKNOWN) {
          const inp = findTextInput(container);
          if (inp) { typeIntoField(inp, saved.answer); filled = true; }
          else     { console.warn('[NAF] Text input not found'); }

        } else if (qType === TYPE.RADIO) {
          const options = getOptions(container, TYPE.RADIO);
          filled = clickMatchingOption(options, saved.answer);
          if (!filled) {
            console.warn('[NAF] Saved option not found in radio list — showing overlay');
            showOverlay(question, key, qType, getOptions(container, qType));
          }

        } else if (qType === TYPE.CHECKBOX) {
          const options = getOptions(container, TYPE.CHECKBOX);
          let answers;
          try { answers = JSON.parse(saved.answer); } catch (e) { answers = [saved.answer]; }
          filled = clickMatchingOption(options, answers);
          if (!filled) {
            console.warn('[NAF] Saved options not found in checkbox list — showing overlay');
            showOverlay(question, key, qType, getOptions(container, qType));
          }
        }

        if (filled) {
          showToast('Answer filled — saving…');
          setTimeout(() => {
            clickSaveButton();
            // Release key so the same question can be re-processed for the next job
            sessionQuestions.delete(key);
            cancelledQuestions.set(key, Date.now()); // 3s cooldown to prevent immediate re-trigger
          }, 400);
        }

      } else {
        // Unknown question — show overlay with appropriate UI
        const options = (qType === TYPE.RADIO || qType === TYPE.CHECKBOX)
          ? getOptions(container, qType)
          : [];
        showOverlay(question, key, qType, options);
      }

    } catch (e) {
      console.warn('[NAF] Error:', e);
    } finally {
      isProcessing = false;
    }
  }

  // ─── Main check ───────────────────────────────────────────────────────────
  function check() {
    const container = syncSession();
    if (!container) return;

    const questions = findQuestions(container);
    if (questions.length === 0) return;

    // Only look at the LAST (most recent) question — that's the active unanswered one.
    // Earlier questions are already answered (they have user replies after them in the chat).
    const last = questions[questions.length - 1];
    const key  = normalize(last);

    const cancelTime = cancelledQuestions.get(key);
    const onCooldown = cancelTime && Date.now() - cancelTime < 3000;

    if (!sessionQuestions.has(key) && !onCooldown) {
      processQuestion(last);
    }
  }

  function startWatching() {
    const obs = new MutationObserver(check);
    obs.observe(document.body, { childList: true, subtree: true });
    setInterval(check, 2000);
  }

  // ─── Overlay ──────────────────────────────────────────────────────────────
  function showOverlay(question, key, qType, options) {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();
    injectStyles();

    const isChoice   = options.length > 0;
    const isMulti    = qType === TYPE.CHECKBOX;
    const title      = isChoice
      ? (isMulti ? 'Select All That Apply' : 'Select Answer')
      : 'Answer Required';

    let inputHtml = '';
    if (isChoice) {
      const inputType = isMulti ? 'checkbox' : 'radio';
      const name      = isMulti ? 'naf-cb' : 'naf-radio';
      inputHtml = `
        <div class="naf-options" id="naf-options-list">
          ${options.map((o, i) => `
            <label class="naf-opt">
              <input type="${inputType}" name="${name}" value="${i}" class="naf-ctrl">
              <span class="naf-opt-text">${escapeHtml(o.text)}</span>
            </label>
          `).join('')}
        </div>
        ${isMulti ? '<p class="naf-hint">Check all that apply</p>' : ''}
      `;
    } else {
      inputHtml = `
        <textarea class="naf-textarea" placeholder="Type your answer here..."></textarea>
        <p class="naf-hint">Ctrl+Enter to fill &nbsp;·&nbsp; saved for next time</p>
      `;
    }

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div class="naf-backdrop">
        <div class="naf-modal">
          <div class="naf-header">
            <span class="naf-title">${title}</span>
            <button class="naf-close" aria-label="Close">&times;</button>
          </div>
          <div class="naf-body">
            <div class="naf-question">${escapeHtml(question)}</div>
            ${inputHtml}
          </div>
          <div class="naf-footer">
            <button class="naf-btn-cancel">Cancel</button>
            <button class="naf-btn-fill">Fill Answer</button>
          </div>
        </div>
      </div>
    `;
    // Append inside Naukri's chat container so click-outside detection sees it as "inside"
    // The overlay uses position:fixed so it renders correctly on screen regardless
    const chatContainer = findContainer();
    (chatContainer || document.body).appendChild(overlay);

    const backdrop = overlay.querySelector('.naf-backdrop');
    const modal    = overlay.querySelector('.naf-modal');
    const closeBtn = overlay.querySelector('.naf-close');
    const cancelBtn= overlay.querySelector('.naf-btn-cancel');
    const fillBtn  = overlay.querySelector('.naf-btn-fill');
    const textarea = overlay.querySelector('.naf-textarea');

    function doClose(e) {
      if (e) { e.stopPropagation(); e.preventDefault(); }
      overlay.remove();
      // Allow re-detection after 5s cooldown
      sessionQuestions.delete(key);
      cancelledQuestions.set(key, Date.now());
    }

    function doFill(e) {
      if (e) { e.stopPropagation(); e.preventDefault(); }
      let answer;

      if (isChoice) {
        const checked = [...overlay.querySelectorAll('.naf-ctrl:checked')];
        if (checked.length === 0) {
          overlay.querySelector('#naf-options-list').style.outline = '2px solid #ef4444';
          return;
        }
        const selected = checked.map(el => options[parseInt(el.value, 10)].text);
        answer = isMulti ? JSON.stringify(selected) : selected[0];
      } else {
        answer = textarea ? textarea.value.trim() : '';
        if (!answer) {
          if (textarea) { textarea.style.borderColor = '#ef4444'; textarea.focus(); }
          return;
        }
      }

      overlay.remove();
      applyAndSave(key, qType, answer, options);
    }

    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) doClose(e); });
    modal.addEventListener('click', (e) => e.stopPropagation());
    closeBtn.addEventListener('click',  doClose);
    cancelBtn.addEventListener('click', doClose);
    fillBtn.addEventListener('click',   doFill);

    if (textarea) {
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doFill(e);
      });
      textarea.focus();
    }
  }

  // ─── Apply answer: save + fill in Naukri UI ───────────────────────────────
  // ─── Find and click Naukri's Save button ─────────────────────────────────
  function clickSaveButton() {
    // Naukri's Save is a <div class="sendMsg">, not a <button>
    // Try known selectors first — no visibility check needed, just existence
    const selectors = [
      '.sendMsg',
      '[class*="sendMsg"]',
      '[class*="sendMsgbtn"]',
      '[class*="send-msg"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) { el.click(); console.log('[NAF] Clicked Save:', sel); return true; }
    }
    // Fallback: any div/span with exact text "Save" outside our overlay
    const all = [...document.querySelectorAll('div, span')].filter(el =>
      el.textContent.trim() === 'Save' && !el.closest('#' + OVERLAY_ID)
    );
    if (all.length > 0) { all[0].click(); console.log('[NAF] Clicked Save by text'); return true; }
    console.warn('[NAF] Save button not found');
    return false;
  }

  // Map internal type to popup's display type
  function toPopupType(qType) {
    if (qType === TYPE.RADIO)    return 'single';
    if (qType === TYPE.CHECKBOX) return 'multi';
    if (qType === TYPE.TEXT)     return 'short';
    return 'short'; // UNKNOWN falls back to short
  }

  function applyAndSave(key, qType, answer, options) {
    qnaStore[key] = { answer, type: toPopupType(qType), timestamp: Date.now() };

    saveQnA(() => {
      const container = findContainer();
      let filled = false;

      if (qType === TYPE.TEXT || qType === TYPE.UNKNOWN) {
        const inp = findTextInput(container);
        if (inp) { typeIntoField(inp, answer); filled = true; }
        else     { showToast('Could not find input — please type manually'); }

      } else if (qType === TYPE.RADIO) {
        const opts = options && options.length ? options : getOptions(container, TYPE.RADIO);
        filled = clickMatchingOption(opts, answer);
        if (!filled) showToast('Option not found — please select manually');

      } else if (qType === TYPE.CHECKBOX) {
        const opts = options && options.length ? options : getOptions(container, TYPE.CHECKBOX);
        let answers;
        try { answers = JSON.parse(answer); } catch (e) { answers = [answer]; }
        filled = clickMatchingOption(opts, answers);
        if (!filled) showToast('Options not found — please select manually');
      }

      if (filled) {
        showToast('Answer filled — saving…');
        setTimeout(() => {
          clickSaveButton();
          // Release key so the same question can be re-processed for the next job
          sessionQuestions.delete(key);
          cancelledQuestions.set(key, Date.now()); // 3s cooldown to prevent immediate re-trigger
        }, 400);
      }
    });
  }

  // ─── Toast ────────────────────────────────────────────────────────────────
  function showToast(msg) {
    const old = document.getElementById(TOAST_ID);
    if (old) old.remove();
    injectStyles();
    const el = document.createElement('div');
    el.id = TOAST_ID;
    el.innerHTML = `<span>✓</span><span>${escapeHtml(msg)}</span>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('naf-show'));
    setTimeout(() => { el.classList.remove('naf-show'); setTimeout(() => el.remove(), 300); }, 4000);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function wait(ms)   { return new Promise(r => setTimeout(r, ms)); }

  function escapeHtml(t) {
    const d = document.createElement('div'); d.textContent = t; return d.innerHTML;
  }

  // ─── Styles ───────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('naf-styles')) return;
    const s = document.createElement('style');
    s.id = 'naf-styles';
    s.textContent = `
      /* ── Overlay root ── */
      #naukri-autofill-overlay {
        position: fixed;
        top: 0; left: 0;
        width: 100vw; height: 100vh;
        z-index: 2147483647;
        pointer-events: all;
        background: transparent;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      /* ── Backdrop ── */
      .naf-backdrop {
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.55);
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
      }

      /* ── Modal card ── */
      .naf-modal {
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        width: 440px;
        max-width: calc(100vw - 48px);
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-sizing: border-box;
      }

      /* ── Header ── */
      .naf-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 13px 18px;
        background: #4f46e5;
        flex-shrink: 0;
      }
      .naf-title {
        font-size: 14px;
        font-weight: 600;
        color: #fff;
        font-family: inherit;
      }
      .naf-close {
        background: rgba(255,255,255,0.2);
        border: none;
        border-radius: 50%;
        width: 26px; height: 26px;
        font-size: 18px;
        cursor: pointer;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        line-height: 1;
        flex-shrink: 0;
      }
      .naf-close:hover { background: rgba(255,255,255,0.35); }

      /* ── Body ── */
      .naf-body {
        padding: 16px 18px 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        overflow-y: auto;
        box-sizing: border-box;
      }

      /* ── Question bubble ── */
      .naf-question {
        padding: 10px 14px;
        background: #f3f4f6;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        color: #1f2937;
        line-height: 1.5;
        font-family: inherit;
        box-sizing: border-box;
      }

      /* ── Text answer ── */
      .naf-textarea {
        width: 100%;
        min-height: 80px;
        max-height: 130px;
        padding: 10px 12px;
        border: 1.5px solid #d1d5db;
        border-radius: 8px;
        font-size: 14px;
        font-family: inherit;
        resize: vertical;
        box-sizing: border-box;
        line-height: 1.5;
        outline: none;
        color: #111827;
        display: block;
      }
      .naf-textarea:focus {
        border-color: #4f46e5;
        box-shadow: 0 0 0 3px rgba(79,70,229,0.12);
      }

      /* ── Hint line ── */
      .naf-hint {
        margin: 0;
        font-size: 11px;
        color: #9ca3af;
        font-family: inherit;
        text-align: right;
      }

      /* ── Radio / checkbox options ── */
      .naf-options {
        display: flex;
        flex-direction: column;
        gap: 4px;
        border: 1.5px solid #e5e7eb;
        border-radius: 8px;
        padding: 6px;
        box-sizing: border-box;
        overflow-y: auto;
        max-height: 260px;
      }
      .naf-opt {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 6px;
        cursor: pointer;
        font-family: inherit;
      }
      .naf-opt:hover { background: #f5f3ff; }
      .naf-ctrl {
        width: 16px; height: 16px;
        accent-color: #4f46e5;
        cursor: pointer;
        flex-shrink: 0;
        margin: 0;
      }
      .naf-opt-text {
        font-size: 14px;
        color: #1f2937;
        line-height: 1.4;
        cursor: pointer;
      }

      /* ── Footer ── */
      .naf-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 12px 18px;
        border-top: 1px solid #f3f4f6;
        flex-shrink: 0;
      }
      .naf-btn-cancel {
        padding: 8px 16px;
        background: #f9fafb;
        color: #374151;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .naf-btn-cancel:hover { background: #f3f4f6; }
      .naf-btn-fill {
        padding: 8px 20px;
        background: #4f46e5;
        color: #fff;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
      }
      .naf-btn-fill:hover { background: #4338ca; }

      /* ── Toast ── */
      #naukri-autofill-toast {
        position: fixed;
        bottom: 22px;
        right: 22px;
        z-index: 2147483646;
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 11px 15px;
        background: #ecfdf5;
        color: #065f46;
        border: 1px solid #a7f3d0;
        border-radius: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 6px 20px rgba(0,0,0,0.14);
        max-width: 320px;
        line-height: 1.4;
        opacity: 0;
        transform: translateY(6px);
        transition: opacity 0.2s, transform 0.2s;
        pointer-events: none;
      }
      #naukri-autofill-toast.naf-show { opacity: 1; transform: translateY(0); }
    `;
    document.head.appendChild(s);
  }

  // ─── Message listener (popup) ─────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg.type === 'GET_STATUS')   sendResponse({ active: true, qnaCount: Object.keys(qnaStore).length });
    if (msg.type === 'RELOAD_STORAGE') { loadStorage(() => sendResponse({ ok: true })); return true; }
  });

  // ─── Init ─────────────────────────────────────────────────────────────────
  try {
    loadStorage(() => {
      try { startWatching(); check(); }
      catch (e) { console.warn('[NAF] Init error:', e); }
    });
  } catch (e) { console.warn('[NAF] Load error:', e); }

})();
