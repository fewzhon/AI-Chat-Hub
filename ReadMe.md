# AI Chat Hub

A versatile Chrome extension to access multiple AI assistants from a side panel via a persistent, scrollable tab bar - and chat directly with the Gemini API.

# AI Chat Hub Screenshot
<img width="1905" height="1152" alt="Image" src="https://github.com/user-attachments/assets/2e640d15-e5f7-452d-acbb-5d0cf9bf87ad" />

## ✨ Features

- **Persistent tab bar**: Always-visible scrollable tab strip at the top of the side panel. One click switches between any AI - no more navigating back to the welcome screen first.
- **16 AI services out of the box**: Gemini, ChatGPT, Claude, Perplexity, Copilot, Grok, Meta AI, DeepSeek, Mistral, Poe, You.com, Qwen, Kimi, Z.ai, Genspark - plus a built-in Quick Chat using the Gemini API.
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
2. Add its key to `TAB_ORDER` where you want it to appear in the tab bar.
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
