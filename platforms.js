// =====================================================================
// platforms.js
// ---------------------------------------------------------------------
// SITE_CONFIGS - the canonical catalogue of every AI platform the
// extension knows about. Loaded by BOTH sidepanel.html (tab bar +
// welcome screen + add-tab picker) AND compare.html (compare tabbar +
// compare picker). Exposing as window globals keeps the include
// pattern dead-simple - no bundler, no module loader, no surprises.
//
// Each entry's contract:
//   name         (string)  - human-readable display label
//   icon         (string)  - single emoji, drawn in chip / tab / panel
//   description  (string)  - short subtitle used on welcome cards
//   url          (string)  - primary URL the iframe loads (web kinds)
//   fallbackUrls (string[])- tried in order if `url` errors out
//   embeddable   (boolean) - hint for the fallback "open in new tab" UX
//   kind         ('api' | 'compare' | 'web')
//   region       ('international' | 'chinese')  - omitted on meta kinds
//
// Mutations: custom user-added platforms are merged in at runtime by
// sidepanel.js's loadCustomPlatforms(); they are NOT defined here.
//
// BROADCAST_SUPPORTED_KEYS - the subset of platforms that the
// broadcast-injector.js content script knows selectors for. Used by
// the Compare tabbar to show "Auto-send unsupported" badges on
// panels the injector can't drive automatically.
// =====================================================================

