# CommentBot（YouTube / Facebook / X（Twitter）/ Threads．多家 AI）

一個 Chrome 擴充功能：在 **YouTube、Facebook、X（Twitter）或 Threads** 的留言區，當你點開某則留言的回覆框時，用你選擇的 AI **只針對當下 focus 的那一則留言**產生合適的回覆草稿，填入回覆框，**由你確認後自行送出**。

## 支援平台

| 平台 | 網址 | 狀態 |
| --- | --- | --- |
| **YouTube** | `youtube.com/watch` 影片頁留言區 | 穩定 |
| **Facebook** | `www.facebook.com` / `web.facebook.com` 貼文留言區 | **盡力而為**（見下方說明） |
| **X（Twitter）** | `x.com` / `twitter.com` 推文回覆 | **盡力而為**（見下方說明） |
| **Threads** | `threads.com` / `threads.net` 串文回覆 | **盡力而為**（見下方說明） |

> ⚠️ **Facebook 為盡力而為**：Facebook 的網頁 DOM 使用混淆、頻繁變動的自動 class，且 UI 文案會依語言在地化，其留言框是 Lexical 編輯器。本擴充功能改用結構性訊號（`role=article`、`contenteditable/role=textbox/data-lexical-editor`、`dir=auto`、個人檔案連結）盡力辨識，並用 `execCommand('insertText')` 填入（Lexical 的標準做法）。Facebook 若改版可能失效；屆時只需更新 `content.js` 內的 `facebook` 轉接器與 `fb*` 輔助函式即可，其餘不動。

> ⚠️ **X（Twitter）為盡力而為**：X 是 React SPA，本擴充功能以較穩定的 `data-testid` 定位（`tweet` / `tweetText` / `User-Name` / `reply` / `tweetTextarea_*` / `tweetButton(Inline)`）。回覆框是 **DraftJS**（受控 contenteditable），內容由內部 EditorState 管理，從內容腳本用 `execCommand` 會重複、用合成 paste 會被忽略；因此改在**頁面主世界（`inject_twitter.js`，manifest `world:MAIN`，需 Chrome 111+）透過 React fiber 直接更新 DraftJS 的 EditorState**（不碰 DOM、不重複、模型更新後送出鈕才會啟用）。X 的回覆對象以框外「Replying to @…」標籤處理、框內不預填提及，故不保留提及。送出僅透過送出鈕（不使用 Enter 後備，因為 X 的 Enter 是換行）。X 若改版可能失效；屆時只需更新 `content.js` 內的 `twitter` 轉接器、`tw*` 輔助函式與 `inject_twitter.js` 即可，其餘不動。

> ⚠️ **Threads 為盡力而為**：Threads（`threads.com`，舊網域 `threads.net` 已導向）與 Facebook 同為 Meta 的 React/RN-web + **Lexical** 技術棧，但**幾乎沒有穩定的 `data-testid`**（與 X 不同）。本擴充功能一律以結構/語意訊號辨識：每則貼文外層 `div[data-pressable-container="true"]`（或語意 `article`）、作者連結 `a[href^="/@"]`、內文 `span[dir="auto"]:not([translate="no"])`、永久連結 `a[href*="/post/"]`。回覆框是 Lexical，故沿用與 Facebook 相同的 `execCommand` + 合成 paste 填入（不需 X 的主世界 fiber）。轉接器**同時支援「回覆貼文底下的留言」與「回覆貼文本身」**：桌機版點回覆鈕會開 `role="dialog"` 彈窗，取彈窗內你點的那一則（可能是主貼文或某則留言）；貼文詳情頁的**行內回覆框**則回覆「該頁主貼文本身」（以網址 `/post/{code}` 對應，而非頁面上最後一則留言）。**找不到對象就不動作**（避免把「發新串」誤判為回覆而在自動送出模式下送出獨立貼文）。送出鈕為文字「Post／發佈」的 `div[role="button"]`（無 `aria-label`、無 testid），且 Enter 是換行，故只以按鈕送出。Threads 若改版可能失效；屆時只需更新 `content.js` 內的 `threads` 轉接器與 `th*` 輔助函式。

## 支援的 AI 供應商

可在設定中切換，各家金鑰獨立保存：

| 供應商 | 取得金鑰 | 提供的模型 |
| --- | --- | --- |
| **Claude（Anthropic）** | [console.anthropic.com](https://console.anthropic.com/) | Haiku 4.5 / Sonnet 5 / Opus 4.8 |
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com/) | deepseek-chat / deepseek-reasoner |
| **ChatGPT（OpenAI）** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | GPT-4o mini / GPT-4o / GPT-5.5 |
| **Gemini（Google）** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Gemini 2.5 Flash / Gemini 2.5 Pro |
| **自訂（OpenAI 相容）** | 你自己的端點 | 自行輸入 **API URL**、金鑰（本機端點可留空）、模型名稱 |

