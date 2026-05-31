# AI Chat Hub

A versatile Chrome extension to access multiple AI assistants from a side panel via a persistent, scrollable tab bar - and chat directly with the Gemini API.

# AI Chat Hub Screenshot
<img width="1905" height="1152" alt="Image" src="https://github.com/user-attachments/assets/2e640d15-e5f7-452d-acbb-5d0cf9bf87ad" />

## ✨ Features

- **Customisable, persistent tab bar (starts empty)**: Always-visible scrollable tab strip at the top of the side panel. On first install the bar is **empty** so you only see the AI services you actually use - the welcome screen guides you to add your first one via the **+** button.
    -   **Drag to reorder** any tab to whatever position you like.
    -   **Hover a tab and click ×** to remove it from your tab bar. Built-in platforms can be re-added at any time; custom platforms (see below) are deleted when their tab is removed.
    -   **Click +** at the end of the tab bar to pick from the remaining built-in platforms, or to add a **Custom platform** of your own (name, URL, icon emoji). Custom platforms behave just like built-ins after they're added - reorderable, removable, persistent across reloads.
    -   Your tab order is persisted in `chrome.storage.local` and survives reloads and browser restarts. The welcome-screen cards mirror your selection so you only see the platforms you actually use.
    -   **Caveat for custom platforms**: many sites block being embedded in iframes via `X-Frame-Options` or `Content-Security-Policy`. If your custom site doesn't load inside the side panel, use the ↗ **Open in new tab** button to launch it directly in a browser tab. Built-in platforms ship with header-stripping rules that work around this; custom ones do not.
- **30 AI services out of the box, grouped by region** — plus a built-in Quick Chat using the Gemini API and a Compare mode that broadcasts one prompt to several AIs at once.
    - **International AI (16)**: ChatGPT, Claude, Copilot (Microsoft), Copilot (GitHub), Felo, Gemini, Genspark, Grok, Liner, Meta AI, Mistral, Perplexity, Poe, Qwen Chat, You.com, Z.ai.
    - **Chinese AI (14)**: ChatGLM, DeepSeek, DouBao, Ernie Bot, Kimi, LingGuang, LongCat, MetaSo, MiniMax AI, NaMi AI Search, Qwen (Tongyi), SenseChat, StepFun (Yuewen), YuanBao.
    - When you click the **+** in the tab strip (or the **+ Add your first platform** CTA on the welcome screen), the picker groups everything as `INTERNATIONAL AI` / `CHINESE AI` sections, with Quick Chat & Compare pinned at the top and a `Custom platform…` entry at the bottom for adding your own URLs.
- **Compare mode (multi-AI broadcast)**: Send a single prompt to Gemini, ChatGPT, Claude, Perplexity, and DeepSeek simultaneously. Each AI is shown in its own collapsible panel with a checkbox to toggle inclusion. Click **Pop out** to open the full-tab desktop view, which now ships with **seven layout options** — `Auto (fit to width)` (default — fills your monitor by sizing columns to a comfortable minimum, no manual tweaking), `Side-by-side` (every AI is a vertical column, all visible at once, horizontal scroll for overflow), `Stack`, and explicit `2/3/4/5` column grids. Your layout choice is persisted in `chrome.storage.local` so the popout opens the same way next time. Prompt and selected AIs still carry over via `chrome.storage.session`.
- **Prompt library with variables**: Save commonly-used prompts as reusable templates and insert them with one click from Quick Chat or Compare via the 📋 picker. Templates support `{{placeholder}}` syntax — when you pick a template, the picker shows a small fill-in form (one field per unique variable) so you can customise it before inserting. Search across saved titles and bodies; manage (add / edit / delete) prompts from a dedicated Prompts view. Persists to `chrome.storage.local` and live-syncs between the side panel and the Compare popout.
- **Quick Chat polish — streaming + Markdown**: Assistant replies stream in token-by-token using Gemini's `streamGenerateContent` endpoint (no more long blank waits), with a blinking cursor while a reply is in progress. Replies are rendered as Markdown — bold, italics, headings, ordered/unordered lists, fenced code blocks, inline code, and links all display with proper formatting. The Markdown renderer is XSS-safe (HTML is escaped before any token transforms) and streaming-safe (in-progress code blocks render correctly until they close).
- **Quick Chat conversation sessions**: Keep multiple isolated conversations in Quick Chat instead of one ever-growing log. The Quick Chat header now shows the current conversation's name with a `▾` dropdown — click it to switch between any saved conversation, start a `+ New conversation`, `✎ Rename` the current one, or `🗑 Delete` it entirely. Each session has its own message history, so the model only sees context from the conversation you're in. Existing single-history users are migrated transparently into a "Chat 1" session on first load — no data loss.
- **Light, Dark, and System themes**: Pick your preferred theme from settings; "System" automatically follows your OS preference and live-updates on changes.
- **Direct API chat**: Talk to the Gemini API with your own key - send/receive messages with full conversation context, persisted locally. Defaults to `gemini-2.5-flash`. Your API key and chat history are stored locally via `chrome.storage.local`.
- **Resilient iframe loading**: Each service has fallback URLs - if the main URL fails to embed, the extension automatically tries alternatives. Sites that can't be embedded show a clean "Open in new tab" fallback page.
- **Gemini Enter key blocker**: Optional content script that intercepts Enter on the Gemini website so it inserts a newline; Shift+Enter sends. Useful for avoiding accidental submissions.
- **Last-state restore**: Re-opens the panel on whichever service you were last using.

