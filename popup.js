/**
 * Naukri AutoFill Assistant - Popup Script
 * Manages the Q&A library, custom Q&A addition, settings, import/export.
 */

const STORAGE_KEY = 'naukriQnA';
const SETTINGS_KEY = 'naukriSettings';

// ── State ─────────────────────────────────────────────────────────────────
let qnaStore = {};
let settings = { autoSubmit: true, notifications: true };
let currentFilter = 'all';
let currentSearchQuery = '';
let editingKey = null;        // key of Q&A being edited in modal
let confirmCallback = null;   // callback for confirm modal

// ── Load everything on open ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadAll(() => {
    applySettings();
    renderQnaList();
    updateCount();
  });
  bindEvents();
});

// ── Storage ───────────────────────────────────────────────────────────────
function loadAll(callback) {
  chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY], (result) => {
    qnaStore = result[STORAGE_KEY] || {};
    settings = Object.assign({ autoSubmit: true, notifications: true }, result[SETTINGS_KEY] || {});
    if (callback) callback();
  });
}

function saveQnA(callback) {
  chrome.storage.local.set({ [STORAGE_KEY]: qnaStore }, () => {
    updateCount();
    notifyContentScript();
    if (callback) callback();
  });
}

function saveSettings(callback) {
  chrome.storage.local.set({ [SETTINGS_KEY]: settings }, callback);
}

function notifyContentScript() {
  // Tell the content script to reload its in-memory store
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'RELOAD_STORAGE' }).catch(() => {});
    }
  });
}

// ── Normalize (same as content.js) ───────────────────────────────────────
function normalizeQuestion(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Update count badge ────────────────────────────────────────────────────
function updateCount() {
  document.getElementById('qna-count').textContent = Object.keys(qnaStore).length;
}

// ── Apply settings to UI ──────────────────────────────────────────────────
function applySettings() {
  document.getElementById('setting-auto-submit').checked = settings.autoSubmit !== false;
  document.getElementById('setting-notifications').checked = settings.notifications !== false;
}

// ── Render Q&A list ───────────────────────────────────────────────────────
function renderQnaList() {
  const container = document.getElementById('qna-list');
  const emptyState = document.getElementById('empty-state');

  const entries = Object.entries(qnaStore);

  // Apply filter
  let filtered = entries.filter(([key, val]) => {
    if (currentFilter !== 'all' && val.type !== currentFilter) return false;
    if (currentSearchQuery) {
      const q = (val.originalText || key).toLowerCase();
      const a = formatAnswerText(val.answer).toLowerCase();
      if (!q.includes(currentSearchQuery) && !a.includes(currentSearchQuery)) return false;
    }
    return true;
  });

  // Sort by savedAt descending (newest first)
  filtered.sort((a, b) => {
    const dateA = new Date(a[1].savedAt || 0);
    const dateB = new Date(b[1].savedAt || 0);
    return dateB - dateA;
  });

  // Clear previous cards (keep empty-state)
  Array.from(container.querySelectorAll('.qna-card')).forEach(el => el.remove());

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    emptyState.querySelector('.empty-title').textContent =
      entries.length === 0 ? 'No questions saved yet' : 'No results found';
    emptyState.querySelector('.empty-desc').textContent =
      entries.length === 0
        ? 'Start applying to jobs on Naukri. When new questions appear, the extension will ask you to answer them — and save them here automatically.'
        : 'Try a different search term or filter.';
    return;
  }

  emptyState.classList.add('hidden');

  filtered.forEach(([key, val]) => {
    const card = buildQnaCard(key, val);
    container.appendChild(card);
  });
}

