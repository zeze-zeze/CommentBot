# CommentBot（YouTube / Facebook．多家 AI）

一個 Chrome 擴充功能：在 **YouTube 或 Facebook** 的留言區，當你點開某則留言的回覆框時，用你選擇的 AI **只針對當下 focus 的那一則留言**產生合適的回覆草稿，填入回覆框，**由你確認後自行送出**。

## 支援平台

| 平台 | 網址 | 狀態 |
| --- | --- | --- |
| **YouTube** | `youtube.com/watch` 影片頁留言區 | 穩定 |
| **Facebook** | `www.facebook.com` / `web.facebook.com` 貼文留言區 | **盡力而為**（見下方說明） |

> ⚠️ **Facebook 為盡力而為**：Facebook 的網頁 DOM 使用混淆、頻繁變動的自動 class，且 UI 文案會依語言在地化，其留言框是 Lexical 編輯器。本擴充功能改用結構性訊號（`role=article`、`contenteditable/role=textbox/data-lexical-editor`、`dir=auto`、個人檔案連結）盡力辨識，並用 `execCommand('insertText')` 填入（Lexical 的標準做法）。Facebook 若改版可能失效；屆時只需更新 `content.js` 內的 `facebook` 轉接器與 `fb*` 輔助函式即可，其餘不動。

## 支援的 AI 供應商

可在設定中切換，各家金鑰獨立保存：

| 供應商 | 取得金鑰 | 提供的模型 |
| --- | --- | --- |
| **Claude（Anthropic）** | [console.anthropic.com](https://console.anthropic.com/) | Haiku 4.5 / Sonnet 5 / Opus 4.8 |
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com/) | deepseek-chat / deepseek-reasoner |
| **ChatGPT（OpenAI）** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | GPT-4o mini / GPT-4o / GPT-5.5 |

設計重點：

- **聚焦式、一次一則**：只處理你當下打開（取得焦點）的那個回覆框，不掃描整頁、不一次產生大量回覆，藉此節省用量。
- **人工送出**：擴充功能只把草稿填進回覆框，永遠不會替你按下送出。
- **各金鑰獨立保存**：切換供應商不會遺失已輸入的金鑰與模型選擇。

## 安裝

1. 開啟 Chrome，前往 `chrome://extensions`。
2. 開啟右上角的「開發人員模式」。
3. 點「載入未封裝項目」，選擇本資料夾（`CommentBot`）。
4. 工具列會出現 🤖 圖示。

## 取得 API Key

依你要用的供應商，到對應主控台建立金鑰（見上表連結），貼到擴充功能設定中，按「測試連線」確認有效。三家的金鑰都以 `sk-` 開頭（僅為慣例）。

> API Key 只會儲存在你本機的瀏覽器（`chrome.storage.local`），僅用於直接呼叫該供應商的 API。
>
> ⚠️ **安全提醒**：金鑰存在瀏覽器擴充功能中，技術上可被取出。這是「自帶金鑰（BYOK）」個人工具的取捨；請使用你自己的金鑰、並視需要設定用量上限。

## 使用方式

1. 點工具列 🤖 圖示完成設定：**供應商**、**API Key**（可按「測試連線」）、**模型**、**聚焦時自動產生**（預設開）、**頻道主人設**（選填）。
2. 開啟 YouTube 影片頁或 Facebook 貼文，捲到留言區。
3. 對想回覆的留言按「**回覆**」打開回覆框：
   - 若「聚焦時自動產生」為開，會自動針對這一則產生草稿並填入。
   - 或按回覆框旁的「**✨ AI 產生回覆**」手動產生；已產生後可按「🔄 重新產生」。
4. 確認 / 修改內容後，**自行送出**（YouTube 按「回覆」、Facebook 按 Enter 或「發佈」）。

### 運作方式

- Content script 監聽回覆框取得焦點的事件，依當前網站選用對應的平台轉接器（`PLATFORMS.youtube` / `PLATFORMS.facebook`），找出正在回覆的那一則留言（作者 + 內文）。
- 只把該留言連同頁面脈絡送給你選定的 AI，產生 1~3 句自然的回覆，**並以留言者的語言回覆**。
- 各 AI 供應商的端點、認證、請求 / 回應格式集中在 `providers.js`；實際呼叫在 background service worker 進行（避開頁面 CSP，並用 `host_permissions` 跨網域）。
- 回覆以 `execCommand('insertText')` 填入（會觸發原生輸入事件以啟用送出鈕；YouTube 與 Facebook 的 Lexical 皆適用）；YouTube 若失敗會退回直接寫入，Facebook 則改用合成 paste（Lexical 不可直接寫 textContent）。
- **送出永遠由你手動完成**；每個回覆框只自動產生一次；框內已有文字時不會自動覆蓋。YouTube 巢狀回覆若自動帶入「@某人」提及，會保留該提及並把回覆接在後面；Facebook 回覆框自動帶入的對方名字則會直接清除，只填入回覆內容（回覆本身已會通知對方）。

## 各供應商小提醒

- **Claude**：新模型不接受 `temperature`（會 400），故不送；Sonnet 5 明確關閉 thinking 以省 token。
- **DeepSeek**：`deepseek-reasoner` 是推理模型，會忽略 temperature，速度較慢、用量較高。
- **ChatGPT**：使用 `max_completion_tokens`、不送 `temperature`，以相容推理模型（GPT-5.x / o 系列）。若 OpenAI 調整模型 ID，改 `providers.js` 的 `openai.models` 即可。

## 注意事項

- **建議用在自己的頻道 / 粉專**。雖然只產生草稿、由人工送出，仍請自行斟酌互動頻率，遵守各平台服務條款（大量自動化互動可能違反 YouTube / Meta 條款）。
- 呼叫 AI API 會產生費用（依供應商與模型而異）。因為一次只產生一則，用量相對可控。

## 疑難排解

| 症狀 | 解法 |
| --- | --- |
| 回覆框旁沒有出現「✨ AI 產生回覆」 | 確認在支援的頁面；剛安裝／更新擴充功能後，請**重新整理**該分頁再試 |
| 「尚未設定 API Key」 | 點 🤖 圖示，選好供應商、填入該供應商金鑰並按「測試連線」 |
| 「API 錯誤：…authentication / invalid…」 | 金鑰錯誤，或選錯供應商（金鑰與供應商需對應）；重新確認後按「測試連線」 |
| Facebook 沒反應 / 抓錯留言 / 沒填入 | Facebook DOM 常改版，屬盡力而為；請回報，通常只需更新 `content.js` 的 `facebook` 轉接器選擇器 |
| 想換一家 AI | 在設定的「供應商」下拉切換即可；各家金鑰會各自保留 |

## 檔案結構

```
CommentBot/
├── manifest.json    # MV3 設定（3 個 AI host_permissions；content script 跑在 YouTube/Facebook）
├── providers.js     # 各 AI 供應商的端點/認證/請求格式與設定正規化（三處共用）
├── background.js    # Service worker：依供應商呼叫對應 API（平台無關）
├── content.js       # 平台轉接器（YouTube / Facebook）+ 共用的聚焦、產生、填入邏輯
├── popup.html/css/js# 設定介面（供應商、金鑰、模型、人設）
├── icons/           # 擴充功能圖示
└── README.md
```
