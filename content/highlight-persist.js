(function () {
  const WTP_HIGHLIGHTS_KEY = 'wtpPageHighlights';
  const WTP_COLORS = ['yellow', 'green', 'pink', 'blue', 'orange', 'purple'];
  let selectedColor = 'yellow';
  let applying = false;

  function pageKey() {
    return typeof wtpPageKey === 'function' ? wtpPageKey() : location.href.split('#')[0];
  }

  function genId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `wtp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  async function loadAllForPage() {
    const data = await browser.storage.local.get(WTP_HIGHLIGHTS_KEY);
    const all = data[WTP_HIGHLIGHTS_KEY] || {};
    return all[pageKey()] || [];
  }

  async function saveAllForPage(items) {
    const data = await browser.storage.local.get(WTP_HIGHLIGHTS_KEY);
    const all = data[WTP_HIGHLIGHTS_KEY] || {};
    if (items.length) all[pageKey()] = items;
    else delete all[pageKey()];
    await browser.storage.local.set({ [WTP_HIGHLIGHTS_KEY]: all });
  }

  function nodeToPath(node, root) {
    const path = [];
    let cur = node;
    while (cur && cur !== root) {
      const parent = cur.parentNode;
      if (!parent) break;
      path.unshift(Array.prototype.indexOf.call(parent.childNodes, cur));
      cur = parent;
    }
    return path;
  }

  function pathToNode(path, root) {
    let node = root;
    for (const idx of path) {
      if (!node?.childNodes?.[idx]) return null;
      node = node.childNodes[idx];
    }
    return node;
  }

  function serializeRange(range) {
    const root = document.body;
    return {
      startPath: nodeToPath(range.startContainer, root),
      startOffset: range.startOffset,
      endPath: nodeToPath(range.endContainer, root),
      endOffset: range.endOffset,
      text: range.toString()
    };
  }

  function deserializeRange(data) {
    const root = document.body;
    const startNode = pathToNode(data.startPath, root);
    const endNode = pathToNode(data.endPath, root);
    if (!startNode || !endNode) return null;
    try {
      const r = document.createRange();
      const startMax =
        startNode.nodeType === Node.TEXT_NODE
          ? startNode.length
          : startNode.childNodes?.length || 0;
      const endMax =
        endNode.nodeType === Node.TEXT_NODE
          ? endNode.length
          : endNode.childNodes?.length || 0;
      r.setStart(startNode, Math.min(data.startOffset, startMax));
      r.setEnd(endNode, Math.min(data.endOffset, endMax));
      if (r.collapsed) return null;
      return r;
    } catch {
      return null;
    }
  }

  function markClass(color) {
    return `wtp-highlight wtp-highlight-${color || 'yellow'}`;
  }

  function getTextNodesInRange(range) {
    const nodes = [];
    if (!document.body) return nodes;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        try {
          if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
        } catch {
          return NodeFilter.FILTER_REJECT;
        }
        if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest?.('mark.wtp-highlight')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function wrapTextNodeSlice(textNode, start, end, color, id) {
    if (start >= end) return null;
    const mark = document.createElement('mark');
    mark.className = markClass(color);
    mark.dataset.wtpHlId = id;
    try {
      const sub = document.createRange();
      sub.setStart(textNode, start);
      sub.setEnd(textNode, end);
      sub.surroundContents(mark);
      return mark;
    } catch {
      const parent = textNode.parentNode;
      if (!parent) return null;
      const slice = textNode.nodeValue.slice(start, end);
      const before = textNode.nodeValue.slice(0, start);
      const after = textNode.nodeValue.slice(end);
      mark.textContent = slice;
      const frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));
      frag.appendChild(mark);
      if (after) frag.appendChild(document.createTextNode(after));
      parent.replaceChild(frag, textNode);
      return mark;
    }
  }

  function wrapTextNodesInRange(range, color, id) {
    const textNodes = getTextNodesInRange(range);
    const marks = [];
    textNodes.forEach((textNode) => {
      let start = 0;
      let end = textNode.length;
      if (range.startContainer === textNode) start = range.startOffset;
      if (range.endContainer === textNode) end = range.endOffset;
      const mark = wrapTextNodeSlice(textNode, start, end, color, id);
      if (mark) marks.push(mark);
    });
    return marks;
  }

  function hasHighlightMarks(id) {
    return !!document.querySelector(`mark.wtp-highlight[data-wtp-hl-id="${id}"]`);
  }

  function applyHighlightToRange(range, color, id) {
    const marks = wrapTextNodesInRange(range, color, id);
    if (marks.length) return marks[0];

    const mark = document.createElement('mark');
    mark.className = markClass(color);
    mark.dataset.wtpHlId = id;
    try {
      range.surroundContents(mark);
      return mark;
    } catch {
      try {
        const frag = range.cloneContents();
        mark.appendChild(frag);
        range.deleteContents();
        range.insertNode(mark);
        return mark;
      } catch {
        return null;
      }
    }
  }

  function unwrapMark(mark) {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }

  function getMarksInRange(range) {
    const found = new Set();
    document.querySelectorAll('mark.wtp-highlight').forEach((m) => {
      try {
        if (range.intersectsNode(m)) found.add(m);
      } catch {
        /* ignore */
      }
    });
    return [...found];
  }

  async function removeHighlightById(id) {
    document.querySelectorAll(`mark.wtp-highlight[data-wtp-hl-id="${id}"]`).forEach(unwrapMark);
    const items = await loadAllForPage();
    await saveAllForPage(items.filter((i) => i.id !== id));
  }

  async function addHighlight(range, color) {
    applying = true;
    try {
      const id = genId();
      const c = color || selectedColor;
      applyHighlightToRange(range, c, id);
      if (!hasHighlightMarks(id)) {
        return { ok: false };
      }
      const entry = {
        id,
        color: c,
        ...serializeRange(range),
        createdAt: new Date().toISOString()
      };
      const items = await loadAllForPage();
      items.push(entry);
      await saveAllForPage(items);
      return { ok: true, id, action: 'added' };
    } finally {
      applying = false;
    }
  }

  async function restoreHighlights() {
    if (applying) return;
    const items = await loadAllForPage();
    const remaining = [];
    for (const item of items) {
      const existing = document.querySelector(`mark.wtp-highlight[data-wtp-hl-id="${item.id}"]`);
      if (existing) {
        remaining.push(item);
        continue;
      }
      let range = deserializeRange(item);
      if (!range && item.text) {
        range = findTextRange(item.text);
      }
      if (range) {
        applyHighlightToRange(range, item.color, item.id);
        if (hasHighlightMarks(item.id)) remaining.push(item);
      }
    }
    if (remaining.length !== items.length) await saveAllForPage(remaining);
  }

  function findTextRange(text) {
    if (!text) return null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const idx = node.nodeValue.indexOf(text);
      if (idx >= 0) {
        const r = document.createRange();
        r.setStart(node, idx);
        r.setEnd(node, idx + text.length);
        return r;
      }
    }
    return null;
  }

  async function clearAllHighlights() {
    document.querySelectorAll('mark.wtp-highlight').forEach(unwrapMark);
    await saveAllForPage([]);
  }

  async function toggleOrApplyHighlight(range, color) {
    const marks = getMarksInRange(range);
    if (marks.length) {
      const ids = new Set(marks.map((m) => m.dataset.wtpHlId).filter(Boolean));
      for (const id of ids) await removeHighlightById(id);
      return { ok: true, action: 'removed' };
    }
    return addHighlight(range, color);
  }

  async function replaceMarksInRange(range, color) {
    const marks = getMarksInRange(range);
    marks.forEach(unwrapMark);
    return addHighlight(range, color);
  }

  async function removeHighlightsInRange(range) {
    const marks = getMarksInRange(range);
    if (!marks.length) return { ok: false, action: 'none' };
    const ids = new Set(marks.map((m) => m.dataset.wtpHlId).filter(Boolean));
    for (const id of ids) await removeHighlightById(id);
    return { ok: true, action: 'removed' };
  }

  function getSelectedColor() {
    return selectedColor;
  }

  function setSelectedColor(c) {
    if (WTP_COLORS.includes(c)) selectedColor = c;
  }

  function getColors() {
    return WTP_COLORS;
  }

  globalThis.wtpHighlight = {
    restoreHighlights,
    clearAllHighlights,
    toggleOrApplyHighlight,
    replaceMarksInRange,
    removeHighlightsInRange,
    getSelectedColor,
    setSelectedColor,
    getColors,
    removeHighlightById
  };

  let restoreDebounce = null;
  function scheduleRestore() {
    if (applying) return;
    clearTimeout(restoreDebounce);
    restoreDebounce = setTimeout(() => restoreHighlights(), 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      restoreHighlights();
      if (document.body) {
        new MutationObserver(scheduleRestore).observe(document.body, {
          childList: true,
          subtree: true
        });
      }
    });
  } else {
    restoreHighlights();
    if (document.body) {
      new MutationObserver(scheduleRestore).observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }
})();