function buildQnaCard(key, val) {
  const typeLabels = {
    single: 'Single Choice',
    multi: 'Multi Choice',
    short: 'Short Answer',
    long: 'Description',
  };
  const badgeClass = {
    single: 'badge-single',
    multi: 'badge-multi',
    short: 'badge-short',
    long: 'badge-long',
  };

  const card = document.createElement('div');
  card.className = 'qna-card';
  card.dataset.key = key;

  const answerDisplay = formatAnswerText(val.answer);
  const dateDisplay = val.savedAt
    ? new Date(val.savedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Unknown date';

  card.innerHTML = `
    <div class="qna-card-header">
      <div class="qna-question">${escapeHtml(val.originalText || key)}</div>
      <span class="qna-type-badge ${badgeClass[val.type] || 'badge-short'}">
        ${typeLabels[val.type] || val.type}
      </span>
    </div>
    <div class="qna-answer">${escapeHtml(answerDisplay)}</div>
    <div class="qna-card-footer">
      <span class="qna-date">📅 ${dateDisplay}</span>
      <div class="qna-card-actions">
        <button class="icon-btn icon-btn-edit" title="Edit answer" data-action="edit" data-key="${escapeHtml(key)}">✏️</button>
        <button class="icon-btn icon-btn-delete" title="Delete" data-action="delete" data-key="${escapeHtml(key)}">🗑️</button>
      </div>
    </div>
  `;

  return card;
}

function formatAnswerText(answer) {
  if (Array.isArray(answer)) return answer.join(', ');
  return String(answer || '');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(text)));
  return div.innerHTML;
}

// ── Bind all events ───────────────────────────────────────────────────────
function bindEvents() {

  // ── Support modal
  document.getElementById('btn-support').addEventListener('click', () => {
    document.getElementById('support-modal').classList.remove('hidden');
  });
  document.getElementById('support-modal-close').addEventListener('click', () => {
    document.getElementById('support-modal').classList.add('hidden');
  });
  document.getElementById('support-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('support-modal')) {
      document.getElementById('support-modal').classList.add('hidden');
    }
  });

  // ── Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // ── Search
  document.getElementById('search-input').addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.trim().toLowerCase();
    renderQnaList();
  });

  // ── Filter chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      renderQnaList();
    });
  });

  // ── Export JSON
  document.getElementById('btn-export-json').addEventListener('click', () => {
    const jsonPanel = document.getElementById('json-panel');
    const jsonOutput = document.getElementById('json-output');
    jsonPanel.classList.toggle('hidden');
    if (!jsonPanel.classList.contains('hidden')) {
      jsonOutput.value = JSON.stringify(qnaStore, null, 2);
    }
  });

  document.getElementById('btn-copy-json').addEventListener('click', () => {
    const jsonOutput = document.getElementById('json-output');
    jsonOutput.select();
    document.execCommand('copy');
    const btn = document.getElementById('btn-copy-json');
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
  });

  document.getElementById('btn-close-json').addEventListener('click', () => {
    document.getElementById('json-panel').classList.add('hidden');
  });

  // ── Clear All (from toolbar)
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    const count = Object.keys(qnaStore).length;
    if (count === 0) return;
    showConfirm(
      'Clear All Q&A',
      `Are you sure you want to delete all ${count} saved Q&A entries? This cannot be undone.`,
      'Delete All',
      () => {
        qnaStore = {};
        saveQnA(() => renderQnaList());
      }
    );
  });

  // ── Q&A card actions (delegated)
  document.getElementById('qna-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const key = btn.dataset.key;
    if (btn.dataset.action === 'edit') openEditModal(key);
    if (btn.dataset.action === 'delete') confirmDeleteQna(key);
  });

  // ── Custom type selector → dynamic answer input
  document.getElementById('custom-type').addEventListener('change', updateCustomAnswerInput);
  updateCustomAnswerInput(); // init

  // ── Add custom option button
  document.getElementById('btn-add-option').addEventListener('click', () => {
    addOptionRow('options-list', 'custom');
  });

  // ── Save custom Q&A
  document.getElementById('btn-save-custom').addEventListener('click', saveCustomQna);

  // ── Settings toggles
  document.getElementById('setting-auto-submit').addEventListener('change', (e) => {
    settings.autoSubmit = e.target.checked;
    saveSettings();
  });
  document.getElementById('setting-notifications').addEventListener('change', (e) => {
    settings.notifications = e.target.checked;
    saveSettings();
  });

  // ── Import JSON: Merge
  document.getElementById('btn-import-json').addEventListener('click', () => {
    importJson(false);
  });

  // ── Import JSON: Replace
  document.getElementById('btn-import-replace').addEventListener('click', () => {
    showConfirm(
      'Import & Replace',
      'This will DELETE all your current Q&A and replace with the imported data. Are you sure?',
      'Replace All',
      () => importJson(true)
    );
  });

  // ── Delete all from settings
  document.getElementById('btn-delete-all-settings').addEventListener('click', () => {
    showConfirm(
      'Delete All Data',
      'This will permanently delete all saved Q&A entries and reset settings. Are you sure?',
      'Delete Everything',
      () => {
        qnaStore = {};
        settings = { autoSubmit: true, notifications: true };
        chrome.storage.local.clear(() => {
          applySettings();
          renderQnaList();
          updateCount();
          notifyContentScript();
        });
      }
    );
  });

  // ── Edit modal: type change
  document.getElementById('modal-type').addEventListener('change', updateModalAnswerInput);

  // ── Edit modal: add option
  document.getElementById('btn-modal-add-option').addEventListener('click', () => {
    addOptionRow('modal-options-list', 'modal');
  });

  // ── Edit modal: close/cancel/save
  document.getElementById('modal-close').addEventListener('click', closeEditModal);
  document.getElementById('modal-cancel').addEventListener('click', closeEditModal);
  document.getElementById('modal-save').addEventListener('click', saveEditModal);

  // ── Confirm modal: cancel/ok
  document.getElementById('confirm-cancel').addEventListener('click', () => {
    closeConfirm();
  });
  document.getElementById('confirm-ok').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    closeConfirm();
  });

  // Close modals on backdrop click
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('edit-modal')) closeEditModal();
  });
  document.getElementById('confirm-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('confirm-modal')) closeConfirm();
  });
}

