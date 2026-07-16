// CommentBot — popup
// 設定介面：供應商 / 金鑰 / 模型、回覆模式、留言篩選、提示詞範本、生效平台、語言。
// 依賴 providers.js（於本檔前載入）：PROVIDERS / PROVIDER_ORDER / normalizeSettings /
// DEFAULT_*_PROMPT / I18N / t。

'use strict';

const $ = (id) => document.getElementById(id);

let state = normalizeSettings(null);
let saveTimer = null;

// 取介面文字（依目前介面語言），vars 可代入 {name} 佔位
const T = (key, vars) => t(key, state.uiLang, vars);

// 範本是否仍為（任一語言的）預設值 → 視為使用者未自訂
function isDefaultPrompt(kind, val) {
  return val === t(`default_${kind}_prompt`, 'en') || val === t(`default_${kind}_prompt`, 'zh');
}

function currentProvider() {
  return PROVIDERS[state.provider];
}

function save() {
  return chrome.storage.local.set({ settings: state });
}

function saveDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

// 套用介面語言：填入所有標記了 data-i18n* 的靜態文字（HTML 內含標記者用 data-i18n-html）。
function applyI18n() {
  const lang = state.uiLang;
  document.documentElement.lang = lang === 'zh' ? 'zh-TW' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n, lang);
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml, lang); // 內容為自訂常數（非使用者輸入），可安全用 innerHTML
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh, lang);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle, lang);
  });
}

function setKeyStatus(text, kind) {
  const el = $('keyStatus');
  el.textContent = text || '';
  el.className = 'hint' + (kind ? ` ${kind}` : '');
}

function renderProviders() {
  const sel = $('provider');
  sel.innerHTML = '';
  for (const id of PROVIDER_ORDER) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = PROVIDERS[id].label;
    sel.appendChild(o);
  }
  sel.value = state.provider;
}

function renderProviderUI() {
  const p = currentProvider();

  $('apiKey').value = state.apiKeys[state.provider] || '';
  $('apiKey').placeholder = p.keyPlaceholder;

  const hint = $('keyHint');
  hint.textContent = T('key_console', { label: p.label });
  hint.href = p.consoleUrl;

  const msel = $('model');
  msel.innerHTML = '';
  for (const m of p.models) {
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = m.label;
    msel.appendChild(o);
  }
  msel.value = state.models[state.provider] || p.defaultModel;

  setKeyStatus('', '');
}

function updateModeUI() {
  $('modeDesc').textContent = T('mdesc_' + state.mode);
  const danger = state.mode === 'lazy' || state.mode === 'crazy';
  $('modeWarn').hidden = !danger;
}

function validateFilter() {
  const elt = $('filterStatus');
  const raw = state.filterPattern || '';
  if (!raw.trim()) {
    elt.textContent = T('flt_off');
    elt.className = 'hint';
    return;
  }
  if (state.filterRegex) {
    try {
      new RegExp(raw, state.filterIgnoreCase ? 'i' : '');
      elt.textContent = T('flt_valid');
      elt.className = 'hint ok';
    } catch (e) {
      elt.textContent = T('flt_invalid', { msg: e.message });
      elt.className = 'hint err';
    }
  } else {
    elt.textContent = T('flt_plain', { pat: raw, ic: state.filterIgnoreCase ? T('flt_ic') : '' });
    elt.className = 'hint';
  }
}

async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  state = normalizeSettings(settings);
  $('uiLang').value = state.uiLang;
  applyI18n();
  renderProviders();
  renderProviderUI();
  $('persona').value = state.persona;
  $('mode').value = state.mode;
  $('systemPrompt').value = state.systemPrompt;
  $('userPrompt').value = state.userPrompt;
  $('filterPattern').value = state.filterPattern;
  $('filterRegex').checked = state.filterRegex;
  $('filterIgnoreCase').checked = state.filterIgnoreCase;
  $('platYoutube').checked = state.platforms.youtube;
  $('platFacebook').checked = state.platforms.facebook;
  updateModeUI();
  validateFilter();
}

