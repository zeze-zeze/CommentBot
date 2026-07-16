// YouTube CommentBot — background service worker
// 依使用者選擇的供應商（Claude / DeepSeek / ChatGPT）呼叫對應的 API。
// 各供應商的端點、標頭、請求 / 回應格式集中在 providers.js。在 service worker
// 中發送請求（搭配 host_permissions）可避開 YouTube 頁面本身的 CSP / CORS 限制。

'use strict';

importScripts('providers.js'); // 提供 PROVIDERS / normalizeSettings / resolveModel / extractError

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return normalizeSettings(settings);
}

// 依使用者可自訂的提示詞範本組出 system / user 兩段（動態值以 {{變數}} 代入）。
// persona（頻道主人設）仍會在 system 範本之後附加，作為快速補充指示。
function buildPrompts(settings, ctx) {
  const isFb = ctx.platform === 'facebook';
  const persona = (settings.persona || '').trim();
  const vars = {
    platform: isFb ? 'Facebook' : 'YouTube',
    contentType: isFb ? '貼文' : '影片',
    owner: ctx.owner ? `「${ctx.owner}」` : '',
    title: ctx.title ? `「${ctx.title}」` : '',
    author: ctx.author || '(未知)',
    comment: ctx.text || '',
    補充提示: persona,
  };

  const tpl = settings.systemPrompt || '';
  let system = renderTemplate(tpl, vars);
  // 若範本沒有用到 {{補充提示}} 佔位、但有填人設 → 仍附加在最後（相容未含此變數的舊範本）。
  if (persona && !/\{\{\s*補充提示\s*\}\}/.test(tpl)) {
    system += `\n\n補充設定（請遵守）：\n${persona}`;
  }
  const user = renderTemplate(settings.userPrompt, vars);
  return { system, user };
}

async function handleGenerateReply(payload) {
  const settings = await getSettings();
  const providerId = settings.provider;
  const provider = PROVIDERS[providerId];
  const apiKey = (settings.apiKeys[providerId] || '').trim();
  if (!apiKey) {
    throw new Error(`尚未設定 ${provider.label} 的 API Key（請點擴充功能圖示進行設定）`);
  }

  const model = resolveModel(settings, providerId);
  const { system, user } = buildPrompts(settings, {
    platform: payload.platform || 'youtube',
    title: payload.title || '',
    owner: payload.owner || '',
    author: payload.author || '',
    text: payload.text || '',
  });

  const spec = provider.chat(apiKey, model, system, user);

  let res;
  try {
    res = await fetch(spec.url, {
      method: 'POST',
      headers: spec.headers,
      body: JSON.stringify(spec.body),
    });
  } catch (e) {
    throw new Error(`網路連線失敗：${e.message}`);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`API 錯誤：${extractError(data, res.status)}`);
  }

  const text = provider.extractReply(data);
  if (!text) throw new Error('API 回傳了空白內容');
  return text;
}

async function handleTestKey() {
  const settings = await getSettings();
  const providerId = settings.provider;
  const provider = PROVIDERS[providerId];
  const apiKey = (settings.apiKeys[providerId] || '').trim();
  if (!apiKey) throw new Error('尚未輸入 API Key');

  const spec = provider.testKey(apiKey);
  let res;
  try {
    res = await fetch(spec.url, { headers: spec.headers });
  } catch (e) {
    throw new Error(`網路連線失敗：${e.message}`);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(`${extractError(data, res.status)}（API Key 可能無效）`);
  }
  return true;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'GENERATE_REPLY') {
    handleGenerateReply(msg.payload || {})
      .then((reply) => sendResponse({ ok: true, reply }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true; // 非同步回覆
  }
  if (msg?.type === 'TEST_KEY') {
    handleTestKey()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  return false;
});
