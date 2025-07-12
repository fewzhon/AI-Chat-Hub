// sidepanel.js
class AiChatHub {
  constructor() {
    // Use a helper to safely get elements
    const getEl = (id) => document.getElementById(id);

    this.elements = {
      // Views
      welcomeScreen: getEl('welcomeScreen'),
      webContainer: getEl('webContainer'),
      apiKeySetup: getEl('apiKeySetup'),
      chatContainer: getEl('chatContainer'),
      // Main Controls
      mainControlBar: getEl('mainControlBar'),
      showBarHandle: getEl('showBarHandle'),
      backBtn: getEl('backBtn'),
      siteName: getEl('siteName'),
      reloadButton: getEl('reloadButton'),
      // Web View
      webFrame: getEl('webFrame'),
      // API Setup
      apiKeyInput: getEl('apiKeyInput'),
      saveApiKeyBtn: getEl('saveApiKeyBtn'),
      backToOptionsFromApi: getEl('backToOptionsFromApi'),
      // Chat View
      messageInput: getEl('messageInput'),
      sendBtn: getEl('sendBtn'),
      messages: getEl('messages'),
      // Settings Modal
      settingsBtn: getEl('settingsBtn'),
      settingsModal: getEl('settingsModal'),
      closeSettingsBtn: getEl('closeSettingsBtn'),
      toggleBlocker: getEl('toggleBlocker'),
      changeApiKeyBtn: getEl('changeApiKeyBtn'),
    };

    this.siteConfigs = {
      api: { name: '✨ Quick Chat' },
      gemini: { 
        url: 'https://gemini.google.com/', 
        name: '🤖 Gemini',
        fallbackUrls: ['https://gemini.google.com/app', 'https://bard.google.com/'],
        embeddable: true
      },
      chatgpt: { 
        url: 'https://chatgpt.com/', 
        name: '💬 ChatGPT',
        fallbackUrls: ['https://chat.openai.com/', 'https://platform.openai.com/'],
        embeddable: true
      },
      perplexity: { 
        url: 'https://www.pplx.ai', 
        name: '🔍 Perplexity',
        fallbackUrls: ['https://perplexity.ai/'],
        embeddable: true,
        reason: 'Strict CSP policy'
      },
      copilot: { 
        url: 'https://copilot.microsoft.com/chats', 
        name: '🚀 Copilot',
        fallbackUrls: ['https://copilot.microsoft.com/', 'https://www.bing.com/chat'],
        embeddable: true
      },
      claude: { 
        url: 'https://claude.ai/new', 
        name: '🧠 Claude',
        fallbackUrls: ['https://claude.ai/', 'https://claude.ai/chats'],
        embeddable: true
      },
      grok: {
        url: 'https://grok.com/', // Replace with actual Grok URL if different
        name: '☀️ Grok',
        fallbackUrls: ['https://x.com/','https://accounts.x.ai'],
        embeddable: true // Assume embeddable, adjust if needed
      },
      meta: {
        url: 'https://meta.ai/', // Replace with actual Meta AI URL if different
        name: '✨ Meta AI',
        fallbackUrls: ['https://ai.meta.com/', 'https://www.facebook.com/'],
        embeddable: true // Assume embeddable, adjust if needed
      },
    };

    this.apiKey = null;
    this.chatHistory = [];
    this.loadAttempts = {};
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.loadSettings();
    await this.loadLastState();
  }

