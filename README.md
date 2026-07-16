# YouTube CommentBot（多家 AI）

一個 Chrome 擴充功能：在 YouTube 影片頁，當你點開某則留言的回覆框時，用你選擇的 AI **只針對當下 focus 的那一則留言**產生合適的回覆草稿，填入回覆框，**由你確認後自行送出**。

支援三家供應商，可在設定中切換：

| 供應商 | 取得金鑰 | 提供的模型 |
| --- | --- | --- |
| **Claude（Anthropic）** | [console.anthropic.com](https://console.anthropic.com/) | Haiku 4.5 / Sonnet 5 / Opus 4.8 |
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com/) | deepseek-chat / deepseek-reasoner |
| **ChatGPT（OpenAI）** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | GPT-4o mini / GPT-4o / GPT-5.5 |

設計重點：

- **聚焦式、一次一則**：只處理你當下打開（取得焦點）的那個回覆框，不會掃描整頁、也不會一次產生大量回覆，藉此節省用量。
- **人工送出**：擴充功能只把草稿填進回覆框，永遠不會替你按下送出。
- **各供應商金鑰獨立保存**：切換供應商不會遺失已輸入的金鑰與模型選擇。

## 安裝

1. 開啟 Chrome，前往 `chrome://extensions`。
2. 開啟右上角的「開發人員模式」。
3. 點「載入未封裝項目」，選擇本資料夾（`CommentBot`）。
4. 工具列會出現 🤖 圖示。

## 取得 API Key

依你要用的供應商，到對應主控台建立金鑰（見上表連結），貼到擴充功能設定中，按「測試連線」確認有效。三家的金鑰都以 `sk-` 開頭（僅為慣例）。

> API Key 只會儲存在你本機的瀏覽器（`chrome.storage.local`），僅用於直接呼叫該供應商的 API，不會傳送到其他地方。
>
> ⚠️ **安全提醒**：金鑰存在瀏覽器擴充功能中，技術上可被取出。這是「自帶金鑰（BYOK）」個人工具的取捨；請使用你自己的金鑰、並視需要設定用量上限。

## 使用方式

1. 點工具列的 🤖 圖示完成設定：
   - **供應商**：Claude / DeepSeek / ChatGPT。
   - **API Key**：該供應商的金鑰；可按「測試連線」確認。
   - **模型**：每家各自的模型清單（預設為較快較便宜的那顆）。
   - **聚焦時自動產生**：預設開啟。開啟時點開回覆框就自動產生草稿；關閉則改為手動按按鈕。
   - **頻道主人設**（選填）：描述你的頻道風格與語氣，AI 會照著回覆。
2. 開啟任一 YouTube 影片頁（`youtube.com/watch?v=...`），捲到留言區。
3. 對想回覆的留言按「**回覆**」打開回覆框：
   - 若「聚焦時自動產生」為開，會自動針對這一則產生草稿並填入。
   - 或按回覆框下方的「**✨ AI 產生回覆**」手動產生；已產生後可按「🔄 重新產生」。
4. 確認 / 修改內容後，**自行按 YouTube 的「回覆」送出**。

### 運作方式

- Content script 監聽回覆框（`#contenteditable-root`）取得焦點的事件，找出這個框正在回覆的那一則留言（頂層留言或子留言）。
- 只把該留言連同影片標題、頻道名稱送給你選定的供應商，產生 1~3 句自然的回覆，**並以留言者的語言回覆**。
- 各供應商的端點、認證、請求 / 回應格式集中在 `providers.js`；實際呼叫在 background service worker 進行（避開 YouTube 頁面 CSP，並利用 `host_permissions` 跨網域）。
- 回覆以模擬輸入的方式填入回覆框（觸發原生輸入事件以啟用 YouTube 的送出按鈕）；**到此為止，送出由你手動完成**。
- 每個回覆框只會自動產生一次；框內已有文字時不會自動覆蓋。

## 各供應商小提醒

- **Claude**：新模型不接受 `temperature`（會 400），故不送；Sonnet 5 明確關閉 thinking 以省 token。
- **DeepSeek**：`deepseek-reasoner` 是推理模型，會忽略 temperature，速度較慢、用量較高。
- **ChatGPT**：使用 `max_completion_tokens`、且不送 `temperature`，以相容推理模型（GPT-5.x / o 系列）。若 OpenAI 之後調整模型 ID，可自行到 `providers.js` 的 `openai.models` 增修。

## 注意事項

- **建議用在自己的頻道影片**。雖然本工具只產生草稿、由人工送出，仍請自行斟酌互動頻率，遵守 YouTube 服務條款。
- 呼叫 AI API 會產生費用（依供應商與模型而異）。因為一次只產生一則，用量相對可控。
- YouTube 前端改版可能導致選擇器失效；若「✨ AI 產生回覆」按鈕沒有出現，請回報或更新選擇器。

## 疑難排解

| 症狀 | 解法 |
| --- | --- |
| 回覆框沒有出現「✨ AI 產生回覆」 | 先確認在 `youtube.com/watch` 影片頁；剛安裝／更新擴充功能後，請**重新整理**該分頁再試 |
| 「尚未設定 API Key」 | 點工具列 🤖 圖示，選好供應商、填入該供應商金鑰並按「測試連線」 |
| 「API 錯誤：…authentication / invalid…」 | 金鑰錯誤或已停用，或選錯供應商（金鑰與供應商需對應）；重新確認後按「測試連線」 |
| 想換一家 AI | 在設定的「供應商」下拉切換即可；各家金鑰會各自保留 |
| 不想每次自動產生 | 到設定關閉「聚焦時自動產生」，改為手動按按鈕 |

## 檔案結構

```
CommentBot/
├── manifest.json    # MV3 設定（3 個 host_permissions）
├── providers.js     # 各供應商的端點/認證/請求格式與設定正規化（三處共用）
├── background.js    # Service worker：依供應商呼叫對應 API
├── content.js       # 監聽回覆框焦點、產生並填入單則回覆草稿
├── popup.html/css/js# 設定介面（供應商、金鑰、模型、人設）
├── icons/           # 擴充功能圖示
└── README.md
```
