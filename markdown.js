// markdown.js
//
// Minimal, streaming-safe Markdown renderer for Quick Chat assistant
// messages. Built specifically for the subset of markdown that
// Gemini reliably produces: fenced code blocks, inline code, headings,
// lists (ordered + unordered), bold, italic, links, paragraphs, and
// horizontal rules.
//
// Security model:
//   1. The entire input is HTML-escaped FIRST.
//   2. Code blocks and inline code are extracted to placeholders so
//      their contents are never re-processed for markdown.
//   3. Remaining markdown tokens are transformed into our own,
//      carefully-typed HTML tags.
//   4. Links open in a new tab with rel="noopener noreferrer" and the
//      href is validated to be http(s):// or mailto: only.
// As a result, untrusted Gemini output cannot inject raw HTML.
//
// Streaming-safe: if the input contains an unclosed code fence, the
// renderer appends a temporary closing fence so the in-progress code
// renders correctly until the real closer arrives.

(function () {
  const URL_SAFE_RE = /^(https?:\/\/|mailto:)/i;

  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeHref(url) {
    return URL_SAFE_RE.test(url) ? url : '#';
  }

  function renderMarkdown(input) {
    if (typeof input !== 'string') return '';
    let text = input;

    // Streaming-safe: balance the fence count so a partially-streamed
    // code block still renders as code.
    const fenceCount = (text.match(/```/g) || []).length;
    if (fenceCount % 2 === 1) text += '\n```';

    text = escapeHtml(text);

    // Extract fenced code blocks (must come before inline code).
    const codeBlocks = [];
    text = text.replace(
      /```([\w+-]*)\n?([\s\S]*?)```/g,
      (_, lang, code) => {
        const stripped = code.replace(/\n$/, '');
        const langClass = lang ? ` class="lang-${escapeHtml(lang)}"` : '';
        codeBlocks.push(`<pre><code${langClass}>${stripped}</code></pre>`);
        return `\x00B${codeBlocks.length - 1}\x00`;
      }
    );

    // Extract inline code so its contents aren't subject to markdown.
    const inlineCodes = [];
    text = text.replace(/`([^`\n]+)`/g, (_, code) => {
      inlineCodes.push(`<code>${code}</code>`);
      return `\x00I${inlineCodes.length - 1}\x00`;
    });

    // Headings (only at line start). h3 first so h2/h1 don't consume them.
    text = text.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    text = text.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    text = text.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    // Horizontal rule.
    text = text.replace(/^\s*[-*_]{3,}\s*$/gm, '<hr>');

    // Lists. Walk line-by-line and wrap consecutive list lines.
    text = wrapLists(text);

    // Bold then italic. Bold uses ** or __; italic uses _ or single *.
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    text = text.replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');

    // Links: [text](url)
    text = text.replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_, label, url) =>
        `<a href="${safeHref(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
    );

    // Paragraph splitting: blank lines separate blocks. Block-level tags
    // are passed through; anything else gets wrapped in <p> with
    // single-newline-to-<br> conversion.
    text = text
      .split(/\n{2,}/)
      .map((block) => {
        const trimmed = block.trim();
        if (!trimmed) return '';
        if (/^<(h[1-6]|ul|ol|pre|hr|blockquote)/.test(trimmed)) return trimmed;
        if (/^\x00B\d+\x00$/.test(trimmed)) return trimmed;
        return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
      })
      .filter(Boolean)
      .join('\n');

    // Restore inline code, then code blocks.
    text = text.replace(/\x00I(\d+)\x00/g, (_, i) => inlineCodes[+i] || '');
    text = text.replace(/\x00B(\d+)\x00/g, (_, i) => codeBlocks[+i] || '');

    return text;
  }

  // Walk lines, group consecutive ordered/unordered list items into
  // <ul>/<ol> blocks. Nested lists are not supported (Gemini rarely
  // emits them in chat replies); items are emitted at a single level.
  function wrapLists(text) {
    const lines = text.split('\n');
    const out = [];
    let buf = [];
    let listType = null; // 'ul' | 'ol' | null

    const flush = () => {
      if (!listType || buf.length === 0) return;
      out.push(
        `<${listType}>${buf.map((it) => `<li>${it}</li>`).join('')}</${listType}>`
      );
      buf = [];
      listType = null;
    };

    for (const line of lines) {
      const ulMatch = /^\s*[-*+]\s+(.+)$/.exec(line);
      const olMatch = /^\s*\d+[.)]\s+(.+)$/.exec(line);
      if (ulMatch) {
        if (listType && listType !== 'ul') flush();
        listType = 'ul';
        buf.push(ulMatch[1]);
      } else if (olMatch) {
        if (listType && listType !== 'ol') flush();
        listType = 'ol';
        buf.push(olMatch[1]);
      } else {
        flush();
        out.push(line);
      }
    }
    flush();
    return out.join('\n');
  }

  window.renderMarkdown = renderMarkdown;
})();
