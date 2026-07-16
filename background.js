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

function buildSystemPrompt(settings, ctx) {
  let prompt = `你是 YouTube 頻道${ctx.channelName ? `「${ctx.channelName}」` : ''}的頻道主，正在回覆自己影片${ctx.videoTitle ? `「${ctx.videoTitle}」` : ''}下方的一則觀眾留言。

回覆規則：
- 使用留言者所使用的語言回覆（留言是英文就用英文，中文就用中文，依此類推）
- 語氣自然、友善，像真人頻道主，長度 1~3 句話，不要太長
- 不要加 hashtag、不要署名、不要提到你是 AI 或自動回覆
- 適度感謝支持、回應留言的重點；若留言提出問題，簡短回答`;

  if (settings.persona && settings.persona.trim()) {
    prompt += `\n\n頻道主的補充設定（請遵守）：\n${settings.persona.trim()}`;
  }
  return prompt;
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
  const system = buildSystemPrompt(settings, {
    channelName: payload.channelName || '',
    videoTitle: payload.videoTitle || '',
  });
  const user = `留言者：${payload.author || '(未知)'}\n留言內容：\n${payload.text}\n\n請直接輸出你要回覆的內容（不要加引號、不要加任何前綴說明）。`;

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