## 📁 File Structure

Your extension folder should contain the following files:


AI-Chat-Hub/
├── manifest.json
├── background.js
├── content.js
├── sidepanel.html
├── sidepanel.js
├── rules.json
└── icons/ (optional)
├── icon16.png
├── icon48.png
└── icon128.png


## 🚀 Installation Instructions

1.  **Download the Files**: Create a new folder on your computer named `AI-Chat-Hub` and save all the necessary files (`manifest.json`, `background.js`, etc.) inside it.
2.  **Open Chrome Extensions**: Open Google Chrome and navigate to `chrome://extensions/`.
3.  **Enable Developer Mode**: In the top-right corner of the extensions page, turn on the "Developer mode" toggle.
4.  **Load the Extension**: Click the "Load unpacked" button that appears on the left.
5.  **Select the Folder**: In the file dialog, select the `AI-Chat-Hub` folder you created in step 1.
6.  **Done!**: The "AI Chat Hub" extension should now appear in your extensions list and be available in your Chrome toolbar.

## 🎯 How to Use

- **Opening the Hub**: Click the extension icon in your Chrome toolbar to open the AI Chat Hub in the side panel.
- **Switching AIs**: Use the tab bar at the top to instantly switch between services. The 🏠 button on the left returns to the home/welcome screen; ↻ reloads the current view; ⚙️ opens settings.
- **Welcome / Home view**: Lists every service as a card. Each web service also has a ↗ button that opens the service in a new browser tab (useful when a service is being uncooperative inside the iframe).
- **Compare mode**:
    1.  Click the 🔄 Compare tab (or the Compare card on the home screen).
    2.  Type a prompt at the top, uncheck any AIs you don't want to receive it, press Enter (or click Send).
    3.  Each panel can be collapsed, reloaded, or opened in a new browser tab via its mini-toolbar.
    4.  Click ↗ Pop out to open the same view in a full browser tab with 1, 2, or 3-column layouts.
    5.  Selectors for each AI's prompt input and send button are bundled in `broadcast-injector.js` and may need occasional tuning if a site redesigns its DOM. Failures show as a per-panel error stripe; they don't break other panels.
- **Prompt library**:
    1.  Click the 📋 button next to the Quick Chat input or the Compare prompt bar.
    2.  Pick a saved prompt to insert it into the input (it replaces any selected text, or inserts at the cursor).
    3.  Click "Manage prompts..." in the picker to open the Prompts management view in the side panel (add / edit / delete).
    4.  Prompts are stored locally via `chrome.storage.local` and live-update across the side panel and popout if you edit them in one place.
- **Variables (`{{placeholder}}`) in prompts**:
    -   Anywhere in a prompt body, write `{{name}}` to mark a placeholder. Names match `[\w-]+` and the same name can repeat (you only fill it once; all occurrences are substituted).
    -   When you select a template that has variables, the picker swaps to a small fill-in form with one auto-resizing field per unique variable. Press `Enter` to advance between fields, `Enter` on the last field (or click **Insert**) to commit, `Esc` to back out to the list.
    -   Prompts that use variables get a small `⟨N fields⟩` badge in the list so you know what to expect.
    -   Leave a field blank and the literal `{{name}}` stays in the inserted text (useful for partial templates).