async function testKey() {
  // 確保目前供應商的金鑰與模型已存檔（background 會讀取當前供應商）
  state.apiKeys[state.provider] = $('apiKey').value.trim();
  state.models[state.provider] = $('model').value;
  await save(); // 必須等寫入完成，background 才讀得到最新金鑰

  setKeyStatus(T('st_testing'));
  const resp = await chrome.runtime.sendMessage({ type: 'TEST_KEY' });
  if (resp?.ok) {
    setKeyStatus(T('st_test_ok'), 'ok');
  } else {
    setKeyStatus(`✗ ${resp?.error || ''}`.trim(), 'err');
  }
}

function toggleKeyVisibility() {
  const input = $('apiKey');
  input.type = input.type === 'password' ? 'text' : 'password';
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();

  $('provider').addEventListener('change', () => {
    state.provider = $('provider').value;
    renderProviderUI();
    save();
  });

  $('apiKey').addEventListener('input', () => {
    state.apiKeys[state.provider] = $('apiKey').value.trim();
    setKeyStatus('', '');
    save(); // 金鑰即時存檔（不 debounce），避免 popup 關太快而遺失
  });

  $('model').addEventListener('change', () => {
    state.models[state.provider] = $('model').value;
    save();
  });

  $('persona').addEventListener('input', () => {
    state.persona = $('persona').value;
    saveDebounced();
  });

  $('systemPrompt').addEventListener('input', () => {
    state.systemPrompt = $('systemPrompt').value;
    saveDebounced();
  });

  $('userPrompt').addEventListener('input', () => {
    state.userPrompt = $('userPrompt').value;
    saveDebounced();
  });

  $('resetSystem').addEventListener('click', () => {
    state.systemPrompt = t('default_system_prompt', state.uiLang);
    $('systemPrompt').value = state.systemPrompt;
    save();
  });

  $('resetUser').addEventListener('click', () => {
    state.userPrompt = t('default_user_prompt', state.uiLang);
    $('userPrompt').value = state.userPrompt;
    save();
  });

  $('filterPattern').addEventListener('input', () => {
    state.filterPattern = $('filterPattern').value;
    validateFilter();
    saveDebounced();
  });

  $('filterRegex').addEventListener('change', () => {
    state.filterRegex = $('filterRegex').checked;
    validateFilter();
    save();
  });

  $('filterIgnoreCase').addEventListener('change', () => {
    state.filterIgnoreCase = $('filterIgnoreCase').checked;
    validateFilter();
    save();
  });

  $('platYoutube').addEventListener('change', () => {
    state.platforms.youtube = $('platYoutube').checked;
    save();
  });

  $('platFacebook').addEventListener('change', () => {
    state.platforms.facebook = $('platFacebook').checked;
    save();
  });

  $('uiLang').addEventListener('change', () => {
    const next = $('uiLang').value;
    // 範本未自訂時，隨介面語言換成該語言的預設（已自訂則保留）
    if (isDefaultPrompt('system', state.systemPrompt)) {
      state.systemPrompt = t('default_system_prompt', next);
      $('systemPrompt').value = state.systemPrompt;
    }
    if (isDefaultPrompt('user', state.userPrompt)) {
      state.userPrompt = t('default_user_prompt', next);
      $('userPrompt').value = state.userPrompt;
    }
    state.uiLang = next;
    applyI18n();
    renderProviderUI(); // keyhint 連結文字隨介面語言
    updateModeUI(); // modeDesc 隨介面語言
    validateFilter(); // 篩選狀態隨介面語言
    save();
  });

  $('mode').addEventListener('change', () => {
    const next = $('mode').value;
    // 切到會自動送出的模式時，做一次明確確認（避免誤選）
    if ((next === 'lazy' || next === 'crazy') && next !== state.mode) {
      const name = T('mode_name_' + next);
      const ok = confirm(T('confirm_autosubmit').replace('{name}', name));
      if (!ok) {
        $('mode').value = state.mode; // 還原
        return;
      }
    }
    state.mode = next;
    updateModeUI();
    save();
  });

  $('testKey').addEventListener('click', testKey);
  $('toggleKey').addEventListener('click', toggleKeyVisibility);

  // popup 關閉/隱藏前，把仍在 debounce 中的變更（如人設）立刻寫入，避免遺失
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
  });
});
