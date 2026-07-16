// YouTube CommentBot — popup
// 純設定介面：選擇供應商、各自儲存 API Key 與模型、測試金鑰。
// 依賴 providers.js 提供的 PROVIDERS / PROVIDER_ORDER / normalizeSettings（於本檔前載入）。

'use strict';

const $ = (id) => document.getElementById(id);

let state = normalizeSettings(null);
let saveTimer = null;

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
  hint.textContent = `到 ${p.label} 主控台取得`;
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

async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  state = normalizeSettings(settings);
  renderProviders();
  renderProviderUI();
  $('persona').value = state.persona;
  $('autoOnFocus').checked = state.autoOnFocus;
}

async function testKey() {
  // 確保目前供應商的金鑰與模型已存檔（background 會讀取當前供應商）
  state.apiKeys[state.provider] = $('apiKey').value.trim();
  state.models[state.provider] = $('model').value;
  await save(); // 必須等寫入完成，background 才讀得到最新金鑰

  setKeyStatus('測試中…');
  const resp = await chrome.runtime.sendMessage({ type: 'TEST_KEY' });
  if (resp?.ok) {
    setKeyStatus('✓ 連線成功', 'ok');
  } else {
    setKeyStatus(`✗ ${resp?.error || '測試失敗'}`, 'err');
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

  $('autoOnFocus').addEventListener('change', () => {
    state.autoOnFocus = $('autoOnFocus').checked;
    save();
  });

  $('testKey').addEventListener('click', testKey);
  $('toggleKey').addEventListener('click', toggleKeyVisibility);

  // popup 關閉/隱藏前，把仍在 debounce 中的變更（如人設）立刻寫入，避免遺失
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
  });
});