  setupEventListeners() {
    // Show/Hide main control bar via handle
    this.elements.showBarHandle.addEventListener('click', () => {
      this.elements.mainControlBar.classList.toggle('is-visible');
      this.elements.showBarHandle.classList.toggle('is-open');
    });

    // Option selection from welcome screen
    document.querySelectorAll('.option-card').forEach(card => {
      card.addEventListener('click', () => this.handleOptionClick(card.dataset.site));
    });
	  
	// API Card event listeners
document.querySelectorAll('.api-card').forEach(apiCard => {
  apiCard.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent triggering the main card click
    const siteKey = apiCard.dataset.site;
    const container = apiCard.closest('.option-card-container');
    
    if (container.classList.contains('api-expanded')) {
      // If already expanded, collapse
      this.collapseApiCard(container);
    } else {
      // Expand this API card
      this.expandApiCard(container, siteKey);
    }
  });
});

    // FIXED: Open in new tab functionality - updated to use correct class name
    document.querySelectorAll('.new-tab-button').forEach(newTabButton => {
      newTabButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent the click from triggering the parent card
        const url = newTabButton.dataset.url;
        if (url) {
          chrome.tabs.create({ url: url });
        }
      });
    });

    // Reload button
    this.elements.reloadButton.addEventListener('click', () => {
      if (this.elements.webFrame.src) {
        this.elements.webFrame.src = this.elements.webFrame.src; // Reloads the iframe
      }
    });

    // Control bar buttons
    this.elements.backBtn.addEventListener('click', () => this.showWelcomeScreen());
    this.elements.settingsBtn.addEventListener('click', () => this.openSettings());

    // API Setup buttons
    this.elements.backToOptionsFromApi.addEventListener('click', () => this.showWelcomeScreen());
    this.elements.saveApiKeyBtn.addEventListener('click', () => this.saveApiKey());

    // Settings Modal listeners
    this.elements.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
    this.elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === this.elements.settingsModal) this.closeSettings();
    });
    this.elements.toggleBlocker.addEventListener('change', (e) => {
      this.saveSetting('geminiBlockEnabled', e.target.checked, 'sync');
    });
    this.elements.changeApiKeyBtn.addEventListener('click', () => {
        this.closeSettings();
        this.showView('apiKeySetup', 'api');
    });

    // Enhanced iframe error handling
    this.elements.webFrame.addEventListener('load', () => this.handleFrameLoad());
    this.elements.webFrame.addEventListener('error', (e) => this.handleFrameError(e));
    
    // Listen for CSP violations
    document.addEventListener('securitypolicyviolation', (e) => this.handleCSPViolation(e));
    
    // Monitor for frame loading issues
    this.setupFrameMonitoring();
  }

  setupFrameMonitoring() {
  this.frameLoadTimeout = null;
  
  // Monitor frame load events
  this.elements.webFrame.addEventListener('load', () => {
    if (this.frameLoadTimeout) {
      clearTimeout(this.frameLoadTimeout);
      this.frameLoadTimeout = null;
    }
    this.handleFrameLoad();
  });
  
  // Monitor frame error events
  this.elements.webFrame.addEventListener('error', (e) => {
    if (this.frameLoadTimeout) {
      clearTimeout(this.frameLoadTimeout);
      this.frameLoadTimeout = null;
    }
    this.handleFrameError(e);
  });
}

  handleCSPViolation(event) {
  console.log('CSP Violation detected:', event);
  
  // Check if this is a frame-ancestors violation (most common for embedding restrictions)
  if (event.violatedDirective && (
    event.violatedDirective.includes('frame-ancestors') ||
    event.violatedDirective.includes('frame-src')
  )) {
    const blockedUrl = event.blockedURI || event.documentURI || event.sourceFile;
    console.log('Frame embedding violation for:', blockedUrl);
    
    // Find which site this relates to
    const siteKey = this.findSiteKeyByUrl(blockedUrl);
    if (siteKey) {
      this.markSiteAsNonEmbeddable(siteKey, 'CSP frame-ancestors policy');
    }
  }
}


  handleFrameLoad() {
  try {
    // Try to access the iframe's content
    const frameDoc = this.elements.webFrame.contentDocument || this.elements.webFrame.contentWindow.document;
    const currentUrl = this.elements.webFrame.contentWindow.location.href;
    
    // Check if we're on an error page or blocked page
    if (this.isBlockedPage(currentUrl)) {
      console.log('Blocked page detected:', currentUrl);
      if (this.currentSiteKey) {
        this.markSiteAsNonEmbeddable(this.currentSiteKey, 'Content blocked by service');
      }
      return;
    }
    
    // Reset load attempts on successful load
    if (this.currentSiteKey) {
      this.loadAttempts[this.currentSiteKey] = 0;
    }
    
    // Check for auth redirects
    if (this.isAuthRedirect(currentUrl)) {
      console.log('Auth redirect detected:', currentUrl);
      this.showAuthNotification();
    }
    
  } catch (error) {
    // Cross-origin restrictions prevent access - this is normal
    console.log('Frame loaded (cross-origin protected)');
    
    // Set up a delayed check to see if the frame actually loaded content
    setTimeout(() => {
      if (this.currentSiteKey && this.elements.webFrame.src) {
        this.checkFrameContent();
      }
    }, 2000);
  }
}

  // Check if frame content actually loaded