> **自訂端點**：選「自訂（OpenAI 相容）」即可接自架或代理的 LLM（Ollama、LM Studio、vLLM、OpenRouter、Together、Groq…）。填入 chat completions 端點網址（例：`https://openrouter.ai/api/v1/chat/completions`、`http://localhost:11434/v1/chat/completions`）、模型名稱，需要的話填金鑰，按「測試連線」驗證。為此擴充功能的 `host_permissions` 放寬到 `https://*/*` 與 `http://*/*`（涵蓋自架 https、以及本機／區網的 http 端點如 Ollama、LM Studio），安裝時的權限提示會較廣（這是自帶端點的必要取捨）。

設計重點：

- **一次一則**：預設只處理你當下打開的那個回覆框，一則一則產生，藉此節省用量。
- **各金鑰獨立保存**：切換供應商不會遺失已輸入的金鑰與模型選擇。

## 回覆模式

在設定的「回覆模式」下拉切換：

| 模式 | 行為 | 送出 |
| --- | --- | --- |
| **手動（Manual）** | 只在你按「✨ AI 產生回覆」時才產生草稿 | 由你手動 |
| **檢查（Checking，預設）** | 點開某則留言的回覆框時，自動產生草稿並填入 | 由你手動 |
| **懶人（Lazy）** | 點開回覆框時，自動產生並**自動送出** | ⚠️ 自動 |
| **瘋狂（Crazy）** | 自動掃描頁面留言，逐一開啟回覆框、產生並**自動送出**（每則間隔數秒） | ⚠️ 自動 |

> ⚠️ **懶人／瘋狂模式會自動替你送出留言、無法復原**。切換到這兩種模式時會要求你再次確認。請務必用在自己的頻道／粉專，並自行斟酌頻率、遵守 YouTube / Meta 服務條款（大量自動化互動可能違反條款）。瘋狂模式尤其會對整頁留言逐一回覆，請謹慎使用。

## 留言篩選（選填）

在設定填入篩選條件後，**只有內容符合的留言才會產生回覆**；不符合的留言在**任何模式下**都會被略過（瘋狂模式也不會替它們送出）。

- **留空** = 不篩選，回覆所有留言。
- **一般關鍵字**：留言包含該字串才回覆（預設忽略大小寫）。
- **正規表示式（regex）**：勾選「使用正規表示式」後，以 regex 比對留言內容。設定框會即時檢查 regex 是否有效。
- 為安全起見，**無效的 regex 會被視為「不回覆任何留言」**（fail-closed），避免因篩選失效而在自動模式下大量回覆。

例：`^(請問|how|怎麼)` 只回覆看起來在提問的留言；`抽獎|贈品` 只回覆疑似抽獎留言。

## 安裝

1. 開啟 Chrome，前往 `chrome://extensions`。
2. 開啟右上角的「開發人員模式」。
3. 點「載入未封裝項目」，選擇本資料夾（`CommentBot`）。
4. 工具列會出現 🤖 圖示。

## 取得 API Key

依你要用的供應商，到對應主控台建立金鑰（見上表連結），貼到擴充功能設定中，按「測試連線」確認有效。金鑰格式因供應商而異（DeepSeek / OpenAI 多為 `sk-`、Claude 為 `sk-ant-`、Gemini 為 `AIza`；自訂端點依你的服務而定）。

> API Key 只會儲存在你本機的瀏覽器（`chrome.storage.local`），僅用於直接呼叫該供應商的 API。
>
> ⚠️ **安全提醒**：金鑰存在瀏覽器擴充功能中，技術上可被取出。這是「自帶金鑰（BYOK）」個人工具的取捨；請使用你自己的金鑰、並視需要設定用量上限。

## 使用方式

1. 點工具列 🤖 圖示完成設定：**供應商**、**API Key**（可按「測試連線」）、**模型**、**回覆模式**（見上表，預設「檢查」）、**頻道主人設**（選填），以及（進階）**自訂提示詞範本**。
2. 開啟 YouTube 影片頁、Facebook 貼文、X（Twitter）推文或 Threads 串文，捲到留言／回覆區。
3. 對想回覆的留言按「**回覆**」打開回覆框：
   - **檢查／懶人**模式會自動針對這一則產生草稿並填入（懶人模式還會自動送出）。
   - **手動**模式則按回覆框旁的「**✨ AI 產生回覆**」產生；已產生後可按「🔄 重新產生」。
   - **瘋狂**模式不需你動手，會自動逐一處理頁面上的留言。