- **Import / Export prompt library**:
    -   In the Prompts management view, click **📤 Export** to download your entire library as a JSON file named like `ai-chat-hub-prompts-YYYY-MM-DD.json`.
    -   Click **📥 Import** to pick a previously-exported file (or any JSON shaped like `{ "prompts": [...] }` / a bare array). Imported prompts are always **added** with fresh ids - existing prompts are never overwritten, so importing the same file twice will produce duplicates rather than data loss.
    -   Entries missing a title or body are skipped and counted in the summary so partial / corrupted files don't kill the whole import.
    -   Export format: `{ "format": "ai-chat-hub-prompts", "version": 1, "exportedAt": <ms>, "prompts": [{ "id", "title", "body", "createdAt", "updatedAt" }, ...] }`.
- **Quick Chat — streaming & Markdown**:
    -   Replies stream in as Gemini generates them; a blinking cursor marks the active assistant message.
    -   Common Markdown is rendered automatically (bold, italics, `inline code`, fenced code blocks with language hints, ordered/unordered lists, headings, horizontal rules, links).
    -   Links open in new tabs with `rel="noopener noreferrer"`; only `http(s)://` and `mailto:` schemes are honoured.
    -   Auto-scrolling sticks to the bottom only while you're already there; scroll up to read earlier content and the view stays put.
- **API Chat (Quick Chat)**:
    1.  Click the ✨ Quick Chat tab.
    2.  On first use you'll be asked for a Gemini API key. Get one from [Google AI Studio](https://aistudio.google.com/app/apikey).
    3.  Type a message and press Enter to send (Shift+Enter inserts a newline). Conversation context is maintained across turns.
    4.  Use the **Clear** button in the chat header (or the equivalent in Settings) to wipe the conversation.
- **Settings**:
    - **Theme** - Light / System / Dark.
    - **Gemini Enter Key Blocker** - toggles the content script on gemini.google.com.
    - **Change API Key** - replace your stored Gemini API key.
    - **Clear Chat History** - wipe the saved Quick Chat conversation.

## ➕ Adding Your Own AI Service

To add a new service, edit `sidepanel.js`:

1. Add an entry to `SITE_CONFIGS` with `name`, `icon`, `description`, `url`, `fallbackUrls`, and `kind: 'web'`.
2. Add its key to `DEFAULT_TAB_ORDER` where you want it to appear by default for new installs (existing users keep their saved order; new platforms surface via the + picker).
3. Add the host(s) to `host_permissions` in `manifest.json`.
4. Add the bare domain to `requestDomains` in `rules.json` so the extension strips iframe-blocking headers for it.

That's it - the tab bar and welcome screen render dynamically from `SITE_CONFIGS`.

## 🔧 Technical Details

- **Manifest V3**: Utilizes the latest, most secure Chrome extension platform.
- **Side Panel API**: Natively integrates with Chrome's side panel for a seamless user experience.
- **Declarative Net Request API**: Modifies network headers to allow AI websites to be embedded, bypassing `X-Frame-Options` restrictions.
- **Content Scripts**: Injects JavaScript into the Gemini website to enable the Enter key blocking feature.
- **Storage API**: Uses `chrome.storage.sync` to save the Enter key blocker preference and `chrome.storage.local` to securely store the user's API key and chat history.

## 🌐 Browser Compatibility

This extension is built using the latest Chrome Extension APIs (Manifest V3). Its compatibility with various browsers is as follows:

-   ✅ **Google Chrome**: Fully supported.
-   ✅ **Microsoft Edge**: Fully supported (built on Chromium).
-   ✅ **Brave Browser**: Fully supported (built on Chromium).
-   ✅ **Opera**: Fully supported (built on Chromium).
-   ❌ **Mozilla Firefox**: **Not supported.** Firefox uses a different extension API and does not support Chrome's Side Panel API.
-   ❌ **Safari**: **Not supported.** Safari has its own separate extension ecosystem.

## 🛠 Troubleshooting

- **"Refused to Connect" Errors**: The extension uses the Declarative Net Request API to allow websites to be embedded. However, some services have very strict policies that may still prevent them from loading correctly in the side panel. If a service fails to load, try refreshing the side panel or using the web version in a new tab.
- **Enter Key Blocker Not Working**: Ensure the feature is enabled in the Settings menu. The script is designed to run only on `https://gemini.google.com/`.
- **Menu Handle Overlaps Website UI**: The handle is positioned to avoid common UI elements, but some websites may have conflicting layouts.
