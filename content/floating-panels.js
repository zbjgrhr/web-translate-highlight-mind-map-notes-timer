(function () {
  function wtpMindUuid() {
    if (typeof wtpUuid === 'function') return wtpUuid();
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `wtp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  let uiLocale = 'zh';
  const panels = {};
  let mindMapState = null;
  let saveMindMapTimer = null;
  let activeSnapshotId = null;

  function showMindMapToast(msg) {
    let el = document.getElementById('wtp-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wtp-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(showMindMapToast._t);
    showMindMapToast._t = setTimeout(() => el.classList.remove('visible'), 2200);
  }

  function pageKey() {
    return typeof wtpPageKey === 'function' ? wtpPageKey() : `${location.origin}${location.pathname}`;
  }

  async function loadUiLocale() {
    const res = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' });
    uiLocale = res?.settings?.uiLocale || 'zh';
    globalThis.wtpUiLocale = uiLocale;
  }

  function openUrl(url) {
    if (url) window.open(url, '_blank');
  }

  function createListPanel(config) {
    const {
      id,
      kind,
      titleKey,
      geoPrefix,
      stackOffset,
      getType,
      deleteType,
      updateType
    } = config;

    let selectedId = null;
    let itemsCache = [];
    let mountedUi = null;

    const shell = wtpCreateFloatingPanel({
      id,
      title: wtpBilingual(titleKey),
      geoPrefix,
      stackOffset,
      defaultWidth: 440,
      defaultHeight: 480,
      onMount(body) {
        body.innerHTML = `
          <div class="wtp-float-toolbar">
            <label><span class="sort-lbl"></span><select class="wtp-sort-select"></select></label>
            <label><span class="filter-lbl"></span><select class="wtp-label-filter"></select></label>
          </div>
          <div class="wtp-float-split">
            <div class="wtp-float-list-wrap">
              <ul class="wtp-float-list"></ul>
              <div class="wtp-float-empty hidden"></div>
            </div>
            <div class="wtp-float-detail">
              <p class="wtp-float-detail-placeholder"></p>
            </div>
          </div>
        `;
        const sortSel = body.querySelector('.wtp-sort-select');
        const filterSel = body.querySelector('.wtp-label-filter');
        body.querySelector('.sort-lbl').textContent = wtpBilingual('sortLabel');
        body.querySelector('.filter-lbl').textContent = wtpBilingual('filterByLabel');
        wtpFillSortSelect(sortSel, kind);
        sortSel.addEventListener('change', () => {
          wtpSetListSort(kind, sortSel.value);
          refreshList();
        });
        filterSel.addEventListener('change', refreshList);
        mountedUi = {
          sortSel,
          filterSel,
          list: body.querySelector('.wtp-float-list'),
          empty: body.querySelector('.wtp-float-empty'),
          detail: body.querySelector('.wtp-float-detail'),
          placeholder: body.querySelector('.wtp-float-detail-placeholder')
        };
        mountedUi.placeholder.textContent = wtpBilingual('detailView');
        mountedUi.empty.textContent = wtpBilingual('noItems');
      },
      onShow() {
        shell.setTitle(wtpBilingual(titleKey));
        refreshList();
      }
    });

    function showDetailPlaceholder() {
      if (!mountedUi) return;
      mountedUi.detail.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'wtp-float-detail-placeholder';
      p.textContent = wtpBilingual('detailView');
      mountedUi.detail.appendChild(p);
    }

    function renderStudyDetail(item) {
      mountedUi.detail.innerHTML = `
        <h3>${wtpBilingual('detailView')}</h3>
        <label>${wtpBilingual('studyLabel')}<input type="text" class="d-label" /></label>
        <label>${wtpBilingual('studyOriginal')}<textarea class="d-original"></textarea></label>
        <label>${wtpBilingual('studyTranslation')}<textarea class="d-translation"></textarea></label>
        <label>${wtpBilingual('studyRemark')}<textarea class="d-remark"></textarea></label>
        <p class="detail-meta"></p>
        <a class="detail-url" href="#" target="_blank" rel="noopener"></a>
        <div class="detail-actions">
          <button type="button" class="primary save-btn">${wtpBilingual('save')}</button>
          <button type="button" class="open-btn">${wtpBilingual('openUrl')}</button>
          <button type="button" class="danger del-btn">${wtpBilingual('delete')}</button>
        </div>
      `;
      const d = mountedUi.detail;
      d.querySelector('.d-label').value = item.label || '';
      d.querySelector('.d-original').value = item.original || '';
      d.querySelector('.d-translation').value = item.translation || '';
      d.querySelector('.d-remark').value = item.remark || '';
      d.querySelector('.detail-meta').textContent = new Date(item.createdAt).toLocaleString();
      const link = d.querySelector('.detail-url');
      link.href = item.url;
      link.textContent = item.url;
      d.querySelector('.open-btn').addEventListener('click', (e) => {
        e.preventDefault();
        openUrl(item.url);
      });
      d.querySelector('.del-btn').addEventListener('click', async () => {
        await browser.runtime.sendMessage({ type: deleteType, id: item.id });
        selectedId = null;
        await refreshList();
        showDetailPlaceholder();
      });
      d.querySelector('.save-btn').addEventListener('click', async () => {
        await browser.runtime.sendMessage({
          type: updateType,
          id: item.id,
          partial: {
            label: d.querySelector('.d-label').value.trim(),
            original: d.querySelector('.d-original').value.trim(),
            translation: d.querySelector('.d-translation').value.trim(),
            remark: d.querySelector('.d-remark').value.trim()
          }
        });
        await refreshList();
      });
    }

    function renderNoteDetail(note) {
      mountedUi.detail.innerHTML = `
        <h3>${wtpBilingual('detailView')}</h3>
        <label>${wtpBilingual('noteLabel')}<input type="text" class="d-label" /></label>
        <label>${wtpBilingual('noteBody')}<textarea class="d-body"></textarea></label>
        <p class="detail-meta"></p>
        <a class="detail-url" href="#" target="_blank" rel="noopener"></a>
        <div class="detail-actions">
          <button type="button" class="primary save-btn">${wtpBilingual('save')}</button>
          <button type="button" class="open-btn">${wtpBilingual('openUrl')}</button>
          <button type="button" class="danger del-btn">${wtpBilingual('delete')}</button>
        </div>
      `;
      const d = mountedUi.detail;
      d.querySelector('.d-label').value = note.label || '';
      d.querySelector('.d-body').value = note.body || '';
      d.querySelector('.detail-meta').textContent = `${note.title || ''} · ${new Date(note.createdAt).toLocaleString()}`;
      const link = d.querySelector('.detail-url');
      link.href = note.url;
      link.textContent = note.url;
      d.querySelector('.open-btn').addEventListener('click', (e) => {
        e.preventDefault();
        openUrl(note.url);
      });
      d.querySelector('.del-btn').addEventListener('click', async () => {
        await browser.runtime.sendMessage({ type: 'DELETE_NOTE', id: note.id });
        selectedId = null;
        await refreshList();
        showDetailPlaceholder();
      });
      d.querySelector('.save-btn').addEventListener('click', async () => {
        await browser.runtime.sendMessage({
          type: 'UPDATE_NOTE',
          id: note.id,
          partial: {
            label: d.querySelector('.d-label').value.trim(),
            body: d.querySelector('.d-body').value.trim()
          }
        });
        await refreshList();
      });
    }

    function onSelectItem(item) {
      selectedId = item.id;
      mountedUi.list.querySelectorAll('.wtp-list-item').forEach((li) => {
        li.classList.toggle('active', li.dataset.id === item.id);
      });
      if (kind === 'notes') renderNoteDetail(item);
      else renderStudyDetail(item);
    }

    async function refreshList() {
      if (!mountedUi) return;
      const res = await browser.runtime.sendMessage({ type: getType });
      const raw = kind === 'notes' ? res?.notes || [] : res?.items || [];
      itemsCache = raw;

      const { opts, current } = wtpBuildLabelOptions(raw, mountedUi.filterSel.value);
      mountedUi.filterSel.innerHTML = '';
      opts.forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        mountedUi.filterSel.appendChild(opt);
      });
      mountedUi.filterSel.value = current || mountedUi.filterSel.value || '';

      const filter = mountedUi.filterSel.value;
      let filtered = filter ? raw.filter((n) => n.label === filter) : raw;
      const sortKey = wtpGetListSort(kind);
      filtered =
        kind === 'notes' ? wtpSortNotes(filtered, sortKey) : wtpSortStudyItems(filtered, sortKey);

      mountedUi.list.innerHTML = '';
      const showDomain = sortKey === 'domainGroup';

      if (showDomain) {
        const groups = wtpGroupByDomain(filtered);
        groups.forEach(([domain, groupItems]) => {
          const hdr = document.createElement('li');
          hdr.className = 'wtp-float-domain-header';
          hdr.textContent = domain;
          mountedUi.list.appendChild(hdr);
          groupItems.forEach((item) => {
            const li =
              kind === 'notes'
                ? wtpRenderNoteListItem(item, {
                    selected: item.id === selectedId,
                    onSelect: onSelectItem
                  })
                : wtpRenderStudyListItem(item, {
                    compact: true,
                    selected: item.id === selectedId,
                    onSelect: onSelectItem
                  });
            mountedUi.list.appendChild(li);
          });
        });
      } else {
        filtered.forEach((item) => {
          const li =
            kind === 'notes'
              ? wtpRenderNoteListItem(item, {
                  selected: item.id === selectedId,
                  onSelect: onSelectItem
                })
              : wtpRenderStudyListItem(item, {
                  compact: true,
                  selected: item.id === selectedId,
                  onSelect: onSelectItem
                });
          mountedUi.list.appendChild(li);
        });
      }

      const empty = filtered.length === 0;
      mountedUi.empty.classList.toggle('hidden', !empty);
      if (empty) showDetailPlaceholder();
      else if (selectedId) {
        const found = filtered.find((i) => i.id === selectedId);
        if (found) onSelectItem(found);
      }
    }

    return { shell, refreshList };
  }

  function createMindMapListPanel() {
    let selectedId = null;
    let mountedUi = null;

    const shell = wtpCreateFloatingPanel({
      id: 'wtp-float-mindmaps',
      title: wtpBilingual('floatMindMapsTitle'),
      geoPrefix: 'wtpFloatMindmaps',
      stackOffset: 72,
      defaultWidth: 440,
      defaultHeight: 480,
      onMount(body) {
        body.innerHTML = `
          <div class="wtp-float-split">
            <div class="wtp-float-list-wrap">
              <ul class="wtp-float-list"></ul>
              <div class="wtp-float-empty hidden"></div>
            </div>
            <div class="wtp-float-detail">
              <p class="wtp-float-detail-placeholder"></p>
            </div>
          </div>
        `;
        mountedUi = {
          list: body.querySelector('.wtp-float-list'),
          empty: body.querySelector('.wtp-float-empty'),
          detail: body.querySelector('.wtp-float-detail'),
          placeholder: body.querySelector('.wtp-float-detail-placeholder')
        };
        mountedUi.placeholder.textContent = wtpBilingual('detailView');
        mountedUi.empty.textContent = wtpBilingual('noItems');
      },
      onShow() {
        shell.setTitle(wtpBilingual('floatMindMapsTitle'));
        refreshList();
      }
    });

    function showDetailPlaceholder() {
      if (!mountedUi) return;
      mountedUi.detail.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'wtp-float-detail-placeholder';
      p.textContent = wtpBilingual('detailView');
      mountedUi.detail.appendChild(p);
    }

    function listTitle(item) {
      if (item.label) return item.label;
      if (item.rootText) return item.rootText;
      try {
        const u = new URL(item.pageKey);
        return u.pathname === '/' ? u.hostname : `${u.hostname}${u.pathname}`;
      } catch {
        return item.pageKey;
      }
    }

    function renderMindMapDetail(item) {
      mountedUi.detail.innerHTML = `
        <h3>${wtpBilingual('detailView')}</h3>
        <label>${wtpBilingual('mindMapSnapshotLabel')}<input type="text" class="d-label" /></label>
        <p class="d-root"></p>
        <p class="d-count"></p>
        <p class="detail-meta"></p>
        <a class="detail-url" href="#" target="_blank" rel="noopener"></a>
        <div class="detail-actions">
          <button type="button" class="primary open-mind-btn">${wtpBilingual('mindMapOpenThis')}</button>
          <button type="button" class="open-btn">${wtpBilingual('openUrl')}</button>
          <button type="button" class="primary save-label-btn">${wtpBilingual('save')}</button>
          <button type="button" class="danger del-btn">${wtpBilingual('delete')}</button>
        </div>
      `;
      const d = mountedUi.detail;
      d.querySelector('.d-label').value = item.label || '';
      d.querySelector('.d-root').textContent = `${wtpBilingual('mindMapRootLabel')}: ${item.rootText || '—'}`;
      d.querySelector('.d-count').textContent = `${wtpBilingual('mindMapNodeCount')}: ${item.nodeCount}`;
      const meta = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '—';
      d.querySelector('.detail-meta').textContent = meta;
      const link = d.querySelector('.detail-url');
      link.href = item.pageKey;
      link.textContent = item.pageKey;
      d.querySelector('.open-btn').addEventListener('click', (e) => {
        e.preventDefault();
        openUrl(item.pageKey);
      });
      d.querySelector('.open-mind-btn').addEventListener('click', () => {
        globalThis.wtpLoadMindMapSnapshot?.(item.id);
      });
      d.querySelector('.save-label-btn').addEventListener('click', async () => {
        const label = d.querySelector('.d-label').value.trim();
        if (!label) return;
        await browser.runtime.sendMessage({
          type: 'UPDATE_SAVED_MINDMAP',
          id: item.id,
          partial: { label }
        });
        await refreshList();
      });
      d.querySelector('.del-btn').addEventListener('click', async () => {
        if (!confirm(wtpBilingual('mindMapDeleteSavedConfirm'))) return;
        await browser.runtime.sendMessage({
          type: 'DELETE_SAVED_MINDMAP',
          id: item.id
        });
        if (activeSnapshotId === item.id) {
          activeSnapshotId = null;
        }
        selectedId = null;
        await refreshList();
        showDetailPlaceholder();
      });
    }

    function onSelectItem(item) {
      selectedId = item.id;
      mountedUi.list.querySelectorAll('.wtp-list-item').forEach((li) => {
        li.classList.toggle('active', li.dataset.id === item.id);
      });
      renderMindMapDetail(item);
    }

    async function refreshList() {
      if (!mountedUi) return;
      const res = await browser.runtime.sendMessage({ type: 'GET_SAVED_MINDMAPS' });
      const items = res?.items || [];

      mountedUi.list.innerHTML = '';
      items.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'wtp-list-item';
        li.dataset.id = item.id;
        if (item.id === selectedId) li.classList.add('active');
        const title = document.createElement('span');
        title.className = 'wtp-list-title';
        title.textContent = listTitle(item);
        const sub = document.createElement('span');
        sub.className = 'wtp-list-sub';
        sub.textContent = item.pageKey;
        li.appendChild(title);
        li.appendChild(sub);
        li.addEventListener('click', () => onSelectItem(item));
        mountedUi.list.appendChild(li);
      });

      const empty = items.length === 0;
      mountedUi.empty.classList.toggle('hidden', !empty);
      if (empty) showDetailPlaceholder();
      else if (selectedId) {
        const found = items.find((i) => i.id === selectedId);
        if (found) onSelectItem(found);
      }
    }

    return { shell, refreshList };
  }

  function scheduleMindMapSave() {
    if (saveMindMapTimer) clearTimeout(saveMindMapTimer);
    saveMindMapTimer = setTimeout(async () => {
      if (!mindMapState?.nodes) return;
      const key = pageKey();
      const mapData = {
        rootId: mindMapState.rootId,
        nodes: mindMapState.nodes,
        viewport: mindMapState.viewport
      };
      try {
        const res = await browser.runtime.sendMessage({
          type: 'SAVE_SITE_MINDMAP',
          pageKey: key,
          mapData
        });
        if (res?.ok === false) console.warn('[wtp] SAVE_SITE_MINDMAP failed:', res?.error);
        if (activeSnapshotId) {
          await browser.runtime.sendMessage({
            type: 'UPDATE_SAVED_MINDMAP',
            id: activeSnapshotId,
            partial: {
              pageKey: key,
              url: key,
              title: document.title || '',
              mapData
            }
          });
        }
      } catch (err) {
        console.warn('[wtp] SAVE_SITE_MINDMAP error:', err);
      }
    }, 400);
  }

  function createMindMapPanel() {
    if (typeof globalThis.wtpCreateTreeMindMapPanel !== 'function') {
      console.warn('[wtp] mind-map-tree.js not loaded');
      return null;
    }
    const panel = globalThis.wtpCreateTreeMindMapPanel({
      getMindMapState: () => mindMapState,
      setMindMapState: (s) => {
        mindMapState = s;
      },
      scheduleMindMapSave,
      pageKey,
      getActiveSnapshotId: () => activeSnapshotId,
      setActiveSnapshotId: (id) => {
        activeSnapshotId = id;
      },
      showMindMapToast
    });
    return panel;
  }

  globalThis.wtpLoadMindMapSnapshot = async (snapshotId) => {
    if (!snapshotId) return;
    try {
      const res = await browser.runtime.sendMessage({
        type: 'GET_SAVED_MINDMAP',
        id: snapshotId
      });
      const item = res?.item;
      if (!item?.mapData) return;
      activeSnapshotId = snapshotId;
      if (item.pageKey !== pageKey()) {
        sessionStorage.setItem('wtpPendingMindMapSnapshotId', snapshotId);
        sessionStorage.setItem('wtpSkipDraftLoadOnce', '1');
        openUrl(item.pageKey);
        showMindMapToast(wtpBilingual('mindMapOpenOnPageHint'));
        return;
      }
      dismissToolbar();
      const p = panels.remarks;
      if (!p) return;
      sessionStorage.setItem('wtpSkipDraftLoadOnce', '1');
      if (p.shell.isOpen()) {
        p.shell.bringToFront();
        p.applySnapshot?.(item);
        sessionStorage.removeItem('wtpSkipDraftLoadOnce');
      } else {
        p.shell.show();
      }
    } catch (err) {
      console.warn('[wtp] wtpLoadMindMapSnapshot error:', err);
    }
  };

  async function init() {
    await loadUiLocale();

    panels.vocab = createListPanel({
      id: 'wtp-float-vocab',
      kind: 'vocab',
      titleKey: 'floatVocabTitle',
      geoPrefix: 'wtpFloatVocab',
      stackOffset: 0,
      getType: 'GET_VOCAB',
      deleteType: 'DELETE_VOCAB',
      updateType: 'UPDATE_VOCAB'
    });

    panels.sentences = createListPanel({
      id: 'wtp-float-sentences',
      kind: 'sentences',
      titleKey: 'floatSentencesTitle',
      geoPrefix: 'wtpFloatSentences',
      stackOffset: 24,
      getType: 'GET_SENTENCES',
      deleteType: 'DELETE_SENTENCE',
      updateType: 'UPDATE_SENTENCE'
    });

    panels.notes = createListPanel({
      id: 'wtp-float-notes',
      kind: 'notes',
      titleKey: 'floatNotesTitle',
      geoPrefix: 'wtpFloatNotes',
      stackOffset: 48,
      getType: 'GET_NOTES',
      deleteType: 'DELETE_NOTE',
      updateType: 'UPDATE_NOTE'
    });

    panels.mindmaps = createMindMapListPanel();
    panels.remarks = createMindMapPanel();
  }

  function dismissToolbar() {
    if (typeof globalThis.wtpRemoveToolbar === 'function') globalThis.wtpRemoveToolbar();
  }

  function openSavedFloatingPanel(kind) {
    dismissToolbar();
    const p = panels[kind];
    if (!p) return;
    if (p.shell.isOpen()) {
      p.shell.bringToFront();
      if (kind !== 'remarks') p.refreshList?.();
    } else p.shell.show();
  }

  function openSiteRemarksPanel() {
    dismissToolbar();
    const p = panels.remarks;
    if (!p) return;
    if (p.shell.isOpen()) {
      p.shell.bringToFront();
    } else p.shell.show();
  }

  globalThis.wtpOpenSavedFloatingPanel = openSavedFloatingPanel;
  globalThis.wtpOpenSiteRemarksPanel = openSiteRemarksPanel;

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'OPEN_FLOATING_PANEL' && msg.kind) {
      if (msg.kind === 'remarks') openSiteRemarksPanel();
      else openSavedFloatingPanel(msg.kind);
    }
  });

  init();
})();
