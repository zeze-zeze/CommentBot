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
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
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
      { id: 'deepseek-chat', label: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
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
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-5.5', label: 'GPT-5.5' },
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

  // 自訂端點（OpenAI 相容）：使用者自行輸入 API URL、API Key 與模型名稱。
  // 適用多數自架/代理 LLM（Ollama、LM Studio、vLLM、OpenRouter、Together、Groq…）。
  // url 由設定的 customUrl 帶入（透過 chat/testKey 的 extra 參數）；本機端點可不填金鑰。
  custom: {
    label: 'Custom',
    custom: true, // 標記：需要 API URL、模型為自由輸入、無主控台連結
    keyPlaceholder: 'sk-... / 你的 API 金鑰（本機端點可留空）',
    consoleUrl: '',
    defaultModel: '',
    models: [], // 模型為自由文字輸入
    chat(apiKey, model, system, user, extra) {
      return {
        url: (extra && extra.url) || '',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: {
          model,
          max_tokens: 2048,
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
    // 用最小 chat 請求驗證 URL + 金鑰 + 模型（自架端點未必有 /models 端點）。
    testKey(apiKey, extra) {
      return {
        url: (extra && extra.url) || '',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: {
          model: (extra && extra.model) || '',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        },
      };
    },
  },
};

// UI 下拉選單顯示順序
const PROVIDER_ORDER = ['anthropic', 'deepseek', 'openai', 'custom'];

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

// 回覆模式：
//   manual   手動 —— 只在使用者按按鈕時才產生（不自動）
//   checking 檢查 —— 聚焦回覆框時自動產生草稿，但不送出（預設）
//   lazy     懶人 —— 聚焦回覆框時自動產生並自動送出
//   crazy    瘋狂 —— 自動掃描頁面留言，逐一產生並自動送出
const REPLY_MODES = ['manual', 'checking', 'lazy', 'crazy'];

// 提示詞範本的預設值放在 I18N 的 default_system_prompt / default_user_prompt（中英各一份），
// 依介面語言取用。動態值以 {{變數}} 代入：
//   system 可用：{{platform}} {{owner}} {{contentType}} {{title}} {{補充提示}}／{{persona}}（同一值）
//   user   可用：{{author}} {{comment}}
// （{{owner}} / {{title}} 已含引號或為空字串，{{補充提示}}={{persona}}=設定裡的人設，空值皆自然消失。）

// 將 {{變數}} 代入為對應值；未知變數保持原樣。變數名支援中文（用 Unicode 類別，非 \w）。
function renderTemplate(tpl, vars) {
  return String(tpl == null ? '' : tpl).replace(/\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu, (m, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m
  );
}

// ---------- 介面文字（i18n）----------
// 三個執行環境（popup / content / background）共用；預設英文。含 {x} 者於呼叫端代入。
const I18N = {
  en: {
    // 預設提示詞範本（依介面語言）+ 送進模型的在地化詞彙
    default_system_prompt: `You're replying to a comment under a {{platform}} {{contentType}}{{title}}. {{persona}}`,
    default_user_prompt: `Commenter: {{author}}
Comment:
{{comment}}

Output only your reply (no quotes, no prefixes or explanations).`,
    ct_video: 'video',
    ct_post: 'post',
    author_unknown: '(unknown)',
    persona_prefix: 'Additional instructions (please follow):',
    // popup 區塊 / 標籤 / 按鈕
    sec_provider: 'AI Provider',
    lbl_provider: 'Provider',
    provider_custom: 'Custom (OpenAI-compatible)',
    lbl_apiurl: 'API URL',
    ph_apiurl: 'https://your-endpoint/v1/chat/completions',
    ph_model: 'model name (e.g. llama-3.1-70b)',
    lbl_apikey: 'API Key (stored locally only)',
    btn_test: 'Test connection',
    ttl_toggle: 'Show / hide',
    lbl_nokey: 'No key yet? ',
    key_console: 'Get one from the {label} console',
    lbl_model: 'Model',
    sec_reply: 'Reply settings',
    lbl_mode: 'Reply mode',
    mode_manual: 'Manual — only when you click the button',
    mode_checking: 'Checking — auto-draft on focus, no submit',
    mode_lazy: 'Lazy — auto-draft on focus and auto-submit',
    mode_crazy: 'Crazy — scan all comments, draft and submit',
    warn_autosubmit:
      "⚠️ This mode auto-submits replies for you and can't be undone. Make sure you're on your own channel/page and follow the platform's terms.",
    lbl_persona: 'Extra instructions (optional)',
    ph_persona: 'e.g. Reply in English; keep a casual, witty tone.',
    hint_persona:
      'Inserted at the <code>{{persona}}</code> placeholder in the system prompt (appended at the end if the template has no such variable).',
    sec_filter: 'Comment filter (optional)',
    lbl_filter: 'Only reply to matching comments',
    ph_filter: 'keyword or regex; empty = reply to all',
    lbl_regex: 'Use regular expression (regex)',
    lbl_ignorecase: 'Ignore case',
    hint_filter:
      'Only comments matching the condition get a reply; non-matching comments are skipped in <b>every mode</b>.',
    sum_advanced: 'Advanced: custom prompt templates',
    lbl_system: 'System prompt',
    btn_reset: 'Reset to default',
    hint_system:
      'Variables: <code>{{platform}}</code> (platform) <code>{{owner}}</code> (channel/page) <code>{{contentType}}</code> (video/post) <code>{{title}}</code> (title) <code>{{persona}}</code> (persona)',
    lbl_user: 'User prompt',
    hint_user:
      'Variables: <code>{{author}}</code> (commenter) <code>{{comment}}</code> (comment text)',
    hint_advanced: 'Leave blank to restore the default. Persona is appended after the system prompt.',
    sec_settings: 'Settings',
    lbl_platforms: 'Active on',
    lbl_uilang: 'Interface language',
    // popup 動態
    st_testing: 'Testing…',
    st_test_ok: '✓ Connected',
    flt_off: 'No filter — replies to all comments.',
    flt_valid: '✓ Valid regex',
    flt_invalid: '✗ Invalid regex: {msg} (will reply to nothing)',
    flt_plain: 'Only replies to comments containing “{pat}”{ic}.',
    flt_ic: ' (case-insensitive)',
    mdesc_manual:
      'A "✨ Generate reply" button appears next to the reply box; a draft is produced only when you click it. Never auto-submits.',
    mdesc_checking:
      'When you open a comment’s reply box, a draft for that comment is auto-generated and filled in; you submit it yourself.',
    mdesc_lazy: "When you open a comment’s reply box, a draft is auto-generated and submitted for you.",
    mdesc_crazy:
      'Automatically scans the comments on the page and, one by one, opens the reply box, generates a reply and submits it (a few seconds apart).',
    confirm_autosubmit:
      '"{name}" auto-submits replies for you and cannot be undone.\nMake sure you are on your own channel/page and follow the platform terms.\n\nEnable it?',
    mode_name_crazy: 'Crazy mode',
    mode_name_lazy: 'Lazy mode',
    // content 按鈕 / 狀態
    btn_generate: '✨ Generate reply',
    btn_regenerate: '🔄 Regenerate',
    btn_sent: '✅ Sent',
    st_generating: 'Generating…',
    st_submitting: 'Submitting…',
    st_no_comment: 'No matching comment found',
    st_no_text: "Can't read the comment",
    st_no_key: 'API key not set — click the extension icon to configure',
    st_no_url: 'API URL not set — click the extension icon to configure',
    st_filtered: "Comment doesn’t match the filter — skipped",
    st_submitted: 'Auto-submitted',
    st_submit_failed: 'Draft filled, but auto-submit failed — please submit manually',
    st_draft_modechanged: 'Draft filled (mode changed — not auto-submitted)',
    st_draft: 'Draft filled — review and submit yourself',
    st_bg_no_response: 'No response from the background service',
    // background 錯誤
    err_no_key: 'API key for {label} not set (click the extension icon to set it)',
    err_no_url: 'API URL not set (click the extension icon to set it)',
    err_network: 'Network request failed: {msg}',
    err_api: 'API error: {msg}',
    err_empty: 'The API returned empty content',
    err_no_key_input: 'No API key entered',
    err_key_invalid: '{msg} (the API key may be invalid)',
    err_test_failed: '{msg} (check the API URL, model name, and API key)',
  },
  zh: {
    default_system_prompt: `你在{{platform}}回覆{{contentType}}{{title}}下方的一則留言。{{補充提示}}`,
    default_user_prompt: `留言者：{{author}}
留言內容：
{{comment}}

請直接輸出你要回覆的內容（不要加引號、不要加任何前綴說明）。`,
    ct_video: '影片',
    ct_post: '貼文',
    author_unknown: '(未知)',
    persona_prefix: '補充設定（請遵守）：',
    sec_provider: 'AI 供應商',
    lbl_provider: '供應商',
    provider_custom: '自訂（OpenAI 相容）',
    lbl_apiurl: 'API URL',
    ph_apiurl: 'https://你的端點/v1/chat/completions',
    ph_model: '模型名稱（例如 llama-3.1-70b）',
    lbl_apikey: 'API Key（只儲存在本機）',
    btn_test: '測試連線',
    ttl_toggle: '顯示 / 隱藏',
    lbl_nokey: '還沒有金鑰？',
    key_console: '到 {label} 主控台取得',
    lbl_model: '模型',
    sec_reply: '回覆設定',
    lbl_mode: '回覆模式',
    mode_manual: '手動（Manual）— 只在你按按鈕時才產生',
    mode_checking: '檢查（Checking）— 聚焦回覆框時自動產生，不送出',
    mode_lazy: '懶人（Lazy）— 聚焦回覆框時自動產生並自動送出',
    mode_crazy: '瘋狂（Crazy）— 自動掃描留言逐一產生並送出',
    warn_autosubmit:
      '⚠️ 此模式會自動替你送出留言，無法復原。請確認你在自己的頻道／粉專，並遵守平台服務條款。',
    lbl_persona: '補充指示（選填）',
    ph_persona: '例如：一律用繁體中文回覆；語氣輕鬆幽默，會用一點台灣的網路用語。',
    hint_persona:
      '會代入系統提示詞的 <code>{{補充提示}}</code> 位置（若範本未含此變數，則附加在最後）。',
    sec_filter: '留言篩選（選填）',
    lbl_filter: '只回覆符合條件的留言',
    ph_filter: '關鍵字或 regex；留空＝全部回覆',
    lbl_regex: '使用正規表示式（regex）',
    lbl_ignorecase: '忽略大小寫',
    hint_filter: '留言內容需符合條件才會產生回覆；不符合的留言在<b>任何模式</b>下都會被略過。',
    sum_advanced: '進階：自訂提示詞範本',
    lbl_system: '系統提示詞（System）',
    btn_reset: '還原預設',
    hint_system:
      '可用變數：<code>{{platform}}</code>（平台）<code>{{owner}}</code>（頻道主／粉專）<code>{{contentType}}</code>（影片／貼文）<code>{{title}}</code>（標題）<code>{{補充提示}}</code>（人設）',
    lbl_user: '使用者提示詞（User）',
    hint_user: '可用變數：<code>{{author}}</code>（留言者）<code>{{comment}}</code>（留言內容）',
    hint_advanced: '留空會自動還原為預設值。人設會另外附加在系統提示詞後面。',
    sec_settings: '設定',
    lbl_platforms: '生效平台',
    lbl_uilang: '介面語言',
    st_testing: '測試中…',
    st_test_ok: '✓ 連線成功',
    flt_off: '目前不篩選，會回覆所有留言。',
    flt_valid: '✓ 有效的正規表示式',
    flt_invalid: '✗ 無效的正規表示式：{msg}（將不會回覆任何留言）',
    flt_plain: '只回覆包含「{pat}」的留言{ic}。',
    flt_ic: '（忽略大小寫）',
    mdesc_manual: '回覆框旁會出現「✨ AI 產生回覆」按鈕，只有你按下時才會產生草稿；永不自動送出。',
    mdesc_checking: '點開某則留言的回覆框時，自動產生那一則的回覆草稿並填入；由你確認後自行送出。',
    mdesc_lazy: '點開某則留言的回覆框時，自動產生草稿並「自動替你送出」。',
    mdesc_crazy: '自動掃描頁面上的留言，逐一開啟回覆框、產生回覆並「自動送出」（每則間隔數秒）。',
    confirm_autosubmit:
      '「{name}」會自動替你送出留言，無法復原。\n請確認你在自己的頻道／粉專並遵守平台條款。\n\n確定要啟用嗎？',
    mode_name_crazy: '瘋狂模式',
    mode_name_lazy: '懶人模式',
    btn_generate: '✨ AI 產生回覆',
    btn_regenerate: '🔄 重新產生',
    btn_sent: '✅ 已送出',
    st_generating: '產生中…',
    st_submitting: '送出中…',
    st_no_comment: '找不到對應的留言',
    st_no_text: '讀不到留言內容',
    st_no_key: '尚未設定 API Key，請點工具列的擴充功能圖示設定',
    st_no_url: '尚未設定 API URL，請點工具列的擴充功能圖示設定',
    st_filtered: '留言不符合篩選條件，略過',
    st_submitted: '已自動送出',
    st_submit_failed: '已填入草稿，但自動送出失敗，請手動送出',
    st_draft_modechanged: '已填入草稿（模式已變更，未自動送出）',
    st_draft: '已填入草稿，確認後請自行送出',
    st_bg_no_response: '背景服務無回應',
    err_no_key: '尚未設定 {label} 的 API Key（請點擴充功能圖示進行設定）',
    err_no_url: '尚未設定 API URL（請點擴充功能圖示進行設定）',
    err_network: '網路連線失敗：{msg}',
    err_api: 'API 錯誤：{msg}',
    err_empty: 'API 回傳了空白內容',
    err_no_key_input: '尚未輸入 API Key',
    err_key_invalid: '{msg}（API Key 可能無效）',
    err_test_failed: '{msg}（請檢查 API URL、模型名稱與 API Key）',
  },
};

// 取介面文字：t(key, lang, vars?)；找不到就退回英文，再退回 key 本身。
// 有 vars 時代入 {name}（用 function 取代，避免使用者輸入中的 $ 被當成特殊取代樣式）。
function t(key, lang, vars) {
  const table = I18N[lang] || I18N.en;
  let s = (key in table ? table[key] : I18N.en[key]) || key;
  if (vars) {
    s = s.replace(/\{(\w+)\}/g, (m, k) =>
      Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m
    );
  }
  return s;
}

// 產生標準化設定（含預設值與舊版設定的遷移）。
// 標準結構：{ provider, apiKeys:{}, models:{}, persona, mode }
function normalizeSettings(raw) {
  raw = raw || {};
  const uiLang = raw.uiLang === 'zh' ? 'zh' : 'en';
  const out = {
    provider: raw.provider,
    apiKeys: { ...(raw.apiKeys || {}) },
    models: { ...(raw.models || {}) },
    persona: raw.persona || '',
    mode: raw.mode,
    // 未自訂時用「介面語言」對應的預設範本；回覆語言由使用者在「補充指示」中自行指定。
    systemPrompt:
      typeof raw.systemPrompt === 'string' && raw.systemPrompt.trim()
        ? raw.systemPrompt
        : t('default_system_prompt', uiLang),
    userPrompt:
      typeof raw.userPrompt === 'string' && raw.userPrompt.trim()
        ? raw.userPrompt
        : t('default_user_prompt', uiLang),
    // 自訂供應商（custom）的 API 端點 URL。
    customUrl: typeof raw.customUrl === 'string' ? raw.customUrl : '',
    // 留言篩選：只回覆內容符合 filterPattern 的留言（空字串＝不篩選、全部回覆）。
    // filterRegex 為 true 時以正規表示式比對，否則以子字串比對；filterIgnoreCase 預設開。
    filterPattern: typeof raw.filterPattern === 'string' ? raw.filterPattern : '',
    filterRegex: raw.filterRegex === true,
    filterIgnoreCase: raw.filterIgnoreCase !== false,
    // 生效平台（預設全開）：只有在此開啟的平台，CommentBot 才會運作。
    platforms: {
      youtube: !(raw.platforms && raw.platforms.youtube === false),
      facebook: !(raw.platforms && raw.platforms.facebook === false),
    },
    // 介面語言（預設英文 'en'，另支援繁中 'zh'）。回覆語言由使用者在「補充指示」中指定。
    uiLang,
  };

  // 舊名稱遷移：hidden 已更名為 manual。
  if (out.mode === 'hidden') out.mode = 'manual';
  // 模式遷移：舊版只有布林 autoOnFocus（true=聚焦自動產生不送出、false=手動）。
  if (!REPLY_MODES.includes(out.mode)) {
    out.mode = raw.autoOnFocus === false ? 'manual' : 'checking';
  }

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
  g.REPLY_MODES = REPLY_MODES;
  g.renderTemplate = renderTemplate;
  g.I18N = I18N;
  g.t = t;
  g.extractError = extractError;
  g.inferProviderFromModel = inferProviderFromModel;
  g.normalizeSettings = normalizeSettings;
  g.resolveModel = resolveModel;
})();
