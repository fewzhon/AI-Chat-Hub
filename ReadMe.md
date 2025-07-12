# AI Chat Hub

A versatile Chrome extension to access multiple AI assistants (Gemini, ChatGPT, Claude, etc.) and chat directly with the Gemini API, all from the comfort of your side panel.

# AI Chat Hub Screenshot
<img width="1905" height="1152" alt="Image" src="https://github.com/user-attachments/assets/2e640d15-e5f7-452d-acbb-5d0cf9bf87ad" />

## ✨ Features

- **Multi-AI Access**: Quickly switch between popular AI services like Gemini, ChatGPT, Perplexity, Claude, and Copilot, all embedded directly in the side panel.
- **Direct API Chat**: A built-in chat client to interact with the Gemini API using your own key. Your chat history is saved locally and securely in your browser.
- **Sleek UI**: A modern interface with a hideable control bar, triggered by a menu handle (☰), to maximize screen space while you work.
- **Gemini Enter Key Blocker**: An optional feature that runs on the Gemini website to prevent accidental message submissions. When enabled, `Enter` creates a new line, and `Shift+Enter` submits.
- **Configurable Settings**: Easily toggle the Enter key blocker and manage your Gemini API key from the settings menu.

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
- **Selecting a Service**: From the welcome screen, click on any of the available AI services to load it in the side panel.
- **Navigating**: When viewing a service, a menu handle (☰) will appear at the top right. Click it to reveal the control bar, which contains a "Back" button to return to the welcome screen and a "Settings" button.
- **API Chat**:
    1.  Select "✨ Quick Chat (API)" from the welcome screen.
    2.  If it's your first time, you'll be prompted to enter a Gemini API key. You can get one from [Google AI Studio](https://aistudio.google.com/app/apikey).
    3.  Your key is saved locally, and you'll be taken directly to the chat interface on future visits.
- **Settings**:
    1.  Click the menu handle (☰) and then the "Settings" button.
    2.  In the modal, you can toggle the "Gemini Enter Key Blocker" on or off.
    3.  You can also choose to change your saved Gemini API key.

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
