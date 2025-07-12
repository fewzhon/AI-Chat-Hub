// background.js

// This listener runs when the extension is first installed or updated.
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Chat Hub extension installed.');

  // Create a context menu item for easy access.
  chrome.contextMenus.create({
    id: 'openAiChatHub',
    title: 'Open AI Chat Hub',
    contexts: ['all']
  });
});

// This tells Chrome to open the side panel when the extension's toolbar icon is clicked.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Error setting side panel behavior:', error));

// This listener handles clicks on the context menu item.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'openAiChatHub') {
    // When the context menu is clicked, open the side panel for the current tab.
    chrome.sidePanel.open({ tabId: tab.id });
  }
});
