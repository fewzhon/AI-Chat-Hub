// content.js
let isBlockingEnabled = true; // Cache the setting

// Load initial setting
chrome.storage.sync.get(["geminiBlockEnabled"], function (result) {
  isBlockingEnabled = result.geminiBlockEnabled ?? true;
  console.log("Initial blocking state:", isBlockingEnabled);
});

// Listen for storage changes
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if (namespace === 'sync' && changes.geminiBlockEnabled) {
    isBlockingEnabled = changes.geminiBlockEnabled.newValue ?? true;
    console.log("Blocking state changed to:", isBlockingEnabled);
  }
});

function attachKeyInterceptor(targetEl) {
  if (!targetEl) return;
  
  // Remove any existing listener to prevent duplicates
  if (targetEl.geminiKeyListener) {
    targetEl.removeEventListener("keydown", targetEl.geminiKeyListener, true);
  }
  
  // Create the listener function
  const keyListener = function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // Check if blocking is enabled (using cached value)
      if (isBlockingEnabled) {
        console.log("🚫 Enter key blocked by extension");
        
        // Block the event immediately (synchronously)
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Insert a line break using document.execCommand (more reliable)
        try {
          document.execCommand('insertHTML', false, '<br>');
        } catch (err) {
          // Fallback method
          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const br = document.createElement('br');
            range.insertNode(br);
            range.setStartAfter(br);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
        
        console.log("🚫 Blocked Enter key - inserted line break instead");
        return false; // Extra prevention
      } else {
        console.log("✅ Enter key allowed - blocking disabled");
        // Don't prevent the event - let it submit normally
      }
    } else if (e.key === "Enter" && e.shiftKey) {
      console.log("✅ Shift+Enter allowed - will submit");
    }
  };
  
  // Store reference to the listener for cleanup
  targetEl.geminiKeyListener = keyListener;
  
  // Add listener with capture=true to catch it early
  targetEl.addEventListener("keydown", keyListener, true);
  
  // Also add a keypress listener as backup
  const keypressListener = function(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (isBlockingEnabled) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log("🚫 Also blocked on keypress");
        return false;
      }
    }
  };
  
  targetEl.geminiKeypressListener = keypressListener;
  targetEl.addEventListener("keypress", keypressListener, true);
}

// Function to find and attach to Gemini input elements
function findAndAttachToGeminiInput() {
  // Specific selectors based on actual Gemini DOM structure
  const selectors = [
    "div.ql-editor.textarea[contenteditable='true']",
    "div.ql-editor[data-placeholder*='Enter a prompt']",
    "div.ql-editor[aria-label*='Enter a prompt']",
    "div.ql-editor[contenteditable='true']",
    "[role='textbox'][contenteditable='true']",
    "rich-textarea div.ql-editor[contenteditable='true']"
  ];
  
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(element => {
      if (!element.dataset.geminiListenerAttached) {
        attachKeyInterceptor(element);
        element.dataset.geminiListenerAttached = "true";
        console.log("✅ Attached keydown listener to Gemini input:", selector);
      }
    });
  }
}

// Initial attachment
findAndAttachToGeminiInput();

// MutationObserver for dynamic loading (replaces deprecated DOMNodeInserted)
const observer = new MutationObserver((mutations) => {
  let shouldCheck = false;
  
  mutations.forEach((mutation) => {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      shouldCheck = true;
    }
  });
  
  if (shouldCheck) {
    findAndAttachToGeminiInput();
  }
});

// Start observing
observer.observe(document.body, { 
  childList: true, 
  subtree: true,
  attributes: false,
  attributeOldValue: false,
  characterData: false,
  characterDataOldValue: false
});

// Cleanup function
function cleanup() {
  if (observer) {
    observer.disconnect();
  }
}

// Listen for page unload to cleanup
window.addEventListener('beforeunload', cleanup);

// Also try to attach on page load events
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', findAndAttachToGeminiInput);
} else {
  // Document is already loaded
  findAndAttachToGeminiInput();
}