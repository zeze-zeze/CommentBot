# Privacy Policy — CommentBot

_Last updated: 2026-07-19_

CommentBot is a Chrome extension that drafts AI-generated replies to comments on
YouTube, Facebook, X (Twitter), and Threads. This policy explains exactly what data
the extension handles and where it goes.

**Short version:** CommentBot has no backend server. The developer never receives,
stores, or sees your data. Everything the extension stores stays in your own browser,
and the only network requests it makes are directly from your browser to the AI
provider **you** choose (or a custom endpoint **you** configure).

## Data the extension stores locally

The following is saved with `chrome.storage.local` **in your browser only**. It is
never transmitted to the developer and there is no remote copy:

- Your **API key(s)** for the AI provider(s) you configure.
- Your **custom endpoint URL** (only if you use the "Custom" provider).
- Your settings: selected provider, model, reply mode, persona / extra instructions,
  prompt templates, comment-filter pattern, enabled platforms, and interface language.

## Data the extension transmits, and to whom

When you ask CommentBot to draft a reply (by clicking the generate button or by
focusing a reply box in an auto mode), the extension sends the following **directly
from your browser** to the AI provider you selected:

- The **text of the comment** you are replying to.
- Limited **page context**: the commenter's displayed name/handle, the post/video
  title, and the channel/page owner name.
- Your **persona / extra instructions** and prompt templates.
- Your **API key**, sent as an authentication header so the provider can bill and
  authorize the request.

The recipient is whichever provider you configured:

| Provider you chose | Data is sent to |
| --- | --- |
| Claude (Anthropic) | `api.anthropic.com` |
| DeepSeek | `api.deepseek.com` |
| ChatGPT (OpenAI) | `api.openai.com` |
| Gemini (Google) | `generativelanguage.googleapis.com` |
| Custom (OpenAI-compatible) | **the exact URL you type in** |

Each provider processes the request under **its own** privacy policy and terms.
CommentBot is not affiliated with these providers.

### Custom endpoints

If you select the "Custom" provider, the comment text, page context, and your API key
are sent to **whatever URL you enter**. The developer has no control over that server
and cannot vet it. If that URL uses plain `http://` (not `https://`) and is not a
local address, the data — **including your API key** — is sent unencrypted; the
extension shows a warning in that case. Prefer `https://` for anything that is not a
local endpoint (e.g. Ollama / LM Studio on `localhost`).

## Data the extension does NOT do

- It does **not** send any data to the developer or to any analytics/telemetry service.
- It does **not** sell or share your data with third parties.
- It does **not** use your data for advertising, profiling, or creditworthiness.
- It does **not** collect data beyond what is needed to draft the reply you requested.

## Permissions

- **storage** — to save your settings and API key(s) locally in your browser.
- **Host access to the four provider APIs** — to send the drafting request to the
  provider you chose.
- **Optional host access** (`https://*/*`, `http://*/*`) — requested **only at runtime,
  and only for the specific host** of a custom endpoint you configure, when you press
  "Test connection". A default install never uses this.

## Your control

- Delete your stored data at any time by removing the extension, or by clearing the
  extension's storage from `chrome://extensions`.
- Revoke a custom endpoint's host access at any time from the extension's site-access
  settings.

## Contact

Questions about this policy: **zezectf@gmail.com**
Source code: https://github.com/zeze-zeze/CommentBot