(function () {
  'use strict';

  const SITE_CONFIGS = {
    // ---- First-class / meta tabs (no region) -------------------------
    api: {
      name: 'Quick Chat',
      icon: '✨',
      description: 'Chat directly with the Gemini API',
      kind: 'api',
    },
    compare: {
      name: 'Compare',
      icon: '🔄',
      description: 'Send one prompt to multiple AIs at once',
      kind: 'compare',
    },

    // ---- INTERNATIONAL AI -------------------------------------------
    chatgpt: {
      name: 'ChatGPT', icon: '💬',
      description: "OpenAI's conversational AI",
      url: 'https://chatgpt.com/',
      fallbackUrls: ['https://chat.openai.com/', 'https://platform.openai.com/'],
      embeddable: true, kind: 'web', region: 'international',
    },
    claude: {
      name: 'Claude', icon: '🧠',
      description: "Anthropic's helpful AI assistant",
      url: 'https://claude.ai/new',
      fallbackUrls: ['https://claude.ai/', 'https://claude.ai/chats'],
      embeddable: true, kind: 'web', region: 'international',
    },
    copilot: {
      name: 'Copilot', icon: '🚀',
      description: "Microsoft's AI assistant",
      url: 'https://copilot.microsoft.com/chats',
      fallbackUrls: ['https://copilot.microsoft.com/', 'https://www.bing.com/chat'],
      embeddable: true, kind: 'web', region: 'international',
    },
    'copilot-gh': {
      name: 'Copilot (GH)', icon: '🐙',
      description: 'GitHub Copilot',
      url: 'https://github.com/copilot',
      fallbackUrls: ['https://github.com/features/copilot'],
      embeddable: true, kind: 'web', region: 'international',
    },
    felo: {
      name: 'Felo', icon: '🌐',
      description: 'Felo AI search',
      url: 'https://felo.ai/search',
      fallbackUrls: ['https://felo.ai/'],
      embeddable: true, kind: 'web', region: 'international',
    },
    gemini: {
      name: 'Gemini', icon: '🤖',
      description: "Google's advanced AI assistant",
      url: 'https://gemini.google.com/',
      fallbackUrls: ['https://gemini.google.com/app', 'https://bard.google.com/'],
      embeddable: true, kind: 'web', region: 'international',
    },
    genspark: {
      name: 'Genspark', icon: '✦',
      description: 'Genspark AI agent',
      url: 'https://www.genspark.ai/',
      fallbackUrls: ['https://genspark.ai/'],
      embeddable: true, kind: 'web', region: 'international',
    },
    grok: {
      name: 'Grok', icon: '🌟',
      description: 'AI from xAI',
      url: 'https://grok.com/',
      fallbackUrls: ['https://x.com/i/grok', 'https://accounts.x.ai/'],
      embeddable: true, kind: 'web', region: 'international',
    },
    liner: {
      name: 'Liner', icon: '📏',
      description: 'Liner AI research assistant',
      url: 'https://getliner.com/',
      fallbackUrls: ['https://getliner.com/search', 'https://liner.com/'],
      embeddable: true, kind: 'web', region: 'international',
    },
    meta: {
      name: 'Meta AI', icon: '🔮',
      description: "Meta's AI assistant",
      url: 'https://www.meta.ai/',
      fallbackUrls: ['https://meta.ai/', 'https://ai.meta.com/'],
      embeddable: true, kind: 'web', region: 'international',
    },
    mistral: {
      name: 'Mistral', icon: '🌫️',
      description: "Mistral's Le Chat",
      url: 'https://chat.mistral.ai/chat',
      fallbackUrls: ['https://chat.mistral.ai/', 'https://mistral.ai/'],
      embeddable: true, kind: 'web', region: 'international',
    },
    perplexity: {
      name: 'Perplexity', icon: '🔍',
      description: 'AI-powered search and answers',
      url: 'https://www.perplexity.ai/',
      fallbackUrls: ['https://perplexity.ai/'],
      embeddable: true, kind: 'web', region: 'international',
    },
    poe: {
      name: 'Poe', icon: '🦜',
      description: "Quora's multi-model AI",
      url: 'https://poe.com/',
      fallbackUrls: ['https://www.poe.com/'],
      embeddable: true, kind: 'web', region: 'international',
    },
    qwen: {
      name: 'Qwen Chat', icon: '🦅',
      description: "Alibaba's Qwen Chat (international)",
      url: 'https://chat.qwen.ai/',
      fallbackUrls: ['https://qwen.ai/'],
      embeddable: true, kind: 'web', region: 'international',
    },
    you: {
      name: 'You.com', icon: '🟣',
      description: 'You.com AI search',
      url: 'https://you.com/',
      fallbackUrls: ['https://www.you.com/'],
      embeddable: true, kind: 'web', region: 'international',
    },
    zai: {
      name: 'Z.ai', icon: '⚡',
      description: "ZhiPu's GLM chat (international)",
      url: 'https://chat.z.ai/',
      fallbackUrls: ['https://z.ai/'],
      embeddable: true, kind: 'web', region: 'international',
    },

    // ---- CHINESE AI -------------------------------------------------
    chatglm: {
      name: 'ChatGLM', icon: '💎',
      description: "ZhiPu's ChatGLM (China)",
      url: 'https://chatglm.cn/main/alltoolsdetail',
      fallbackUrls: ['https://chatglm.cn/'],
      embeddable: true, kind: 'web', region: 'chinese',
    },
    deepseek: {
      name: 'DeepSeek', icon: '🐋',
      description: 'DeepSeek chat',
      url: 'https://chat.deepseek.com/',
      fallbackUrls: ['https://www.deepseek.com/'],
      embeddable: true, kind: 'web', region: 'chinese',
    },
    doubao: {
      name: 'DouBao', icon: '🥟',
      description: "ByteDance's DouBao",
      url: 'https://www.doubao.com/chat/',
      fallbackUrls: ['https://www.doubao.com/'],
      embeddable: true, kind: 'web', region: 'chinese',
    },
    ernie: {
      name: 'Ernie Bot', icon: '🐦',
      description: "Baidu's Wenxin Yiyan",
      url: 'https://yiyan.baidu.com/',
      fallbackUrls: ['https://yiyan.baidu.com/welcome'],
      embeddable: true, kind: 'web', region: 'chinese',
    },
    kimi: {
      name: 'Kimi', icon: '🌙',
      description: "Moonshot AI's Kimi",
      url: 'https://www.kimi.com/',
      fallbackUrls: ['https://kimi.moonshot.cn/'],
      embeddable: true, kind: 'web', region: 'chinese',
    },
    lingguang: {
      name: 'LingGuang', icon: '🔥',
      description: "Ant Group's LingGuang",
      url: 'https://ling.com/',
      fallbackUrls: ['https://www.ling.com/'],
      embeddable: true, kind: 'web', region: 'chinese',
    },
    longcat: {
      name: 'LongCat', icon: '🐱',
      description: "Meituan's LongCat",
      url: 'https://longcat.chat/',
      fallbackUrls: ['https://www.longcat.chat/'],
      embeddable: true, kind: 'web', region: 'chinese',
    },
    metaso: {
      name: 'MetaSo', icon: '🔎',
      description: 'MetaSota AI search',
      url: 'https://metaso.cn/',
      fallbackUrls: ['https://www.metaso.cn/'],
      embeddable: true, kind: 'web', region: 'chinese',
    },
    minimax: {
      name: 'MiniMax AI', icon: '🎬',
      description: "MiniMax's chat",
      url: 'https://chat.minimaxi.com/',
      fallbackUrls: ['https://www.minimaxi.com/', 'https://hailuoai.com/'],
      embeddable: true, kind: 'web', region: 'chinese',
    },
    nami: {
      name: 'NaMi AI Search', icon: '🌊',
      description: "360's NaMi AI Search",
      url: 'https://n.cn/',
      fallbackUrls: ['https://www.n.cn/'],
      embeddable: true, kind: 'web', region: 'chinese',
    },
    tongyi: {
      name: 'Qwen (Tongyi)', icon: '🐲',
      description: "Alibaba's Tongyi Qianwen (China)",
      url: 'https://tongyi.aliyun.com/qianwen/',
      fallbackUrls: ['https://tongyi.aliyun.com/'],
      embeddable: true, kind: 'web', region: 'chinese',
    },
    sensechat: {
      name: 'SenseChat', icon: '👁️',
      description: "SenseTime's SenseChat",
      url: 'https://chat.sensetime.com/',
      fallbackUrls: ['https://www.sensetime.com/'],
      embeddable: true, kind: 'web', region: 'chinese',
    },
    stepfun: {
      name: 'StepFun (Yuewen)', icon: '👣',
      description: "StepFun's Yuewen",
      url: 'https://yuewen.cn/',
      fallbackUrls: ['https://www.stepfun.com/'],
      embeddable: true, kind: 'web', region: 'chinese',
    },
    yuanbao: {
      name: 'YuanBao', icon: '💰',
      description: "Tencent's YuanBao",
      url: 'https://yuanbao.tencent.com/',
      fallbackUrls: ['https://www.yuanbao.tencent.com/'],
      embeddable: true, kind: 'web', region: 'chinese',
    },
  };

  // Display order in pickers that group by region.
  const REGION_ORDER = ['international', 'chinese'];
  const REGION_LABELS = {
    international: 'International AI',
    chinese: 'Chinese AI',
  };

  // Platforms the broadcast-injector content script can drive auto-
  // matically (it has CSS selectors for these sites). Anything outside
  // this set goes into Compare with a "manual paste" badge.
  // Must stay aligned with manifest.json content_scripts[1].matches.
  const BROADCAST_SUPPORTED_KEYS = new Set([
    'gemini',
    'chatgpt',
    'claude',
    'perplexity',
    'deepseek',
  ]);

  window.SITE_CONFIGS = SITE_CONFIGS;
  window.REGION_ORDER = REGION_ORDER;
  window.REGION_LABELS = REGION_LABELS;
  window.BROADCAST_SUPPORTED_KEYS = BROADCAST_SUPPORTED_KEYS;
})();
