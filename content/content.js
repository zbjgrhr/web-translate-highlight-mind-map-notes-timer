(function () {
  let uiLocale = 'zh';
  let toolbar = null;
  let lastRange = null;
  let settingsCache = null;
  let lastTranslation = '';
  let lastSelectedText = '';
  let toolbarInteraction = false;
  let toastTimer = null;
  const TOOLBAR_LANG_KEY = 'wtpToolbarTranslateLang';

  function getToolbarTranslateLang() {
    try {
      const raw = sessionStorage.getItem(TOOLBAR_LANG_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveToolbarTranslateLang(sourceLang, targetLang) {
    sessionStorage.setItem(
      TOOLBAR_LANG_KEY,
      JSON.stringify({ sourceLang, targetLang })
    );
  }

  async function loadSettings() {
    const res = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' });
    settingsCache = res?.settings || {};
    uiLocale = settingsCache.uiLocale || 'zh';
    return settingsCache;
  }

  function strings() {
    return typeof wtpGetStrings === 'function' ? wtpGetStrings(uiLocale) : {};
  }

  function btnLabel(key) {
    return typeof wtpBilingual === 'function' ? wtpBilingual(key) : key;
  }

  function needsApiKey() {
    const p = settingsCache?.provider || 'free';
    return p === 'google' || p === 'deepl';
  }

  function isRangeValid(range) {
    if (!range) return false;
    try {
      return document.contains(range.commonAncestorContainer);
    } catch {
      return false;
    }
  }

  function getActiveRange() {
    if (isRangeValid(lastRange)) return lastRange;
    const sel = window.getSelection();
    if (sel?.rangeCount && !sel.isCollapsed) return sel.getRangeAt(0);
    return null;
  }

  function getRangeText(range) {
    return range ? range.toString().trim() : '';
  }

  function showToast(msg) {
    let el = document.getElementById('wtp-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wtp-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), 3000);
  }

  function showToolbarError(msg) {
    showToast(msg);
    if (toolbar) {
      let err = toolbar.querySelector('.wtp-toolbar-error');
      if (!err) {
        err = document.createElement('div');
        err.className = 'wtp-toolbar-error';
        toolbar.appendChild(err);
      }
      err.textContent = msg;
    }
  }

  function removeToolbar() {
    if (toolbar) {
      toolbar.remove();
      toolbar = null;
    }
  }

  function rectHasSize(rect) {
    return rect && (rect.width > 0 || rect.height > 0);
  }

  function getSelectionClientRect(range) {
    if (!range) return null;
    let rect = range.getBoundingClientRect();
    if (rectHasSize(rect)) return rect;

    const rects = range.getClientRects();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let found = false;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r.width > 0 || r.height > 0) {
        found = true;
        minX = Math.min(minX, r.left);
        minY = Math.min(minY, r.top);
        maxX = Math.max(maxX, r.right);
        maxY = Math.max(maxY, r.bottom);
      }
    }
    if (found) {
      return new DOMRect(minX, minY, maxX - minX, maxY - minY);
    }

    let node = range.startContainer;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (node?.getBoundingClientRect) {
      rect = node.getBoundingClientRect();
      if (rectHasSize(rect)) return rect;
    }
    return rect;
  }

  function fallbackToolbarRect() {
    const y = Math.max(80, Math.floor(window.innerHeight * 0.35));
    const x = Math.max(8, Math.floor(window.innerWidth * 0.25));
    return { top: y, left: x, bottom: y + 1, right: x + 200, width: 200, height: 1 };
  }

  function positionToolbar(rect) {
    if (!toolbar) return;
    const top = rect.bottom + 8;
    const left = Math.min(rect.left, window.innerWidth - toolbar.offsetWidth - 8);
    toolbar.style.top = `${Math.max(8, top)}px`;
    toolbar.style.left = `${Math.max(8, left)}px`;
  }

  function buildLangSelectOptions(includeAuto) {
    const opts = [];
    if (includeAuto) {
      opts.push({ value: 'auto', label: btnLabel('autoDetectSource') });
    }
    if (typeof WTP_LANG_OPTIONS !== 'undefined') {
      WTP_LANG_OPTIONS.forEach((o) => opts.push({ value: o.code, label: o.name }));
    }
    return opts;
  }

  async function doTranslate(text, resultEl) {
    const s = strings();
    resultEl.textContent = s.translating || '…';
    resultEl.classList.remove('error');
    try {
      await loadSettings();
      if (needsApiKey() && !settingsCache.apiKey) {
        throw new Error(s.configureApi || 'Configure API');
      }
      const tl = getToolbarTranslateLang();
      const sourceLang = tl.sourceLang ?? settingsCache.sourceLang ?? 'auto';
      let targetLang = tl.targetLang ?? settingsCache.targetLang ?? 'zh';
      if (targetLang === 'en' && sourceLang === 'auto') {
        const detected =
          typeof wtpDetectSourceLang === 'function' ? wtpDetectSourceLang(text) : 'en';
        if (detected === 'en' || detected === 'en-US') targetLang = 'zh';
      }
      const res = await browser.runtime.sendMessage({
        type: 'TRANSLATE',
        text,
        sourceLang,
        targetLang
      });
      if (!res?.ok) throw new Error(res?.error || s.translateError);
      let out = res.translatedText;
      if (res.detectedSourceLang) {
        out += `\n(${s.detectedSource || 'Detected'}: ${res.detectedSourceLang})`;
      }
      resultEl.textContent = out;
      lastTranslation = res.translatedText;
      lastSelectedText = text;
    } catch (e) {
      resultEl.textContent = e.message || s.translateError;
      resultEl.classList.add('error');
    }
  }

  function refreshSidePanel() {
    browser.runtime.sendMessage({ type: 'REFRESH_SIDE_PANEL' }).catch(() => {});
  }

  function openSavedFloatingPanel(kind) {
    toolbarInteraction = true;
    removeToolbar();
    if (typeof globalThis.wtpOpenSavedFloatingPanel === 'function') {
      globalThis.wtpOpenSavedFloatingPanel(kind);
      return;
    }
    browser.runtime
      .sendMessage({ type: 'OPEN_FLOATING_PANEL', kind })
      .catch(() => {});
  }

  function openSiteRemarksPanel() {
    toolbarInteraction = true;
    removeToolbar();
    if (typeof globalThis.wtpOpenSiteRemarksPanel === 'function') {
      globalThis.wtpOpenSiteRemarksPanel();
      return;
    }
    browser.runtime
      .sendMessage({ type: 'OPEN_FLOATING_PANEL', kind: 'remarks' })
      .catch(() => {});
  }

  function openStudySaveDialog(kind) {
    const range = getActiveRange();
    const text = getRangeText(range);
    if (!text) {
      showToolbarError(btnLabel('highlightFailed'));
      return;
    }
    const overlay = document.getElementById('wtp-study-overlay');
    if (!overlay) return;
    overlay.dataset.kind = kind;
    overlay.querySelector('h2').textContent =
      kind === 'vocab' ? btnLabel('saveToVocab') : btnLabel('saveToSentence');
    overlay.querySelector('.url-preview').textContent = `${document.title}\n${location.href}`;
    document.getElementById('wtp-study-original').value = text;
    document.getElementById('wtp-study-translation').value =
      text === lastSelectedText ? lastTranslation : '';
    document.getElementById('wtp-study-label').value = '';
    document.getElementById('wtp-study-remark').value = '';
    overlay.classList.remove('hidden');
    removeToolbar();
  }

  function isToolbarFormControl(target) {
    if (!target?.closest) return false;
    return !!target.closest(
      'select, input, textarea, label, .wtp-toolbar-lang-row, .wtp-toolbar-lang-summary, .wtp-toolbar-lang-header, #wtp-translate-result'
    );
  }

  const WTP_EXTENSION_UI =
    '#wtp-toolbar,#wtp-toast,#wtp-note-panel,#wtp-side-panel-host,#wtp-timer-fab,#wtp-timer-badge,#wtp-timer-expired-overlay,#wtp-study-save-overlay,.wtp-float-panel,.wtp-mind-wrap,.wtp-mind-toolbar,.wtp-mind-style-bar,.wtp-mind-hint,.wtp-mind-canvas,.wtp-mind-context,.wtp-mind-tree-node,.wtp-viewer-header,.wtp-viewer-sidebar,#wtp-reader-drop-zone';

  function isExtensionUi(target) {
    if (!target?.closest) return false;
    return !!target.closest(WTP_EXTENSION_UI);
  }

  function isMindMapPanelOpen() {
    const panel = document.getElementById('wtp-float-remarks');
    return !!(panel && !panel.classList.contains('hidden'));
  }

  function isToolbarUiActive(target) {
    if (isExtensionUi(target)) return true;
    if (isMindMapPanelOpen()) return true;
    if (!toolbar) return false;
    if (target && toolbar.contains(target)) return true;
    const ae = document.activeElement;
    if (ae && isExtensionUi(ae)) return true;
    return !!(ae && toolbar.contains(ae));
  }

  /** Only buttons use preventDefault so <select> can open natively. */
  function bindToolbarPreserveSelection(el) {
    const block = (e) => {
      toolbarInteraction = true;
      if (isToolbarFormControl(e.target)) return;
      const btn = e.target.closest?.('button');
      if (btn && (btn === e.target || btn.contains(e.target))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener('mousedown', block, true);
    el.addEventListener('pointerdown', block, true);
  }

  function bindToolbarFormFocus(el) {
    const mark = () => {
      toolbarInteraction = true;
    };
    el.addEventListener('mousedown', mark);
    el.addEventListener('focus', mark);
    el.addEventListener('click', mark);
  }

  function rangeIntersectsHighlight(range) {
    const marks = document.querySelectorAll('mark.wtp-highlight');
    for (const m of marks) {
      try {
        if (range.intersectsNode(m)) return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  }

  async function applyHighlightColorFromToolbar(color) {
    const r = getActiveRange();
    const hl = globalThis.wtpHighlight;
    if (!r || !hl) {
      showToast(btnLabel('highlightFailed'));
      return false;
    }
    const c = color || hl.getSelectedColor();
    hl.setSelectedColor(c);
    const result = await hl.replaceMarksInRange(r, c);
    if (result?.ok) {
      showToast(btnLabel('highlightSuccess'));
      return true;
    }
    showToast(btnLabel('highlightFailed'));
    return false;
  }

  async function removeSentenceHighlightFromToolbar() {
    const r = getActiveRange();
    const hl = globalThis.wtpHighlight;
    if (!r || !hl) {
      showToast(btnLabel('highlightFailed'));
      return false;
    }
    if (!rangeIntersectsHighlight(r)) {
      showToast(btnLabel('noHighlightToRemove'));
      return false;
    }
    const result = await hl.removeHighlightsInRange(r);
    if (result?.ok) {
      showToast(btnLabel('removeHighlight'));
      lastRange = null;
      window.getSelection()?.removeAllRanges();
      removeToolbar();
      return true;
    }
    showToast(btnLabel('noHighlightToRemove'));
    return false;
  }

  function buildColorPicker() {
    const row = document.createElement('div');
    row.className = 'wtp-color-row';
    const hl = globalThis.wtpHighlight;
    if (!hl) return row;

    const label = document.createElement('span');
    label.className = 'wtp-color-row-label';
    label.textContent = btnLabel('highlightLabel');
    row.appendChild(label);

    hl.getColors().forEach((color) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `wtp-color-dot wtp-color-${color}`;
      dot.title = color;
      if (color === hl.getSelectedColor()) dot.classList.add('selected');
      bindToolbarPreserveSelection(dot);
      dot.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        hl.setSelectedColor(color);
        row.querySelectorAll('.wtp-color-dot').forEach((d) => d.classList.remove('selected'));
        dot.classList.add('selected');
        const r = getActiveRange();
        if (r) await applyHighlightColorFromToolbar(color);
        else showToast(btnLabel('highlightFailed'));
      });
      row.appendChild(dot);
    });
    return row;
  }

  function showToolbar() {
    if (isMindMapPanelOpen()) return;
    loadSettings();
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text) {
      if (!toolbarInteraction) removeToolbar();
      return;
    }

    if (!sel.rangeCount) {
      if (!toolbarInteraction) removeToolbar();
      return;
    }

    const range = sel.getRangeAt(0);
    let rect = getSelectionClientRect(range);
    if (!rectHasSize(rect)) rect = fallbackToolbarRect();

    lastRange = range.cloneRange();

    if (toolbar && lastSelectedText === text) {
      positionToolbar(rect);
      toolbarInteraction = false;
      return;
    }

    lastSelectedText = text;

    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'wtp-toolbar';
      document.body.appendChild(toolbar);
    }

    toolbar.innerHTML = '';

    const colorRow = buildColorPicker();
    if (colorRow.childNodes.length) toolbar.append(colorRow);

    const btnRemoveHl = document.createElement('button');
    btnRemoveHl.textContent = btnLabel('removeSentenceHighlight');
    bindToolbarPreserveSelection(btnRemoveHl);
    btnRemoveHl.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await removeSentenceHighlightFromToolbar();
    });

    const langHeader = document.createElement('div');
    langHeader.className = 'wtp-toolbar-lang-header';
    langHeader.textContent = btnLabel('translateSettings');

    const langRow = document.createElement('div');
    langRow.className = 'wtp-toolbar-lang-row';

    const srcLabel = document.createElement('label');
    srcLabel.className = 'wtp-toolbar-lang-label';
    const srcSpan = document.createElement('span');
    srcSpan.textContent = btnLabel('sourceLang');
    const srcSel = document.createElement('select');
    srcSel.id = 'wtp-toolbar-src-lang';
    buildLangSelectOptions(true).forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      srcSel.appendChild(opt);
    });

    const tgtLabel = document.createElement('label');
    tgtLabel.className = 'wtp-toolbar-lang-label';
    const tgtSpan = document.createElement('span');
    tgtSpan.textContent = btnLabel('targetLanguage');
    const tgtSel = document.createElement('select');
    tgtSel.id = 'wtp-toolbar-tgt-lang';
    buildLangSelectOptions(false).forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      tgtSel.appendChild(opt);
    });

    const langSummary = document.createElement('div');
    langSummary.className = 'wtp-toolbar-lang-summary';

    const tl = getToolbarTranslateLang();
    srcSel.value = tl.sourceLang || settingsCache?.sourceLang || 'auto';
    tgtSel.value = tl.targetLang || settingsCache?.targetLang || 'zh';

    function updateLangSummary() {
      const srcText = srcSel.options[srcSel.selectedIndex]?.textContent || srcSel.value;
      const tgtText = tgtSel.options[tgtSel.selectedIndex]?.textContent || tgtSel.value;
      langSummary.textContent = `${srcText} → ${tgtText}`;
    }

    const onLangChange = () => {
      saveToolbarTranslateLang(srcSel.value, tgtSel.value);
      updateLangSummary();
    };
    srcSel.addEventListener('change', onLangChange);
    tgtSel.addEventListener('change', onLangChange);
    bindToolbarFormFocus(srcSel);
    bindToolbarFormFocus(tgtSel);
    bindToolbarFormFocus(srcLabel);
    bindToolbarFormFocus(tgtLabel);

    srcLabel.append(srcSpan, srcSel);
    tgtLabel.append(tgtSpan, tgtSel);
    langRow.append(srcLabel, tgtLabel);
    updateLangSummary();

    const btnTranslate = document.createElement('button');
    btnTranslate.textContent = btnLabel('translate');
    bindToolbarPreserveSelection(btnTranslate);
    const resultEl = document.createElement('div');
    resultEl.id = 'wtp-translate-result';
    btnTranslate.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const t = getRangeText(getActiveRange());
      if (t) doTranslate(t, resultEl);
    });

    const btnVocab = document.createElement('button');
    btnVocab.textContent = btnLabel('addToVocab');
    bindToolbarPreserveSelection(btnVocab);
    btnVocab.addEventListener('click', () => openStudySaveDialog('vocab'));

    const btnSentence = document.createElement('button');
    btnSentence.textContent = btnLabel('addToSentence');
    bindToolbarPreserveSelection(btnSentence);
    btnSentence.addEventListener('click', () => openStudySaveDialog('sentence'));

    const btnClear = document.createElement('button');
    btnClear.textContent = btnLabel('clearAllHighlights');
    bindToolbarPreserveSelection(btnClear);
    btnClear.addEventListener('click', async () => {
      if (globalThis.wtpHighlight) await globalThis.wtpHighlight.clearAllHighlights();
      removeToolbar();
    });

    const savedRow = document.createElement('div');
    savedRow.className = 'wtp-toolbar-saved-row';

    function makeSavedToolbarBtn(i18nKey, tab) {
      const b = document.createElement('button');
      b.textContent = btnLabel(i18nKey);
      bindToolbarPreserveSelection(b);
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openSavedFloatingPanel(tab);
      });
      return b;
    }

    const btnRemarks = document.createElement('button');
    btnRemarks.textContent = btnLabel('siteRemarks');
    bindToolbarPreserveSelection(btnRemarks);
    btnRemarks.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSiteRemarksPanel();
    });

    savedRow.append(
      makeSavedToolbarBtn('savedVocab', 'vocab'),
      makeSavedToolbarBtn('savedSentences', 'sentences'),
      makeSavedToolbarBtn('savedNotes', 'notes'),
      makeSavedToolbarBtn('savedMindMaps', 'mindmaps')
    );

    toolbar.append(
      btnRemoveHl,
      langHeader,
      langRow,
      langSummary,
      btnTranslate,
      btnVocab,
      btnSentence,
      btnClear,
      btnRemarks,
      savedRow,
      resultEl
    );
    positionToolbar(rect);
    toolbarInteraction = false;
  }

  function isLocalReaderPage() {
    return (
      !!globalThis.wtpViewerMode ||
      /\/viewer\/reader\.html/i.test(location.pathname || '')
    );
  }

  function scheduleShowToolbar(delayMs) {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      if (isToolbarUiActive()) return;
      showToolbar();
    }, delayMs);
  }

  let selectionTimer = null;
  document.addEventListener('mouseup', (e) => {
    if (isToolbarUiActive(e.target)) {
      toolbarInteraction = true;
      return;
    }
    scheduleShowToolbar(isLocalReaderPage() ? 150 : 120);
  });

  function bindViewerSelectionHooks() {
    if (!isLocalReaderPage()) return;
    const docEl = document.getElementById('wtp-reader-document');
    if (!docEl || docEl.dataset.wtpViewerBound === '1') return;
    docEl.dataset.wtpViewerBound = '1';
    docEl.addEventListener(
      'pointerup',
      (e) => {
        if (isToolbarUiActive(e.target)) return;
        scheduleShowToolbar(150);
      },
      true
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindViewerSelectionHooks);
  } else {
    bindViewerSelectionHooks();
  }

  document.addEventListener('selectionchange', () => {
    if (toolbarInteraction || isToolbarUiActive()) return;
    const text = window.getSelection()?.toString().trim();
    if (!text && !toolbar?.matches(':hover') && !toolbar?.matches(':focus-within')) {
      removeToolbar();
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (isExtensionUi(e.target)) {
      toolbarInteraction = true;
      return;
    }
    if (toolbar && toolbar.contains(e.target)) {
      toolbarInteraction = true;
      return;
    }
    toolbarInteraction = false;
    if (toolbar && !toolbar.contains(e.target)) {
      const sel = window.getSelection()?.toString().trim();
      if (!sel) removeToolbar();
    }
  });

  function createNoteUi() {
    const WIDTH_KEY = 'wtpNotePanelWidth';
    const HEIGHT_KEY = 'wtpNotePanelHeight';
    const TOP_KEY = 'wtpNotePanelTop';
    const LEFT_KEY = 'wtpNotePanelLeft';
    const MIN_W = 260;
    const MAX_W = 600;
    const MIN_H = 200;
    const MAX_H = () => Math.floor(window.innerHeight * 0.85);

    const fab = document.createElement('button');
    fab.id = 'wtp-note-fab';
    fab.type = 'button';
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.id = 'wtp-note-panel';
    panel.className = 'hidden';
    panel.innerHTML = `
      <div class="wtp-note-frame">
        <div class="wtp-note-resize wtp-note-resize-top" data-edge="n" title=""></div>
        <div class="wtp-note-resize wtp-note-resize-right" data-edge="e" title=""></div>
        <div class="wtp-note-resize wtp-note-resize-bottom" data-edge="s" title=""></div>
        <div class="wtp-note-resize wtp-note-resize-left" data-edge="w" title=""></div>
        <div class="wtp-note-resize wtp-note-resize-nw" data-edge="nw" title=""></div>
        <div class="wtp-note-resize wtp-note-resize-ne" data-edge="ne" title=""></div>
        <div class="wtp-note-resize wtp-note-resize-sw" data-edge="sw" title=""></div>
        <div class="wtp-note-resize wtp-note-resize-se" data-edge="se" title=""></div>
        <div class="wtp-note-inner">
          <header class="wtp-note-header">
            <h2 class="wtp-note-drag-title"></h2>
            <button type="button" class="wtp-note-reset" title=""></button>
            <button type="button" class="wtp-note-close" aria-label="close"></button>
          </header>
          <div class="url-preview"></div>
          <label class="lbl-label"><span></span><input type="text" id="wtp-note-label" /></label>
          <label class="lbl-body wtp-note-body-label"><span></span><textarea id="wtp-note-note-text"></textarea></label>
          <div class="btn-row">
            <button type="button" class="cancel"></button>
            <button type="button" class="primary save"></button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    const noteHeader = panel.querySelector('.wtp-note-header');
    const dragTitle = panel.querySelector('.wtp-note-drag-title');
    const resetBtn = panel.querySelector('.wtp-note-reset');
    let panelOpen = false;
    let userPositioned = false;

    function clampWidth(w) {
      const max = Math.min(MAX_W, Math.floor(window.innerWidth * 0.5));
      return Math.max(MIN_W, Math.min(max, w));
    }

    function clampHeight(h) {
      return Math.max(MIN_H, Math.min(MAX_H(), h));
    }

    function isReasonablePosition(top, left) {
      return (
        Number.isFinite(top) &&
        Number.isFinite(left) &&
        top >= 0 &&
        left >= 0 &&
        left <= window.innerWidth - MIN_W * 0.4 &&
        top <= window.innerHeight - MIN_H * 0.35
      );
    }

    function getPanelRect() {
      return panel.getBoundingClientRect();
    }

    function applyGeometry(top, left, width, height) {
      const w = clampWidth(width);
      const h = clampHeight(height);
      const maxLeft = window.innerWidth - w - 4;
      const maxTop = window.innerHeight - h - 4;
      const t = Math.max(0, Math.min(maxTop, top));
      const l = Math.max(0, Math.min(maxLeft, left));
      panel.style.top = `${t}px`;
      panel.style.left = `${l}px`;
      panel.style.width = `${w}px`;
      panel.style.height = `${h}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.maxHeight = `calc(100vh - ${t}px - 8px)`;
      localStorage.setItem(TOP_KEY, String(Math.round(t)));
      localStorage.setItem(LEFT_KEY, String(Math.round(l)));
      localStorage.setItem(WIDTH_KEY, String(w));
      localStorage.setItem(HEIGHT_KEY, String(h));
    }

    function saveGeometry() {
      const r = getPanelRect();
      applyGeometry(r.top, r.left, r.width, r.height);
      userPositioned = true;
    }

    function clearSavedLayout() {
      [WIDTH_KEY, HEIGHT_KEY, TOP_KEY, LEFT_KEY].forEach((k) => localStorage.removeItem(k));
      userPositioned = false;
    }

    function applyDefaultPosition() {
      const w = clampWidth(parseInt(localStorage.getItem(WIDTH_KEY), 10) || 320);
      const h = clampHeight(parseInt(localStorage.getItem(HEIGHT_KEY), 10) || 360);
      const badge = document.getElementById('wtp-timer-badge');
      let top = 12;
      if (badge && !badge.classList.contains('hidden')) {
        top = Math.ceil(badge.getBoundingClientRect().bottom) + 8;
      }
      const sideHost = document.getElementById('wtp-side-panel-host');
      let left = window.innerWidth - w - 12;
      if (sideHost && !sideHost.classList.contains('wtp-host-hidden')) {
        left -= (sideHost.offsetWidth || 340) + 8;
      }
      applyGeometry(top, Math.max(8, left), w, h);
      userPositioned = false;
    }

    function applySavedLayout() {
      const top = parseInt(localStorage.getItem(TOP_KEY), 10);
      const left = parseInt(localStorage.getItem(LEFT_KEY), 10);
      const w = parseInt(localStorage.getItem(WIDTH_KEY), 10);
      const h = parseInt(localStorage.getItem(HEIGHT_KEY), 10);
      if (!isReasonablePosition(top, left)) return false;
      applyGeometry(top, left, w || 320, h || 360);
      userPositioned = true;
      return true;
    }

    function bindCaptureDrag(el, onStart) {
      const start = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const state = onStart(e);
        if (!state) return;
        panel.classList.add('wtp-note-dragging');
        document.body.classList.add('wtp-note-dragging');
        document.body.style.userSelect = 'none';
        if (state.cursor) document.body.style.cursor = state.cursor;

        const onMove = (ev) => {
          ev.preventDefault();
          state.onMove(ev);
        };
        const onUp = () => {
          state.onEnd?.();
          panel.classList.remove('wtp-note-dragging');
          document.body.classList.remove('wtp-note-dragging');
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
          document.removeEventListener('mousemove', onMove, true);
          document.removeEventListener('mouseup', onUp, true);
          document.removeEventListener('pointermove', onMove, true);
          document.removeEventListener('pointerup', onUp, true);
        };

        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('mouseup', onUp, true);
        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', onUp, true);
      };
      el.addEventListener('mousedown', start, true);
      el.addEventListener('pointerdown', start, true);
    }

    function setupResizeHandle(el) {
      const edge = el.dataset.edge;
      const cursors = {
        n: 'ns-resize',
        s: 'ns-resize',
        e: 'ew-resize',
        w: 'ew-resize',
        nw: 'nwse-resize',
        ne: 'nesw-resize',
        sw: 'nesw-resize',
        se: 'nwse-resize'
      };
      bindCaptureDrag(el, () => {
        const start = getPanelRect();
        return {
          cursor: cursors[edge] || 'default',
          onMove(ev) {
            let { top, left, width, height } = start;
            const right = start.left + start.width;
            const bottom = start.top + start.height;
            if (edge.includes('n')) {
              top = ev.clientY;
              height = bottom - top;
            }
            if (edge.includes('s')) {
              height = ev.clientY - start.top;
            }
            if (edge.includes('w')) {
              left = ev.clientX;
              width = right - left;
            }
            if (edge.includes('e')) {
              width = ev.clientX - start.left;
            }
            applyGeometry(top, left, width, height);
          },
          onEnd: saveGeometry
        };
      });
    }

    panel.querySelectorAll('.wtp-note-resize[data-edge]').forEach(setupResizeHandle);

    bindCaptureDrag(noteHeader, (e) => {
      if (e.target.closest('.wtp-note-close, .wtp-note-reset')) return null;
      const start = getPanelRect();
      const offsetX = e.clientX - start.left;
      const offsetY = e.clientY - start.top;
      return {
        cursor: 'move',
        onMove(ev) {
          applyGeometry(ev.clientY - offsetY, ev.clientX - offsetX, start.width, start.height);
        },
        onEnd: saveGeometry
      };
    });

    dragTitle.addEventListener('dblclick', () => {
      clearSavedLayout();
      applyDefaultPosition();
    });

    async function refreshLabels() {
      fab.textContent = btnLabel('noteFab');
      dragTitle.textContent = btnLabel('noteFab');
      panel.querySelector('.lbl-label span').textContent = strings().noteLabel || 'Label';
      panel.querySelector('.lbl-body span').textContent = strings().noteBody || 'Note';
      panel.querySelector('.cancel').textContent = btnLabel('cancel');
      panel.querySelector('.save').textContent = btnLabel('save');
      panel.querySelector('.wtp-note-close').textContent = '×';
      panel.querySelector('.wtp-note-close').title = btnLabel('noteClose');
      resetBtn.textContent = '↺';
      resetBtn.title = btnLabel('resetNotePanel');
      const hint = btnLabel('resizeHint');
      panel.querySelectorAll('.wtp-note-resize').forEach((h) => {
        h.title = hint;
      });
      dragTitle.title = hint;
    }

    function openPanel() {
      refreshLabels();
      panel.classList.remove('hidden');
      if (!applySavedLayout()) applyDefaultPosition();
      panel.querySelector('.url-preview').textContent = location.href;
      document.getElementById('wtp-note-label').value = '';
      document.getElementById('wtp-note-note-text').value = '';
      panelOpen = true;
    }

    function closePanel() {
      panel.classList.add('hidden');
      panelOpen = false;
    }

    function togglePanel() {
      if (panelOpen) closePanel();
      else openPanel();
    }

    function openModal() {
      openPanel();
    }

    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSavedLayout();
      applyDefaultPosition();
    });

    fab.addEventListener('click', togglePanel);
    panel.querySelector('.cancel').addEventListener('click', closePanel);
    panel.querySelector('.wtp-note-close').addEventListener('click', closePanel);

    panel.querySelector('.save').addEventListener('click', async () => {
      const res = await browser.runtime.sendMessage({
        type: 'ADD_NOTE',
        label: document.getElementById('wtp-note-label').value,
        body: document.getElementById('wtp-note-note-text').value,
        url: location.href,
        title: document.title
      });
      if (res?.ok) {
        closePanel();
        refreshSidePanel();
      } else alert(res?.error || 'Failed to save');
    });

    window.addEventListener('resize', () => {
      if (!panelOpen) return;
      const r = getPanelRect();
      applyGeometry(r.top, r.left, r.width, r.height);
      if (!userPositioned) applyDefaultPosition();
    });

    const badge = document.getElementById('wtp-timer-badge');
    if (badge) {
      new MutationObserver(() => {
        if (panelOpen && !userPositioned) applyDefaultPosition();
      }).observe(badge, { attributes: true, attributeFilter: ['class'] });
    }

    refreshLabels();

    return { openPanel, closePanel, togglePanel, openModal, refreshLabels };
  }

  function createStudySaveUi() {
    const overlay = document.createElement('div');
    overlay.id = 'wtp-study-overlay';
    overlay.className = 'hidden';
    overlay.innerHTML = `
      <div id="wtp-study-dialog" role="dialog">
        <h2></h2>
        <div class="url-preview"></div>
        <label><span class="lbl-original"></span><input type="text" id="wtp-study-original" /></label>
        <label><span class="lbl-translation"></span><input type="text" id="wtp-study-translation" /></label>
        <label><span class="lbl-label"></span><input type="text" id="wtp-study-label" /></label>
        <label><span class="lbl-remark"></span><textarea id="wtp-study-remark"></textarea></label>
        <div class="btn-row">
          <button type="button" class="cancel"></button>
          <button type="button" class="primary save"></button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    function refreshLabels() {
      const s = strings();
      overlay.querySelector('.lbl-original').textContent = s.studyOriginal || 'Original';
      overlay.querySelector('.lbl-translation').textContent = s.studyTranslation || 'Translation';
      overlay.querySelector('.lbl-label').textContent = s.studyLabel || 'Label';
      overlay.querySelector('.lbl-remark').textContent = s.studyRemark || 'Remark';
      overlay.querySelector('.cancel').textContent = btnLabel('cancel');
      overlay.querySelector('.save').textContent = btnLabel('save');
    }

    overlay.querySelector('.cancel').addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });

    overlay.querySelector('.save').addEventListener('click', async () => {
      const kind = overlay.dataset.kind || 'vocab';
      const res = await browser.runtime.sendMessage({
        type: kind === 'vocab' ? 'ADD_VOCAB' : 'ADD_SENTENCE',
        original: document.getElementById('wtp-study-original').value,
        translation: document.getElementById('wtp-study-translation').value,
        label: document.getElementById('wtp-study-label').value,
        remark: document.getElementById('wtp-study-remark').value,
        url: location.href,
        title: document.title
      });
      if (res?.ok) {
        overlay.classList.add('hidden');
        showToast(kind === 'vocab' ? btnLabel('savedToVocab') : btnLabel('savedToSentence'));
        refreshSidePanel();
      } else alert(res?.error || 'Failed to save');
    });

    refreshLabels();
  }

  const noteUi = createNoteUi();
  createStudySaveUi();

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SHOW_NOTE_MODAL') noteUi.openModal();
  });

  globalThis.wtpShowNoteModal = () => noteUi.openModal();
  globalThis.wtpRemoveToolbar = removeToolbar;
  globalThis.wtpMarkToolbarInteraction = () => {
    toolbarInteraction = true;
  };
  globalThis.wtpIsExtensionUi = isExtensionUi;

  async function maybeShowFileAccessHint() {
    if (location.protocol !== 'file:' || globalThis.wtpViewerMode) return;
    try {
      const data = await browser.storage.local.get('wtpFileHintShown');
      if (data.wtpFileHintShown) return;
      await browser.storage.local.set({ wtpFileHintShown: true });
      showToast(btnLabel('fileAccessHint'));
    } catch {
      /* ignore */
    }
  }

  loadSettings().then(() => maybeShowFileAccessHint());
})();