4. 非自動送出的模式：確認 / 修改內容後，**自行送出**（YouTube 按「回覆」、Facebook 按 Enter 或「發佈」、X 按「回覆」鈕或 Ctrl／⌘＋Enter）。

### 運作方式

- Content script 監聽回覆框取得焦點的事件，依當前網站選用對應的平台轉接器（`PLATFORMS.youtube` / `PLATFORMS.facebook` / `PLATFORMS.twitter` / `PLATFORMS.threads`），找出正在回覆的那一則留言（作者 + 內文）。
- 只把該留言連同頁面脈絡送給你選定的 AI，產生 1~3 句自然的回覆，**並以留言者的語言回覆**。
- 送出的 **system / user 提示詞可在設定中自訂**（「進階：自訂提示詞範本」）。動態值以 `{{變數}}` 代入：system 可用 `{{platform}}`、`{{owner}}`、`{{contentType}}`、`{{title}}`、`{{補充提示}}`；user 可用 `{{author}}`、`{{comment}}`（變數名支援中文）。「頻道主人設」會代入 `{{補充提示}}`（若範本未含此變數則附加在最後）。每個範本都有「還原預設」，留空亦自動還原。
- 各 AI 供應商的端點、認證、請求 / 回應格式集中在 `providers.js`；實際呼叫在 background service worker 進行（避開頁面 CSP，並用 `host_permissions` 跨網域）。
- 回覆以 `execCommand('insertText')` 填入（會觸發原生輸入事件以啟用送出鈕；YouTube、Facebook 與 Threads 的 Lexical 與 X 的 DraftJS 皆適用）；YouTube 若失敗會退回直接寫入，Facebook、Threads 與 X 則改用合成 paste（Lexical / DraftJS 不可直接寫 textContent）。
- **送出永遠由你手動完成**（自動送出模式除外）；每個回覆框只自動產生一次；框內已有文字時不會自動覆蓋。**填入前一律先清空回覆框自動帶入的提及，只填回覆內容**：YouTube 的「@帳號」、Facebook 的對方名字（Lexical 提及節點）都會被清除，X 本來就不在框內預填提及（回覆本身已會通知對方）。

## 各供應商小提醒

- **Claude**：新模型不接受 `temperature`（會 400），故不送；Sonnet 5 明確關閉 thinking 以省 token。
- **DeepSeek**：`deepseek-reasoner` 是推理模型，會忽略 temperature，速度較慢、用量較高。
- **ChatGPT**：使用 `max_completion_tokens`、不送 `temperature`，以相容推理模型（GPT-5.x / o 系列）。若 OpenAI 調整模型 ID，改 `providers.js` 的 `openai.models` 即可。
- **Gemini**：用原生 Generative Language API，金鑰以 `x-goog-api-key` 標頭認證（`AIza` 開頭）。2.5 系列預設會「思考」而吃掉輸出額度 —— Flash 已關閉思考（`thinkingBudget:0`），Pro 無法關閉故設較低上限（1024），避免回覆被思考吃空。

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
| X（Twitter）沒反應 / 抓錯推文 / 沒填入 | X DOM 常改版，屬盡力而為；請回報，通常只需更新 `content.js` 的 `twitter` 轉接器 `data-testid` 選擇器 |
| Threads 沒反應 / 抓錯貼文 / 沒填入 | Threads DOM 為混淆且無穩定 testid，屬盡力而為；請回報，通常只需更新 `content.js` 的 `threads` 轉接器與 `th*` 輔助函式 |
| 想換一家 AI | 在設定的「供應商」下拉切換即可；各家金鑰會各自保留 |

## 檔案結構

```
CommentBot/
├── manifest.json    # MV3 設定（AI host_permissions；content script 跑在 YouTube/Facebook/X/Threads）
├── providers.js     # 各 AI 供應商的端點/認證/請求格式與設定正規化（三處共用）
├── background.js    # Service worker：依供應商呼叫對應 API（平台無關）
├── content.js       # 平台轉接器（YouTube / Facebook / X / Threads）+ 共用的聚焦、產生、填入邏輯
├── inject_twitter.js# X 專用：在頁面主世界(MAIN)透過 React fiber 直接更新 DraftJS 的 EditorState
├── popup.html/css/js# 設定介面（供應商、金鑰、模型、人設）
├── icons/           # 擴充功能圖示
└── README.md
```