checkFrameContent() {
  try {
    // Try to detect if the frame is showing an error page
    const frameWindow = this.elements.webFrame.contentWindow;
    if (frameWindow) {
      // Some basic checks that might indicate problems
      frameWindow.postMessage('ping', '*');
      
      // Listen for a response (or lack thereof)
      const messageHandler = (event) => {
        if (event.source === frameWindow) {
          // Frame is responsive
          window.removeEventListener('message', messageHandler);
        }
      };
      
      window.addEventListener('message', messageHandler);
      
      // If no response after 3 seconds, assume there might be an issue
      setTimeout(() => {
        window.removeEventListener('message', messageHandler);
        // Could implement additional checks here
      }, 3000);
    }
  } catch (error) {
    // Normal cross-origin behavior
  }
}

// Detect common blocked page patterns
isBlockedPage(url) {
  const blockedPatterns = [
    'chrome-error://',
    'chrome://network-error/',
    'about:blank',
    'data:text/html,chromewebdata',
    'chrome-extension://invalid'
  ];
  
  return blockedPatterns.some(pattern => url.includes(pattern));
}

  findSiteKeyByUrl(url) {
  if (!url) return null;
  
  // Normalize URL to handle various formats
  let normalizedUrl = url.toLowerCase();
  
  for (const [key, config] of Object.entries(this.siteConfigs)) {
    if (config.url) {
      try {
        const configHostname = new URL(config.url).hostname.toLowerCase();
        if (normalizedUrl.includes(configHostname)) {
          return key;
        }
      } catch (e) {
        // Fallback to string matching if URL parsing fails
        if (normalizedUrl.includes(config.url.toLowerCase())) {
          return key;
        }
      }
    }
    
    // Check fallback URLs
    if (config.fallbackUrls) {
      for (const fallback of config.fallbackUrls) {
        try {
          const fallbackHostname = new URL(fallback).hostname.toLowerCase();
          if (normalizedUrl.includes(fallbackHostname)) {
            return key;
          }
        } catch (e) {
          // Fallback to string matching
          if (normalizedUrl.includes(fallback.toLowerCase())) {
            return key;
          }
        }
      }
    }
  }
  
  return null;
}

  markSiteAsNonEmbeddable(siteKey, reason) {
    if (this.siteConfigs[siteKey]) {
      this.siteConfigs[siteKey].embeddable = false;
      this.siteConfigs[siteKey].reason = reason;
      
      // If this site is currently being viewed, show the non-embeddable message
      if (this.currentSiteKey === siteKey) {
        this.showNonEmbeddableMessage(siteKey);
      }
    }
  }

  // --- Enhanced Frame Loading with Error Handling ---

  handleFrameLoad() {
    // Clear the load timeout since the frame loaded successfully
    if (this.frameLoadTimeout) {
      clearTimeout(this.frameLoadTimeout);
      this.frameLoadTimeout = null;
    }
    
    try {
      // Check if the iframe loaded successfully
      const frameDoc = this.elements.webFrame.contentDocument || this.elements.webFrame.contentWindow.document;
      
      // Reset load attempts on successful load
      if (this.currentSiteKey) {
        this.loadAttempts[this.currentSiteKey] = 0;
      }
      
      // Check for common redirect patterns that indicate auth/consent issues
      const currentUrl = this.elements.webFrame.contentWindow.location.href;
      if (this.isAuthRedirect(currentUrl)) {
        console.log('Auth redirect detected:', currentUrl);
        this.showAuthNotification();
      }
    } catch (error) {
      // Cross-origin restrictions prevent us from accessing iframe content
      // This is normal behavior, so we don't treat it as an error
      console.log('Frame loaded (cross-origin)');
    }
  }

  handleFrameError(event) {
    console.error('Frame loading error:', event);
    if (this.currentSiteKey) {
      this.tryFallbackUrl(this.currentSiteKey);
    }
  }

  isAuthRedirect(url) {
    const authPatterns = [
      'consent.google.com',
      'accounts.google.com',
      'auth0.openai.com',
      'login.microsoftonline.com',
      'login.live.com',
      '/auth/',
      '/login/',
      '/signin/'
    ];
    
    return authPatterns.some(pattern => url.includes(pattern));
  }

  tryFallbackUrl(siteKey) {
    const config = this.siteConfigs[siteKey];
    if (!config || !config.fallbackUrls) return;

    const attempts = this.loadAttempts[siteKey] || 0;
    
    if (attempts < config.fallbackUrls.length) {
      const fallbackUrl = config.fallbackUrls[attempts];
      console.log(`Trying fallback URL for ${siteKey}: ${fallbackUrl}`);
      
      this.loadAttempts[siteKey] = attempts + 1;
      this.elements.webFrame.src = fallbackUrl;
    } else {
      this.showLoadErrorMessage(siteKey);
    }
  }

  showAuthNotification() {
    // Create a temporary notification
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ff9800;
      color: white;
      padding: 12px;
      border-radius: 8px;
      z-index: 10000;
      font-size: 14px;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    notification.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px;">⚠️ Authentication Required</div>
      <div>Please complete the authentication process in the iframe, then refresh if needed.</div>
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 10000);
  }

  showNonEmbeddableMessage(siteKey) {
  const config = this.siteConfigs[siteKey];
  const reason = config.reason || 'security restrictions';
  
  this.showView('webContainer', siteKey);
  
  // Create a proper document structure instead of using onclick attributes
  const messageHtml = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; text-align: center; background: #f8f9fa;">
      <div style="font-size: 48px; margin-bottom: 20px;">${config.name.split(' ')[0]}</div>
      <h3 style="margin-bottom: 16px; color: #1976d2;">${config.name}</h3>
      <p style="color: #666; margin-bottom: 8px; max-width: 400px;">
        This service cannot be embedded due to ${reason}.
      </p>
      <p style="color: #666; margin-bottom: 24px; max-width: 400px;">
        Click the button below to open it in a new browser tab.
      </p>
      <button id="openInNewTab" style="
        background: #1976d2; 
        color: white; 
        border: none; 
        padding: 16px 32px; 
        border-radius: 8px; 
        cursor: pointer;
        font-size: 16px;
        font-weight: 500;
        box-shadow: 0 2px 8px rgba(25, 118, 210, 0.3);
        transition: all 0.2s ease;
      ">
        Open ${config.name} in New Tab
      </button>
      <div style="margin-top: 20px; padding: 16px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107; max-width: 400px;">
        <div style="font-weight: 500; color: #856404; margin-bottom: 4px;">💡 Tip</div>
        <div style="color: #856404; font-size: 14px;">
          Some AI services have strict security policies that prevent embedding. 
          This is normal and protects your data.
        </div>
      </div>
    </div>
  `;
  
  this.elements.webFrame.srcdoc = messageHtml;
  
  // Add event listener after the iframe loads
  this.elements.webFrame.onload = () => {
    try {
      const iframeDoc = this.elements.webFrame.contentDocument || this.elements.webFrame.contentWindow.document;
      const button = iframeDoc.getElementById('openInNewTab');
      if (button) {
        button.addEventListener('click', () => {
          chrome.tabs.create({ url: config.url });
        });
        
        // Add hover effects
        button.addEventListener('mouseenter', () => {
          button.style.background = '#1565c0';
        });
        button.addEventListener('mouseleave', () => {
          button.style.background = '#1976d2';
        });
      }
    } catch (error) {
      console.log('Could not access iframe content (this is normal for cross-origin)');
    }
  };
}

  showLoadErrorMessage(siteKey) {
  const config = this.siteConfigs[siteKey];
  const errorHtml = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; text-align: center; background: #f5f5f5;">
      <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
      <h3 style="margin-bottom: 16px; color: #d32f2f;">Unable to load ${config.name}</h3>
      <p style="color: #666; margin-bottom: 20px; max-width: 400px;">
        The service might be temporarily unavailable or require authentication. 
        Try opening it in a new browser tab first, then return here.
      </p>
      <div style="display: flex; gap: 12px;">
        <button id="retryBtn" style="
          background: #1976d2; 
          color: white; 
          border: none; 
          padding: 12px 24px; 
          border-radius: 6px; 
          cursor: pointer;
          font-size: 14px;
        ">Retry</button>
        <button id="openNewTabBtn" style="
          background: #666; 
          color: white; 
          border: none; 
          padding: 12px 24px; 
          border-radius: 6px; 
          cursor: pointer;
          font-size: 14px;
        ">Open in New Tab</button>
      </div>
    </div>
  `;
  
  this.elements.webFrame.srcdoc = errorHtml;
  
  // Add event listeners after the iframe loads
  this.elements.webFrame.onload = () => {
    try {
      const iframeDoc = this.elements.webFrame.contentDocument || this.elements.webFrame.contentWindow.document;
      
      const retryBtn = iframeDoc.getElementById('retryBtn');
      const openNewTabBtn = iframeDoc.getElementById('openNewTabBtn');
      
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          location.reload();
        });
      }
      
      if (openNewTabBtn) {
        openNewTabBtn.addEventListener('click', () => {
          chrome.tabs.create({ url: config.url });
        });
      }
    } catch (error) {
      console.log('Could not access iframe content (this is normal for cross-origin)');
    }
  };
}


  // --- View & UI Management ---

  showView(viewName, siteKey) {
    // Hide all main views
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    
    // Show the target view
    if (this.elements[viewName]) {
        this.elements[viewName].classList.remove('hidden');
    }

    const config = this.siteConfigs[siteKey];
    if (config) {
      // If we are in a specific view (not welcome screen), show the handle
      this.elements.showBarHandle.classList.remove('hidden');
      this.elements.siteName.textContent = config.name;
      this.currentSiteKey = siteKey;
    } else {
      // Otherwise, we are on the welcome screen, so hide the handle
      this.elements.showBarHandle.classList.add('hidden');
      this.currentSiteKey = null;
    }

    // Ensure the control bar and handle start in the closed state
    this.elements.mainControlBar.classList.remove('is-visible');
    this.elements.showBarHandle.classList.remove('is-open');
  }

  handleOptionClick(siteKey) {
    if (siteKey === 'api') {
      if (this.apiKey) {
        this.showView('chatContainer', 'api');
      } else {
        this.showView('apiKeySetup', 'api');
      }
    } else if (this.siteConfigs[siteKey]) {
      const config = this.siteConfigs[siteKey];
      
      // Check if the service can be embedded
      if (config.embeddable === false) {
        this.showNonEmbeddableMessage(siteKey);
        return;
      }
      
      this.showView('webContainer', siteKey);
      
      // Reset load attempts for this site
      this.loadAttempts[siteKey] = 0;
      
      if (this.elements.webFrame.src !== config.url) {
        this.elements.webFrame.src = config.url;
      }
    }
    this.saveSetting('lastSite', siteKey, 'local');
  }
  
  expandApiCard(container, siteKey) {
  // Collapse any currently expanded API cards
  this.collapseAllApiCards();
  
  // Expand the clicked API card
  container.classList.add('api-expanded');
  this.elements.optionCards.classList.add('api-expanded');
  
  // Replace the API card content with the form
  const apiCard = container.querySelector('.api-card');
  const serviceName = this.siteConfigs[siteKey]?.name || siteKey;
  
  apiCard.innerHTML = `
    <div class="api-form">
      <div style="text-align: center; margin-bottom: 8px;">
        <span style="font-size: 16px;">🔑</span>
        <div style="font-size: 12px; font-weight: 600; color: #ff9800;">
          ${serviceName} API
        </div>
      </div>
      <input type="password" id="apiInput_${siteKey}" placeholder="Enter API key..." />
      <div class="api-buttons">
        <button class="api-save-btn" data-site="${siteKey}">Save</button>
        <button class="api-clear-btn" data-site="${siteKey}">Clear</button>
        <button class="api-back-btn" data-site="${siteKey}">Back</button>
      </div>
    </div>
  `;
  
  // Add event listeners to the new buttons
  this.setupApiFormListeners(apiCard, siteKey);
  
  // Focus on the input field
  setTimeout(() => {
    const input = apiCard.querySelector(`#apiInput_${siteKey}`);
    if (input) input.focus();
  }, 100);
}