// ── Custom Q&A: Dynamic answer input ─────────────────────────────────────
function updateCustomAnswerInput() {
  const type = document.getElementById('custom-type').value;

  const shortInput = document.getElementById('custom-answer-short');
  const longInput = document.getElementById('custom-answer-long');
  const optionsDiv = document.getElementById('custom-answer-options');
  const optionsHint = document.getElementById('options-hint');

  shortInput.classList.add('hidden');
  longInput.classList.add('hidden');
  optionsDiv.classList.add('hidden');

  if (type === 'short') {
    shortInput.classList.remove('hidden');
  } else if (type === 'long') {
    longInput.classList.remove('hidden');
  } else if (type === 'single') {
    optionsDiv.classList.remove('hidden');
    optionsHint.textContent = 'Select the option that is your answer (radio).';
    // Ensure at least 2 option rows
    const list = document.getElementById('options-list');
    if (list.children.length === 0) {
      addOptionRow('options-list', 'custom');
      addOptionRow('options-list', 'custom');
    }
    // Re-render as radio
    refreshOptionInputTypes('options-list', 'radio', 'custom-single');
  } else if (type === 'multi') {
    optionsDiv.classList.remove('hidden');
    optionsHint.textContent = 'Check all options that are your answer (checkboxes).';
    const list = document.getElementById('options-list');
    if (list.children.length === 0) {
      addOptionRow('options-list', 'custom');
      addOptionRow('options-list', 'custom');
    }
    refreshOptionInputTypes('options-list', 'checkbox', 'custom-multi');
  }
}

function refreshOptionInputTypes(listId, inputType, groupName) {
  const rows = document.querySelectorAll(`#${listId} .option-row`);
  rows.forEach(row => {
    const sel = row.querySelector('input[type="radio"], input[type="checkbox"]');
    if (sel) {
      sel.type = inputType;
      sel.name = groupName;
    }
  });
}

function addOptionRow(listId, prefix) {
  const list = document.getElementById(listId);
  const type = prefix === 'custom'
    ? (document.getElementById('custom-type')?.value || 'single')
    : (document.getElementById('modal-type')?.value || 'single');

  const inputType = type === 'multi' ? 'checkbox' : 'radio';
  const groupName = `${prefix}-${type}`;

  const row = document.createElement('div');
  row.className = 'option-row';
  row.innerHTML = `
    <input type="${inputType}" name="${groupName}" title="Select as answer">
    <input type="text" placeholder="Option text..." class="option-text">
    <button class="remove-option" title="Remove">×</button>
  `;

  row.querySelector('.remove-option').addEventListener('click', () => {
    row.remove();
  });

  list.appendChild(row);
}

