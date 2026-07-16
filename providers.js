// providers.js — 多家 AI 供應商的請求 / 解析設定（純資料 + 純函式，無 chrome / DOM 相依）。
// 三個執行環境共用同一份設定，避免重複與不一致：
//   - background.js（service worker）：importScripts('providers.js')
//   - popup.html：<script src="providers.js"></script>
//   - content.js：manifest content_scripts.js 中列在 content.js 之前
// 為了在上述三種環境都能被其他檔案取用，最後統一掛到 globalThis。

'use strict';

const PROVIDERS = {
  anthropic: {
    label: 'Claude（Anthropic）',
    keyPlaceholder: 'sk-ant-...',
    consoleUrl: 'https://console.anthropic.com/',
    defaultModel: 'claude-haiku-4-5',
    models: [
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5（快速・便宜）' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5（品質較高）' },
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8（最高品質）' },
    ],
    // Anthropic Messages API：system 為頂層欄位；新模型移除 sampling 參數（送 temperature 會 400）。
    chat(apiKey, model, system, user) {
      const body = {
        model,
        max_tokens: 2048,
        system,
        messages: [{ role: 'user', content: user }],
      };
      // Sonnet 5 省略 thinking 會預設啟用 adaptive thinking（多花 token）→ 明確關閉。
      // Opus 4.8 / Haiku 4.5 省略時本來就不思考。
      if (model === 'claude-sonnet-5') body.thinking = { type: 'disabled' };
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body,
      };
    },
    extractReply(data) {
      return (data?.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
    },
    testKey(apiKey) {
      return {
        url: 'https://api.anthropic.com/v1/models?limit=1',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      };
    },
  },

  deepseek: {
    label: 'DeepSeek',
    keyPlaceholder: 'sk-...',
    consoleUrl: 'https://platform.deepseek.com/',
    defaultModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat（快速・便宜）' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner（推理・品質較高）' },
    ],
    // OpenAI 相容格式：system 放進 messages。溫度 1.3 為 DeepSeek 官方「一般對話」建議
    // （deepseek-reasoner 會忽略 temperature，送了也無妨）。
    chat(apiKey, model, system, user) {
      return {
        url: 'https://api.deepseek.com/chat/completions',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: {
          model,
          max_tokens: 2048,
          temperature: 1.3,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        },
      };
    },
    extractReply(data) {
      return (data?.choices?.[0]?.message?.content || '').trim();
    },
    testKey(apiKey) {
      return {
        url: 'https://api.deepseek.com/models',
        headers: { authorization: `Bearer ${apiKey}` },
      };
    },
  },

  openai: {
    label: 'ChatGPT（OpenAI）',
    keyPlaceholder: 'sk-...',
    consoleUrl: 'https://platform.openai.com/api-keys',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini（快速・便宜）' },
      { id: 'gpt-4o', label: 'GPT-4o（品質較高）' },
      { id: 'gpt-5.5', label: 'GPT-5.5（最高品質）' },
    ],
    // OpenAI Chat Completions：務必用 max_completion_tokens（max_tokens 在推理模型會 400）；
    // 且不送 temperature —— 推理模型（GPT-5.x / o 系列）只接受預設溫度，送自訂值會 400，
    // 而不送時 gpt-4o 也用預設值，一種請求形狀即可相容全部模型。
    // max_completion_tokens 也涵蓋推理模型的隱藏思考 token，故給較寬裕的 4096 避免答案被吃光。
    chat(apiKey, model, system, user) {
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: {
          model,
          max_completion_tokens: 4096,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        },
      };
    },
    extractReply(data) {
      return (data?.choices?.[0]?.message?.content || '').trim();
    },
    testKey(apiKey) {
      return {
        url: 'https://api.openai.com/v1/models',
        headers: { authorization: `Bearer ${apiKey}` },
      };
    },
  },
};

// UI 下拉選單顯示順序
const PROVIDER_ORDER = ['anthropic', 'deepseek', 'openai'];

// 三家錯誤主體皆為 { error: { message } } → 共用擷取
function extractError(data, status) {
  return data?.error?.message || `HTTP ${status}`;
}

function inferProviderFromModel(model) {
  if (!model) return null;
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('deepseek')) return 'deepseek';
  if (/^(gpt|o\d|chatgpt)/.test(model)) return 'openai';
  return null;
}

// 產生標準化設定（含預設值與舊版單一供應商設定的遷移）。
// 標準結構：{ provider, apiKeys:{}, models:{}, persona, autoOnFocus }
function normalizeSettings(raw) {
  raw = raw || {};
  const out = {
    provider: raw.provider,
    apiKeys: { ...(raw.apiKeys || {}) },
    models: { ...(raw.models || {}) },
    persona: raw.persona || '',
    autoOnFocus: raw.autoOnFocus !== false,
  };

  // 舊版（單一供應商）設定 { apiKey, model } → 依模型判斷供應商後搬移
  if (!raw.apiKeys && (raw.apiKey || raw.model)) {
    const inferred = inferProviderFromModel(raw.model) || 'anthropic';
    if (raw.apiKey) out.apiKeys[inferred] = raw.apiKey;
    if (raw.model && PROVIDERS[inferred]?.models.some((m) => m.id === raw.model)) {
      out.models[inferred] = raw.model;
    }
    if (!out.provider) out.provider = inferred;
  }

  if (!out.provider || !PROVIDERS[out.provider]) out.provider = PROVIDER_ORDER[0];
  return out;
}

function resolveModel(settings, providerId) {
  const p = providerId || settings.provider;
  return (settings.models && settings.models[p]) || PROVIDERS[p].defaultModel;
}

// 掛到全域，讓 service worker / popup / content script 三種環境都能取用。
(() => {
  const g = globalThis;
  g.PROVIDERS = PROVIDERS;
  g.PROVIDER_ORDER = PROVIDER_ORDER;
  g.extractError = extractError;
  g.inferProviderFromModel = inferProviderFromModel;
  g.normalizeSettings = normalizeSettings;
  g.resolveModel = resolveModel;
})();