setupApiFormListeners(apiCard, siteKey) {
  const saveBtn = apiCard.querySelector('.api-save-btn');
  const clearBtn = apiCard.querySelector('.api-clear-btn');
  const backBtn = apiCard.querySelector('.api-back-btn');
  const input = apiCard.querySelector(`#apiInput_${siteKey}`);
  
  saveBtn.addEventListener('click', () => {
    const apiKey = input.value.trim();
    if (apiKey) {
      this.saveServiceApiKey(siteKey, apiKey);
      this.showApiSavedFeedback(apiCard);
    } else {
      alert('Please enter an API key');
    }
  });
  
  clearBtn.addEventListener('click', () => {
    input.value = '';
    input.focus();
  });
  
  backBtn.addEventListener('click', () => {
    this.collapseApiCard(apiCard.closest('.option-card-container'));
  });
  
  // Enter key to save
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
  });
}

collapseApiCard(container) {
  container.classList.remove('api-expanded');
  this.elements.optionCards.classList.remove('api-expanded');
  
  // Restore original API card content
  const apiCard = container.querySelector('.api-card');
  const siteKey = apiCard.dataset.site;
  
  apiCard.innerHTML = `
    <span class="api-icon">🔑</span>
    <span class="api-label">API</span>
  `;
}

collapseAllApiCards() {
  document.querySelectorAll('.option-card-container.api-expanded').forEach(container => {
    this.collapseApiCard(container);
  });
}