// ── Save Custom Q&A ───────────────────────────────────────────────────────
function saveCustomQna() {
  const questionText = document.getElementById('custom-question').value.trim();
  const type = document.getElementById('custom-type').value;
  const feedback = document.getElementById('save-feedback');

  if (!questionText) {
    showFeedback(feedback, 'Please enter a question.', 'error');
    return;
  }

  const answer = getCustomAnswer(type);
  if (answer === null || answer === '' || (Array.isArray(answer) && answer.length === 0)) {
    showFeedback(feedback, 'Please provide an answer.', 'error');
    return;
  }

  const normalizedKey = normalizeQuestion(questionText);

  // Check for duplicate
  if (qnaStore[normalizedKey]) {
    showFeedback(feedback, '⚠️ A Q&A with this question already exists. Edit it from the Q&A Library tab.', 'error');
    return;
  }

  qnaStore[normalizedKey] = {
    type,
    answer,
    originalText: questionText,
    savedAt: new Date().toISOString(),
    custom: true,
  };

  saveQnA(() => {
    showFeedback(feedback, '✅ Q&A saved successfully!', 'success');
    // Reset form
    document.getElementById('custom-question').value = '';
    document.getElementById('custom-answer-short').value = '';
    document.getElementById('custom-answer-long').value = '';
    document.getElementById('options-list').innerHTML = '';
    document.getElementById('custom-type').value = 'short';
    updateCustomAnswerInput();
  });
}

function getCustomAnswer(type, prefix = 'custom') {
  if (type === 'short') {
    return document.getElementById('custom-answer-short').value.trim() || null;
  } else if (type === 'long') {
    return document.getElementById('custom-answer-long').value.trim() || null;
  } else if (type === 'single') {
    const selected = document.querySelector(`#options-list input[type="radio"]:checked`);
    return selected ? selected.closest('.option-row').querySelector('.option-text').value.trim() : null;
  } else if (type === 'multi') {
    const checked = document.querySelectorAll(`#options-list input[type="checkbox"]:checked`);
    const answers = Array.from(checked).map(cb => cb.closest('.option-row').querySelector('.option-text').value.trim()).filter(Boolean);
    return answers.length > 0 ? answers : null;
  }
  return null;
}

// ── Edit Modal ─────────────────────────────────────────────────────────────
function openEditModal(key) {
  editingKey = key;
  const val = qnaStore[key];
  if (!val) return;

  document.getElementById('modal-question-display').textContent = val.originalText || key;
  document.getElementById('modal-type').value = val.type || 'short';

  updateModalAnswerInput(val);

  document.getElementById('edit-modal').classList.remove('hidden');
}

function updateModalAnswerInput(existingVal) {
  // existingVal may be an Event or an actual value object
  const isEvent = existingVal instanceof Event || existingVal === undefined;
  const val = (!isEvent && existingVal) ? existingVal : (editingKey ? qnaStore[editingKey] : null);

  const type = document.getElementById('modal-type').value;

  const shortInput = document.getElementById('modal-answer-short');
  const longInput = document.getElementById('modal-answer-long');
  const optionsDiv = document.getElementById('modal-answer-options');

  shortInput.classList.add('hidden');
  longInput.classList.add('hidden');
  optionsDiv.classList.add('hidden');

  const optionsList = document.getElementById('modal-options-list');
  optionsList.innerHTML = '';

  if (type === 'short') {
    shortInput.classList.remove('hidden');
    shortInput.value = (val && (type === val.type)) ? String(val.answer || '') : '';
  } else if (type === 'long') {
    longInput.classList.remove('hidden');
    longInput.value = (val && (type === val.type)) ? String(val.answer || '') : '';
  } else if (type === 'single' || type === 'multi') {
    optionsDiv.classList.remove('hidden');
    const inputType = type === 'multi' ? 'checkbox' : 'radio';
    const groupName = `modal-${type}`;

    // If we have existing options of the same type, pre-populate
    if (val && val.type === type) {
      const existingOptions = getExistingOptions(val);
      const existingAnswer = Array.isArray(val.answer) ? val.answer : [val.answer];

      existingOptions.forEach(optText => {
        const row = document.createElement('div');
        row.className = 'option-row';
        const isSelected = existingAnswer.some(a => normalizeQuestion(a) === normalizeQuestion(optText));
        row.innerHTML = `
          <input type="${inputType}" name="${groupName}" ${isSelected ? 'checked' : ''} title="Select as answer">
          <input type="text" class="option-text" value="${escapeHtml(optText)}" placeholder="Option text...">
          <button class="remove-option" title="Remove">×</button>
        `;
        row.querySelector('.remove-option').addEventListener('click', () => row.remove());
        optionsList.appendChild(row);
      });
    }

    // Ensure at least 2 rows
    if (optionsList.children.length < 2) {
      addOptionRow('modal-options-list', 'modal');
      if (optionsList.children.length < 2) addOptionRow('modal-options-list', 'modal');
    }
  }
}

