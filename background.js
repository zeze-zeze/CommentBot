// CommentBot — background service worker
// 依使用者選擇的供應商（Claude / DeepSeek / ChatGPT / Gemini，或自訂端點）呼叫對應的 API。
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
  const p = ctx.platform;
  const lang = settings.uiLang; // 範本與其詞彙用「介面語言」；回覆語言由使用者在「補充指示」中指定
  const isZh = lang === 'zh';
  const persona = (settings.persona || '').trim();
  // 平台名稱與內容類型（影片／貼文／貼文）依平台選取，其餘供應商無關。
  const platformName = p === 'facebook' ? 'Facebook' : p === 'twitter' ? 'X' : 'YouTube';
  const ctKey = p === 'facebook' ? 'ct_post' : p === 'twitter' ? 'ct_tweet' : 'ct_video';
  // 標題／頻道主加引號（中文用「」、英文用 "..."；標題在英文範本需前置空白）。空值自然消失。
  const title = ctx.title ? (isZh ? `「${ctx.title}」` : ` "${ctx.title}"`) : '';
  const owner = ctx.owner ? (isZh ? `「${ctx.owner}」` : `"${ctx.owner}"`) : '';
  const vars = {
    platform: platformName,
    contentType: t(ctKey, lang),
    owner,
    title,
    author: ctx.author || t('author_unknown', lang),
    comment: ctx.text || '',
    補充提示: persona, // 中文變數名
    persona, // 英文別名（兩者同值）
  };

  const tpl = settings.systemPrompt || '';
  let system = renderTemplate(tpl, vars);
  // 若範本沒有用到 {{補充提示}}／{{persona}} 佔位、但有填人設 → 仍附加在最後（相容舊範本）。
  if (persona && !/\{\{\s*(補充提示|persona)\s*\}\}/.test(tpl)) {
    system += `\n\n${t('persona_prefix', lang)}\n${persona}`;
  }
  const user = renderTemplate(settings.userPrompt, vars);
  return { system, user };
}

async function handleGenerateReply(payload) {
  const settings = await getSettings();
  const providerId = settings.provider;
  const provider = PROVIDERS[providerId];
  const apiKey = (settings.apiKeys[providerId] || '').trim();
  // 自訂端點需要 URL（金鑰可留空給本機端點）；其餘供應商需要金鑰。
  let extra;
  if (provider.custom) {
    const url = (settings.customUrl || '').trim();
    if (!url) throw new Error(t('err_no_url', settings.uiLang));
    extra = { url };
  } else if (!apiKey) {
    throw new Error(t('err_no_key', settings.uiLang, { label: provider.label }));
  }

  const model = resolveModel(settings, providerId);
  const { system, user } = buildPrompts(settings, {
    platform: payload.platform || 'youtube',
    title: payload.title || '',
    owner: payload.owner || '',
    author: payload.author || '',
    text: payload.text || '',
  });

  const spec = provider.chat(apiKey, model, system, user, extra);

  let res;
  try {
    res = await fetch(spec.url, {
      method: 'POST',
      headers: spec.headers,
      body: JSON.stringify(spec.body),
    });
  } catch (e) {
    throw new Error(t('err_network', settings.uiLang, { msg: e.message }));
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(t('err_api', settings.uiLang, { msg: extractError(data, res.status) }));
  }

  const text = provider.extractReply(data);
  if (!text) throw new Error(t('err_empty', settings.uiLang));
  return text;
}

async function handleTestKey() {
  const settings = await getSettings();
  const providerId = settings.provider;
  const provider = PROVIDERS[providerId];
  const apiKey = (settings.apiKeys[providerId] || '').trim();

  let extra;
  if (provider.custom) {
    const url = (settings.customUrl || '').trim();
    if (!url) throw new Error(t('err_no_url', settings.uiLang));
    extra = { url, model: resolveModel(settings, providerId) };
  } else if (!apiKey) {
    throw new Error(t('err_no_key_input', settings.uiLang));
  }

  const spec = provider.testKey(apiKey, extra);
  let res;
  try {
    res = await fetch(spec.url, {
      method: spec.method || 'GET',
      headers: spec.headers,
      body: spec.body ? JSON.stringify(spec.body) : undefined,
    });
  } catch (e) {
    throw new Error(t('err_network', settings.uiLang, { msg: e.message }));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const msg = extractError(data, res.status);
    throw new Error(t(provider.custom ? 'err_test_failed' : 'err_key_invalid', settings.uiLang, { msg }));
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