async saveServiceApiKey(siteKey, apiKey) {
  try {
    await this.saveSetting(`${siteKey}_api_key`, apiKey, 'local');
    console.log(`API key saved for ${siteKey}`);
  } catch (error) {
    console.error('Error saving API key:', error);
    alert('Error saving API key. Please try again.');
  }
}

showApiSavedFeedback(apiCard) {
  const originalContent = apiCard.innerHTML;
  
  apiCard.innerHTML = `
    <div style="text-align: center; color: #4caf50;">
      <div style="font-size: 20px; margin-bottom: 8px;">✅</div>
      <div style="font-size: 12px; font-weight: 600;">API Key Saved!</div>
    </div>
  `;
  
  setTimeout(() => {
    this.collapseApiCard(apiCard.closest('.option-card-container'));
  }, 1500);
}

  showWelcomeScreen() {
  this.showView('welcomeScreen', null);
  this.collapseAllApiCards(); // Reset API card states
  this.saveSetting('lastSite', null, 'local');
}

  openSettings() { this.elements.settingsModal.classList.remove('hidden'); }
  closeSettings() { this.elements.settingsModal.classList.add('hidden'); }

  // --- State & Settings Logic ---
  
  async loadLastState() {
    const { lastSite } = await this.loadSetting('lastSite', 'local');
    if (lastSite) {
        this.handleOptionClick(lastSite);
    } else {
        this.showWelcomeScreen();
    }
  }
  
  async loadSettings() {
    const { geminiBlockEnabled } = await this.loadSetting('geminiBlockEnabled', 'sync', true);
    this.elements.toggleBlocker.checked = geminiBlockEnabled;
    
    const { geminiApiKey } = await this.loadSetting('geminiApiKey', 'local');
    if (geminiApiKey) {
      this.apiKey = geminiApiKey;
    }
  }

  async loadSetting(key, type = 'local', defaultValue = null) {
      try {
          const storageArea = type === 'sync' ? chrome.storage.sync : chrome.storage.local;
          const result = await storageArea.get({ [key]: defaultValue });
          return result;
      } catch (error) {
          console.error(`Error loading setting ${key}:`, error);
          return { [key]: defaultValue };
      }
  }

  async saveSetting(key, value, type = 'local') {
    try {
      const storageArea = type === 'sync' ? chrome.storage.sync : chrome.storage.local;
      await storageArea.set({ [key]: value });
    } catch (error) {
      console.error(`Error saving setting ${key}:`, error);
    }
  }

  // --- API & Chat Logic ---
  async saveApiKey() {
    const newApiKey = this.elements.apiKeyInput.value.trim();
    if (!newApiKey) {
      alert('Please enter an API key.');
      return;
    }
    this.apiKey = newApiKey;
    await this.saveSetting('geminiApiKey', newApiKey, 'local');
    this.elements.apiKeyInput.value = '';
    this.showView('chatContainer', 'api');
  }
}

// Initialize the app after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  new AiChatHub();
});