function getExistingOptions(val) {
  // Return distinct list of options. For single: [answer]. For multi: answer array.
  // We don't store all options, only the selected ones.
  // So we use whatever we have.
  if (Array.isArray(val.answer)) return [...val.answer];
  return val.answer ? [String(val.answer)] : [];
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
  editingKey = null;
}

function saveEditModal() {
  if (!editingKey) return;

  const type = document.getElementById('modal-type').value;
  let answer;

  if (type === 'short') {
    answer = document.getElementById('modal-answer-short').value.trim();
    if (!answer) { alert('Please enter an answer.'); return; }
  } else if (type === 'long') {
    answer = document.getElementById('modal-answer-long').value.trim();
    if (!answer) { alert('Please enter an answer.'); return; }
  } else if (type === 'single') {
    const selected = document.querySelector('#modal-options-list input[type="radio"]:checked');
    if (!selected) { alert('Please select an option.'); return; }
    answer = selected.closest('.option-row').querySelector('.option-text').value.trim();
  } else if (type === 'multi') {
    const checked = document.querySelectorAll('#modal-options-list input[type="checkbox"]:checked');
    answer = Array.from(checked).map(cb => cb.closest('.option-row').querySelector('.option-text').value.trim()).filter(Boolean);
    if (answer.length === 0) { alert('Please select at least one option.'); return; }
  }

  qnaStore[editingKey] = {
    ...qnaStore[editingKey],
    type,
    answer,
    updatedAt: new Date().toISOString(),
  };

  saveQnA(() => {
    renderQnaList();
    closeEditModal();
  });
}

// ── Delete Q&A ────────────────────────────────────────────────────────────
function confirmDeleteQna(key) {
  const val = qnaStore[key];
  const questionPreview = val ? (val.originalText || key) : key;
  const preview = questionPreview.length > 60 ? questionPreview.substring(0, 60) + '…' : questionPreview;

  showConfirm(
    'Delete Q&A',
    `Delete this entry?\n\n"${preview}"`,
    'Delete',
    () => {
      delete qnaStore[key];
      saveQnA(() => renderQnaList());
    }
  );
}

// ── Import JSON ───────────────────────────────────────────────────────────
function importJson(replace) {
  const raw = document.getElementById('import-json').value.trim();
  const feedback = document.getElementById('import-feedback');

  if (!raw) {
    showFeedback(feedback, 'Please paste JSON data first.', 'error');
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    showFeedback(feedback, '❌ Invalid JSON. Please check the format.', 'error');
    return;
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    showFeedback(feedback, '❌ Invalid format. Expected a JSON object.', 'error');
    return;
  }

  const count = Object.keys(parsed).length;

  if (replace) {
    qnaStore = parsed;
  } else {
    // Merge: imported data takes priority
    qnaStore = Object.assign({}, qnaStore, parsed);
  }

  saveQnA(() => {
    renderQnaList();
    document.getElementById('import-json').value = '';
    showFeedback(feedback, `✅ Imported ${count} entries successfully!`, 'success');
  });
}

// ── Confirm Modal ─────────────────────────────────────────────────────────
function showConfirm(title, message, okLabel, callback) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-ok').textContent = okLabel || 'Confirm';
  confirmCallback = callback;
  document.getElementById('confirm-modal').classList.remove('hidden');
}

function closeConfirm() {
  document.getElementById('confirm-modal').classList.add('hidden');
  confirmCallback = null;
}

// ── Feedback Helper ───────────────────────────────────────────────────────
function showFeedback(el, message, type) {
  el.textContent = message;
  el.className = `save-feedback ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => {
    el.classList.add('hidden');
  }, 4000);
}
