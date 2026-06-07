(function () {
  const FILE_HINT_KEY = 'wtpFileHintShown';
  let uiLocale = 'zh';
  let currentId = null;

  const els = {
    drop: document.getElementById('wtp-reader-drop-zone'),
    doc: document.getElementById('wtp-reader-document'),
    recent: document.getElementById('wtp-viewer-recent-list'),
    status: document.getElementById('wtp-viewer-status'),
    fileInput: document.getElementById('wtp-file-input'),
    title: document.getElementById('wtp-viewer-doc-title')
  };

  function label(key) {
    return typeof wtpBilingual === 'function' ? wtpBilingual(key) : key;
  }

  function setStatus(msg, isError) {
    if (!els.status) return;
    els.status.textContent = msg || '';
    els.status.classList.toggle('hidden', !msg);
    els.status.style.color = isError ? '#b91c1c' : '#b45309';
    els.status.style.background = isError ? '#fef2f2' : '#fffbeb';
  }

  function showDocument(show) {
    els.drop?.classList.toggle('hidden', show);
    els.doc?.classList.toggle('hidden', !show);
  }

  function fileKind(file) {
    const n = (file.name || '').toLowerCase();
    if (n.endsWith('.pdf')) return 'pdf';
    if (n.endsWith('.docx')) return 'docx';
    if (n.endsWith('.html') || n.endsWith('.htm')) return 'html';
    if (n.endsWith('.txt')) return 'txt';
    const t = file.type || '';
    if (t.includes('pdf')) return 'pdf';
    if (t.includes('wordprocessingml')) return 'docx';
    if (t.includes('html')) return 'html';
    if (t.startsWith('text/')) return 'txt';
    return null;
  }

  async function applyPageKeyForFile(file) {
    const stableId = await wtpStableFileId(file);
    const pk = wtpExtViewerPageKey(stableId);
    globalThis.wtpViewerPageKeyOverride = pk;
    document.title = `${file.name} — ${label('viewerTitle')}`;
    if (els.title) els.title.textContent = file.name;
    return { stableId, pageKey: pk };
  }

  async function ensureEngine() {
    for (let i = 0; i < 80; i++) {
      if (globalThis.wtpViewerEngine) return globalThis.wtpViewerEngine;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }

  async function renderBlob(blob, meta) {
    const engine = await ensureEngine();
    if (!engine) {
      setStatus(label('viewerOpenFailed'), true);
      return;
    }
    showDocument(true);
    setStatus('');
    const buf = await blob.arrayBuffer();
    const kind = meta.typeKind || fileKind({ name: meta.name, type: blob.type });
    els.doc.innerHTML = '';
    try {
      if (kind === 'pdf') {
        await engine.renderPdfToContainer(buf, els.doc);
      } else if (kind === 'docx') {
        setStatus(label('docxConverting'));
        await engine.renderDocxToContainer(buf, els.doc);
        setStatus('');
      } else if (kind === 'html') {
        const text = new TextDecoder().decode(buf);
        engine.renderHtmlTextToContainer(text, els.doc, true);
      } else if (kind === 'txt') {
        const text = new TextDecoder().decode(buf);
        engine.renderHtmlTextToContainer(text, els.doc, false);
      } else {
        throw new Error('UNSUPPORTED');
      }
    } catch (e) {
      console.warn('[wtp viewer]', e);
      showDocument(false);
      if (e.message === 'FILE_TOO_LARGE') {
        setStatus(label('viewerFileTooLarge'), true);
      } else if (e.message === 'MAMMOTH_MISSING') {
        setStatus(label('viewerOpenFailed'), true);
      } else {
        setStatus(label('viewerOpenFailed'), true);
      }
    }
  }

  async function openFile(file) {
    const kind = fileKind(file);
    if (!kind) {
      setStatus(label('viewerUnsupported'), true);
      return;
    }
    const { stableId, pageKey } = await applyPageKeyForFile(file);
    currentId = stableId;
    try {
      await wtpViewerSaveFile(file, pageKey, kind);
    } catch (e) {
      if (e.message === 'FILE_TOO_LARGE') {
        setStatus(label('viewerFileTooLarge'), true);
        return;
      }
      throw e;
    }
    await renderBlob(file, { name: file.name, typeKind: kind });
    await refreshRecent();
    history.replaceState(null, '', `?id=${encodeURIComponent(stableId)}`);
  }

  async function openById(id) {
    if (!id) return;
    const list = await wtpViewerGetRecentMeta();
    const meta = list.find((x) => x.id === id);
    if (!meta) {
      setStatus(label('viewerReopenPickFile'), true);
      return;
    }
    const blob = await wtpViewerLoadBlob(id);
    if (!blob) {
      setStatus(label('viewerReopenPickFile'), true);
      return;
    }
    currentId = id;
    globalThis.wtpViewerPageKeyOverride = meta.pageKey;
    document.title = `${meta.name} — ${label('viewerTitle')}`;
    if (els.title) els.title.textContent = meta.name;
    await wtpViewerTouchRecent(id);
    await renderBlob(blob, { name: meta.name, typeKind: meta.type });
    await refreshRecent();
    history.replaceState(null, '', `?id=${encodeURIComponent(id)}`);
  }

  async function refreshRecent() {
    if (!els.recent) return;
    const list = await wtpViewerGetRecentMeta();
    els.recent.innerHTML = '';
    list.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wtp-viewer-recent-item' + (item.id === currentId ? ' active' : '');
      btn.textContent = item.name;
      btn.title = item.pageKey;
      btn.addEventListener('click', () => openById(item.id));
      els.recent.appendChild(btn);
    });
  }

  function bindDrop() {
    const prevent = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('dragover', prevent);
    document.addEventListener('drop', (e) => {
      prevent(e);
      const f = e.dataTransfer?.files?.[0];
      if (f) openFile(f);
    });
    els.drop?.addEventListener('click', () => els.fileInput?.click());
    els.fileInput?.addEventListener('change', () => {
      const f = els.fileInput.files?.[0];
      if (f) openFile(f);
      els.fileInput.value = '';
    });
    document.getElementById('wtp-btn-pick-file')?.addEventListener('click', () => els.fileInput?.click());
  }

  async function loadLocale() {
    try {
      const res = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' });
      uiLocale = res?.settings?.uiLocale || 'zh';
      globalThis.wtpUiLocale = uiLocale;
      if (typeof wtpApplyI18n === 'function') wtpApplyI18n(document.body, uiLocale);
    } catch {
      /* ignore */
    }
  }

  async function init() {
    await loadLocale();
    bindDrop();
    await refreshRecent();
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    if (id) await openById(id);
  }

  globalThis.wtpViewerOpenFile = openFile;
  globalThis.wtpViewerOpenById = openById;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
