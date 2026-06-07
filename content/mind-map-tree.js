/**
 * Tree-style radial mind map (V2) for site remarks panel.
 */
(function () {
  const BRANCH_COLORS = [
    '#f97316',
    '#ef4444',
    '#a855f7',
    '#14b8a6',
    '#eab308',
    '#22c55e',
    '#3b82f6'
  ];
  const GAP_X = 72;
  const GAP_Y = 14;
  const SIZES = {
    root: { w: 200, h: 64 },
    branch: { w: 150, h: 44 },
    leaf: { w: 130, h: 36 }
  };

  function wtpMindUuid() {
    if (typeof wtpUuid === 'function') return wtpUuid();
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `wtp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function defaultRootLabel() {
    const s = wtpGetStrings(globalThis.wtpUiLocale || 'zh');
    return s.mindMapRootLabel || 'Central topic';
  }

  function normalizeTreeNode(n, parentId = n.parentId ?? null) {
    const nodeType = n.nodeType || (parentId === null ? 'root' : 'branch');
    const shape = n.shape === 'rect' ? 'rect' : 'rounded';
    return {
      id: n.id || wtpMindUuid(),
      parentId,
      text: n.text ?? '',
      nodeType,
      shape,
      borderColor: n.borderColor || '#000000',
      fillColor: n.fillColor || (nodeType === 'root' ? '#ffffff' : '#fefce8'),
      branchColor: n.branchColor || BRANCH_COLORS[0],
      side: n.side === 'left' || n.side === 'right' ? n.side : null
    };
  }

  function migrateMapData(d) {
    const viewport = {
      panX: d?.viewport?.panX ?? 0,
      panY: d?.viewport?.panY ?? 0,
      zoom: d?.viewport?.zoom ?? 1
    };
    if (d?.rootId && Array.isArray(d.nodes) && d.nodes.some((n) => 'parentId' in n)) {
      const nodes = d.nodes.map((n) => normalizeTreeNode(n, n.parentId ?? null));
      const root = nodes.find((n) => n.id === d.rootId) || nodes.find((n) => !n.parentId);
      return { rootId: root?.id || d.rootId, nodes, viewport };
    }
    const rootId = wtpMindUuid();
    const root = normalizeTreeNode(
      { id: rootId, parentId: null, text: defaultRootLabel(), nodeType: 'root' },
      null
    );
    const nodes = [root];
    const legacy = Array.isArray(d?.nodes) ? d.nodes : [];
    legacy.forEach((raw, i) => {
      if (raw.id === rootId) return;
      nodes.push(
        normalizeTreeNode(
          {
            id: raw.id || wtpMindUuid(),
            parentId: rootId,
            text: raw.text || '',
            nodeType: 'branch',
            shape: raw.shape === 'rect' ? 'rect' : 'rounded',
            fillColor: raw.fillColor,
            borderColor: raw.borderColor || '#000000',
            branchColor: BRANCH_COLORS[i % BRANCH_COLORS.length],
            side: i % 2 === 0 ? 'right' : 'left'
          },
          rootId
        )
      );
    });
    return { rootId, nodes, viewport };
  }

  function defaultMindMapState() {
    const rootId = wtpMindUuid();
    return {
      rootId,
      nodes: [
        normalizeTreeNode(
          { id: rootId, parentId: null, text: defaultRootLabel(), nodeType: 'root' },
          null
        )
      ],
      viewport: { panX: 0, panY: 0, zoom: 1 }
    };
  }

  function createMindMapPanel(deps) {
    const {
      getMindMapState,
      setMindMapState,
      scheduleMindMapSave,
      pageKey,
      getActiveSnapshotId,
      setActiveSnapshotId,
      showMindMapToast
    } = deps;

    let svg = null;
    let gLinks = null;
    let worldEl = null;
    let nodesLayer = null;
    let mindCanvasEl = null;
    let selectedNodeId = null;
    let mindToolbarEl = null;
    let mindDeleteBtn = null;
    let saveNewBtn = null;
    let saveUpdateBtn = null;
    let saveAsBtn = null;
    let borderInputEl = null;
    let fillInputEl = null;
    let branchInputEl = null;
    let shapeSelectEl = null;
    let loadGeneration = 0;
    let mindMapDirty = false;
    let layoutCache = {};

    function ensureMindMapState() {
      let s = getMindMapState();
      if (!s || !s.rootId) {
        s = defaultMindMapState();
        setMindMapState(s);
      }
      if (!Array.isArray(s.nodes)) s.nodes = [];
      if (!s.viewport) s.viewport = { panX: 0, panY: 0, zoom: 1 };
      const v = s.viewport;
      if (typeof v.panX !== 'number') v.panX = 0;
      if (typeof v.panY !== 'number') v.panY = 0;
      if (typeof v.zoom !== 'number' || v.zoom <= 0) v.zoom = 1;
      return s;
    }

    function getNode(id) {
      return ensureMindMapState().nodes.find((n) => n.id === id);
    }

    function getChildren(parentId) {
      return ensureMindMapState().nodes.filter((n) => n.parentId === parentId);
    }

    function getBranchColor(node) {
      let cur = node;
      while (cur) {
        if (cur.parentId === null) return '#000000';
        const parent = getNode(cur.parentId);
        if (!parent) break;
        if (parent.parentId === null) return cur.branchColor || BRANCH_COLORS[0];
        cur = parent;
      }
      return node.branchColor || BRANCH_COLORS[0];
    }

    function assignSidesForTree() {
      const s = ensureMindMapState();
      const root = getNode(s.rootId);
      if (!root) return;
      const kids = getChildren(s.rootId);
      let li = 0;
      let ri = 0;
      kids.forEach((ch, idx) => {
        if (ch.side !== 'left' && ch.side !== 'right') {
          ch.side = idx % 2 === 0 ? 'right' : 'left';
        }
        if (ch.side === 'left') li++;
        else ri++;
      });
      const propagate = (id, side, color) => {
        getChildren(id).forEach((ch) => {
          ch.side = side;
          if (id === s.rootId) {
            /* keep child's branchColor */
          } else {
            ch.branchColor = color;
          }
          propagate(ch.id, side, ch.branchColor || color);
        });
      };
      kids.forEach((ch) => propagate(ch.id, ch.side, ch.branchColor));
    }

    function measureNode(node) {
      return SIZES[node.nodeType] || SIZES.branch;
    }

    function subtreeBlockHeight(nodeId) {
      const kids = getChildren(nodeId);
      if (!kids.length) return measureNode(getNode(nodeId)).h;
      let h = 0;
      kids.forEach((ch, i) => {
        h += subtreeBlockHeight(ch.id);
        if (i < kids.length - 1) h += GAP_Y;
      });
      return h;
    }

    function layoutTree(canvasW, canvasH) {
      assignSidesForTree();
      const s = ensureMindMapState();
      const positions = {};
      const root = getNode(s.rootId);
      if (!root) return positions;

      const rootSize = measureNode(root);
      const layoutW = Math.max(canvasW, 900);
      const layoutH = Math.max(canvasH, 600);
      const rootX = layoutW / 2 - rootSize.w / 2;
      const rootY = layoutH / 2 - rootSize.h / 2;
      positions[root.id] = { x: rootX, y: rootY, w: rootSize.w, h: rootSize.h };

      const placeSubtree = (parentId, side) => {
        const parent = getNode(parentId);
        const parentBox = positions[parentId];
        if (!parent || !parentBox) return;
        const kids = getChildren(parentId).filter((c) => c.side === side);
        if (!kids.length) return;

        let blockH = 0;
        kids.forEach((ch, i) => {
          blockH += subtreeBlockHeight(ch.id);
          if (i < kids.length - 1) blockH += GAP_Y;
        });
        let y = parentBox.y + parentBox.h / 2 - blockH / 2;

        kids.forEach((ch) => {
          const sz = measureNode(ch);
          const childX =
            side === 'left'
              ? parentBox.x - GAP_X - sz.w
              : parentBox.x + parentBox.w + GAP_X;
          positions[ch.id] = { x: childX, y, w: sz.w, h: sz.h };
          placeSubtree(ch.id, side);
          y += subtreeBlockHeight(ch.id) + GAP_Y;
        });
      };

      placeSubtree(root.id, 'left');
      placeSubtree(root.id, 'right');

      const xs = Object.values(positions).flatMap((p) => [p.x, p.x + p.w]);
      const ys = Object.values(positions).flatMap((p) => [p.y, p.y + p.h]);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      const treeW = maxX - minX;
      const treeH = maxY - minY;
      const offX = layoutW / 2 - (minX + treeW / 2);
      const offY = layoutH / 2 - (minY + treeH / 2);
      Object.keys(positions).forEach((id) => {
        positions[id].x += offX;
        positions[id].y += offY;
      });

      layoutCache = { positions, bounds: { minX, minY, maxX, maxY, offX, offY } };
      return positions;
    }

    function anchorPoints(parentBox, childBox, side) {
      if (side === 'left') {
        return {
          x1: parentBox.x,
          y1: parentBox.y + parentBox.h / 2,
          x2: childBox.x + childBox.w,
          y2: childBox.y + childBox.h / 2
        };
      }
      return {
        x1: parentBox.x + parentBox.w,
        y1: parentBox.y + parentBox.h / 2,
        x2: childBox.x,
        y2: childBox.y + childBox.h / 2
      };
    }

    function bezierPath(x1, y1, x2, y2) {
      const mx = (x1 + x2) / 2;
      return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
    }

    function renderLinks(positions) {
      if (!gLinks) return;
      gLinks.innerHTML = '';
      const s = ensureMindMapState();
      s.nodes.forEach((node) => {
        if (!node.parentId) return;
        const parent = getNode(node.parentId);
        const pBox = positions[node.parentId];
        const cBox = positions[node.id];
        if (!parent || !pBox || !cBox) return;
        const side = node.side || 'right';
        const { x1, y1, x2, y2 } = anchorPoints(pBox, cBox, side);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const depth = node.parentId === s.rootId ? 3 : 2;
        path.setAttribute('d', bezierPath(x1, y1, x2, y2));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', getBranchColor(node));
        path.setAttribute('stroke-width', String(depth));
        path.setAttribute('stroke-linecap', 'round');
        path.classList.add('wtp-mind-tree-link');
        gLinks.appendChild(path);
      });
    }

    function renderNodes(positions) {
      if (!nodesLayer) return;
      nodesLayer.innerHTML = '';
      const s = ensureMindMapState();
      s.nodes.forEach((node) => {
        const box = positions[node.id];
        if (!box) return;
        const wrap = document.createElement('div');
        wrap.className = 'wtp-mind-tree-node';
        wrap.dataset.id = node.id;
        if (node.id === selectedNodeId) wrap.classList.add('selected');
        if (node.nodeType === 'root') wrap.classList.add('type-root');
        else if (node.nodeType === 'leaf') wrap.classList.add('type-leaf');
        else wrap.classList.add('type-branch');

        wrap.style.left = `${box.x}px`;
        wrap.style.top = `${box.y}px`;
        wrap.style.width = `${box.w}px`;
        wrap.style.height = `${box.h}px`;
        wrap.style.backgroundColor = node.fillColor;
        wrap.style.borderColor = node.borderColor;
        if (node.shape === 'rounded' || node.nodeType === 'root') {
          wrap.style.borderRadius = node.nodeType === 'root' ? '12px' : '8px';
        } else {
          wrap.style.borderRadius = '2px';
        }

        const editor = document.createElement('div');
        editor.className = 'wtp-mind-tree-editor';
        editor.contentEditable = 'true';
        editor.spellcheck = false;
        editor.textContent = node.text || '';
        if (node.nodeType === 'leaf') {
          const underline = document.createElement('span');
          underline.className = 'wtp-mind-leaf-line';
          underline.style.backgroundColor = getBranchColor(node);
          wrap.appendChild(editor);
          wrap.appendChild(underline);
        } else {
          wrap.appendChild(editor);
        }

        editor.addEventListener('input', () => {
          mindMapDirty = true;
          node.text = editor.textContent || '';
          scheduleMindMapSave();
        });
        const onNodePointerDown = (e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          selectNode(node.id);
        };
        editor.addEventListener('mousedown', onNodePointerDown);
        editor.addEventListener('pointerdown', onNodePointerDown);
        editor.addEventListener('dblclick', (e) => e.stopPropagation());

        wrap.addEventListener('mousedown', onNodePointerDown);
        wrap.addEventListener('pointerdown', onNodePointerDown);

        wrap.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          selectNode(node.id);
          showContextMenu(e.clientX, e.clientY, node);
        });

        nodesLayer.appendChild(wrap);
      });
    }

    function redraw() {
      if (!mindCanvasEl || !worldEl) return;
      const rect = mindCanvasEl.getBoundingClientRect();
      const positions = layoutTree(rect.width, rect.height);
      applyViewport();
      renderLinks(positions);
      renderNodes(positions);
      syncStyleUi();
    }

    function applyViewport() {
      const s = ensureMindMapState();
      const v = s.viewport;
      worldEl.style.transform = `translate(${v.panX}px, ${v.panY}px) scale(${v.zoom})`;
      worldEl.style.transformOrigin = '0 0';
    }

    function updateNodeSelection() {
      nodesLayer?.querySelectorAll('.wtp-mind-tree-node').forEach((el) => {
        el.classList.toggle('selected', el.dataset.id === selectedNodeId);
      });
      syncStyleUi();
    }

    function selectNode(id) {
      selectedNodeId = id;
      updateNodeSelection();
    }

    function syncStyleUi() {
      const node = selectedNodeId ? getNode(selectedNodeId) : null;
      if (borderInputEl) {
        borderInputEl.disabled = !node;
        if (node) borderInputEl.value = node.borderColor;
      }
      if (fillInputEl) {
        fillInputEl.disabled = !node;
        if (node) fillInputEl.value = node.fillColor;
      }
      if (branchInputEl) {
        const showBranch = node && node.parentId !== null;
        branchInputEl.disabled = !showBranch;
        if (node && showBranch) branchInputEl.value = node.branchColor;
      }
      if (shapeSelectEl) {
        shapeSelectEl.disabled = !node;
        if (node) shapeSelectEl.value = node.shape;
      }
      if (mindDeleteBtn) mindDeleteBtn.disabled = !node || node.id === ensureMindMapState().rootId;
    }

    function applyStyle(prop, value) {
      if (!selectedNodeId || !value) return;
      const node = getNode(selectedNodeId);
      if (!node) return;
      mindMapDirty = true;
      node[prop] = value;
      scheduleMindMapSave();
      redraw();
    }

    function nextBranchColor() {
      const kids = getChildren(ensureMindMapState().rootId);
      return BRANCH_COLORS[kids.length % BRANCH_COLORS.length];
    }

    function addChild(nodeType, side) {
      const s = ensureMindMapState();
      const parentId = selectedNodeId || s.rootId;
      const parent = getNode(parentId);
      if (!parent) return;
      if (parent.nodeType === 'leaf') return;

      let resolvedSide = side;
      if (parent.parentId === null) {
        if (resolvedSide !== 'left' && resolvedSide !== 'right') {
          const kids = getChildren(parentId);
          resolvedSide = kids.filter((k) => k.side === 'left').length <= kids.filter((k) => k.side === 'right').length
            ? 'left'
            : 'right';
        }
      } else {
        resolvedSide = parent.side || 'right';
      }

      const label =
        nodeType === 'leaf'
          ? wtpBilingual('mindMapNodeLeaf')
          : nodeType === 'branch' && parent.parentId === null
            ? wtpBilingual('mindMapNodeBranch')
            : wtpBilingual('mindMapNodeChild');

      mindMapDirty = true;
      const node = normalizeTreeNode(
        {
          id: wtpMindUuid(),
          parentId,
          text: label,
          nodeType: nodeType === 'leaf' ? 'leaf' : 'branch',
          side: resolvedSide,
          branchColor: parent.parentId === null ? nextBranchColor() : parent.branchColor,
          borderColor: parent.borderColor,
          fillColor: parent.fillColor
        },
        parentId
      );
      s.nodes.push(node);
      selectedNodeId = node.id;
      scheduleMindMapSave();
      redraw();
      shell.bringToFront();
    }

    function collectDescendants(id) {
      const ids = [];
      const walk = (pid) => {
        getChildren(pid).forEach((ch) => {
          ids.push(ch.id);
          walk(ch.id);
        });
      };
      walk(id);
      return ids;
    }

    function deleteSubtree(id) {
      const s = ensureMindMapState();
      if (id === s.rootId) return;
      const remove = new Set(collectDescendants(id));
      remove.add(id);
      s.nodes = s.nodes.filter((n) => !remove.has(n.id));
      if (selectedNodeId && remove.has(selectedNodeId)) selectedNodeId = s.rootId;
      mindMapDirty = true;
      scheduleMindMapSave();
      redraw();
    }

    function clearAll() {
      const s = ensureMindMapState();
      if (s.nodes.length <= 1) return;
      if (!confirm(wtpBilingual('mindMapClearConfirm'))) return;
      mindMapDirty = true;
      setActiveSnapshotId?.(null);
      const fresh = defaultMindMapState();
      setMindMapState(fresh);
      selectedNodeId = fresh.rootId;
      scheduleMindMapSave();
      redraw();
      syncSaveToolbar();
    }

    function cloneMapData() {
      const s = ensureMindMapState();
      return {
        rootId: s.rootId,
        nodes: s.nodes.map((n) => ({ ...n })),
        viewport: { ...s.viewport }
      };
    }

    function syncSaveToolbar() {
      const hasSnap = !!getActiveSnapshotId?.();
      saveNewBtn?.classList.toggle('hidden', hasSnap);
      saveUpdateBtn?.classList.toggle('hidden', !hasSnap);
      saveAsBtn?.classList.toggle('hidden', !hasSnap);
    }

    async function persistSnapshot({ label, activeId, setActiveAfter }) {
      const s = ensureMindMapState();
      if (s.nodes.length <= 1) {
        showMindMapToast?.(wtpBilingual('mindMapSaveEmpty'));
        return false;
      }
      const pk = pageKey();
      const mapData = cloneMapData();
      try {
        let res;
        if (activeId) {
          res = await browser.runtime.sendMessage({
            type: 'UPDATE_SAVED_MINDMAP',
            id: activeId,
            partial: {
              pageKey: pk,
              url: pk,
              title: document.title || '',
              mapData,
              ...(label ? { label } : {})
            }
          });
        } else {
          if (!label) return false;
          res = await browser.runtime.sendMessage({
            type: 'SAVE_SAVED_MINDMAP',
            label,
            pageKey: pk,
            url: pk,
            title: document.title || '',
            mapData
          });
          if (setActiveAfter && res?.item?.id) setActiveSnapshotId?.(res.item.id);
        }
        if (res?.ok !== false) {
          showMindMapToast?.(wtpBilingual('mindMapSaved'));
          syncSaveToolbar();
          return true;
        }
      } catch (err) {
        console.warn('[wtp] persistSnapshot error:', err);
      }
      return false;
    }

    async function saveSnapshotUpdate() {
      const activeId = getActiveSnapshotId?.();
      if (!activeId) return saveSnapshotNew();
      await persistSnapshot({ activeId });
    }

    async function saveSnapshotAs() {
      const s = ensureMindMapState();
      if (s.nodes.length <= 1) {
        showMindMapToast?.(wtpBilingual('mindMapSaveEmpty'));
        return;
      }
      const root = getNode(s.rootId);
      const defaultLabel = (root?.text || '').trim() || defaultRootLabel();
      const label = prompt(wtpBilingual('mindMapSaveLabelPrompt'), defaultLabel);
      if (label === null) return;
      const trimmed = label.trim();
      if (!trimmed) return;
      await persistSnapshot({ label: trimmed, setActiveAfter: true });
    }

    async function saveSnapshotNew() {
      const s = ensureMindMapState();
      if (s.nodes.length <= 1) {
        showMindMapToast?.(wtpBilingual('mindMapSaveEmpty'));
        return;
      }
      const root = getNode(s.rootId);
      const defaultLabel = (root?.text || '').trim() || defaultRootLabel();
      const label = prompt(wtpBilingual('mindMapSaveLabelPrompt'), defaultLabel);
      if (label === null) return;
      const trimmed = label.trim();
      if (!trimmed) return;
      await persistSnapshot({ label: trimmed, setActiveAfter: true });
    }

    function saveSnapshot() {
      const activeId = getActiveSnapshotId?.();
      if (activeId) return saveSnapshotUpdate();
      return saveSnapshotNew();
    }

    function applySnapshotItem(item) {
      if (!item?.mapData) return;
      mindMapDirty = false;
      setActiveSnapshotId?.(item.id || null);
      setMindMapState(migrateMapData(item.mapData));
      selectedNodeId = getMindMapState().rootId;
      redraw();
      syncSaveToolbar();
    }

    function setMindToolbarDisabled(disabled) {
      mindToolbarEl?.querySelectorAll('button, select').forEach((el) => {
        el.disabled = disabled;
      });
    }

    let contextMenu = null;
    function hideContextMenu() {
      contextMenu?.remove();
      contextMenu = null;
    }

    function showContextMenuAt(clientX, clientY, items) {
      hideContextMenu();
      if (!items.length) return;
      contextMenu = document.createElement('div');
      contextMenu.className = 'wtp-mind-context';
      items.forEach(({ key, run }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = wtpBilingual(key);
        btn.addEventListener('click', () => {
          hideContextMenu();
          run();
        });
        contextMenu.appendChild(btn);
      });
      contextMenu.style.left = `${clientX}px`;
      contextMenu.style.top = `${clientY}px`;
      document.body.appendChild(contextMenu);
    }

    function showContextMenu(clientX, clientY, node) {
      const items = [];
      if (node.nodeType !== 'leaf') {
        if (node.parentId === null) {
          items.push({ key: 'mindMapAddBranchLeft', run: () => addChild('branch', 'left') });
          items.push({ key: 'mindMapAddBranchRight', run: () => addChild('branch', 'right') });
        } else {
          items.push({ key: 'mindMapAddChild', run: () => addChild('branch', null) });
        }
        items.push({ key: 'mindMapAddLeaf', run: () => addChild('leaf', null) });
      }
      if (node.id !== ensureMindMapState().rootId) {
        items.push({ key: 'mindMapDeleteNode', run: () => deleteSubtree(node.id) });
      }
      if (ensureMindMapState().nodes.length > 1) {
        items.push({ key: 'mindMapClearAll', run: clearAll });
      }
      showContextMenuAt(clientX, clientY, items);
    }

    function showCanvasContextMenu(e) {
      e.preventDefault();
      e.stopPropagation();
      if (ensureMindMapState().nodes.length <= 1) return;
      showContextMenuAt(e.clientX, e.clientY, [{ key: 'mindMapClearAll', run: clearAll }]);
    }

    function blockPanOnEl(el) {
      if (!el) return;
      const stop = (ev) => ev.stopPropagation();
      el.addEventListener('mousedown', stop);
      el.addEventListener('pointerdown', stop);
    }

    function canStartPan(e, canvas) {
      if (e.target.closest('.wtp-mind-tree-node')) return false;
      if (e.target.closest('.wtp-mind-toolbar, .wtp-mind-style-bar, .wtp-mind-hint')) return false;
      return (
        e.target === canvas ||
        e.target === worldEl ||
        e.target === svg ||
        e.target === nodesLayer ||
        e.target === gLinks
      );
    }

    function setupPanZoom(canvas) {
      let panning = false;
      let startX = 0;
      let startY = 0;
      let panX = 0;
      let panY = 0;

      canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (!canStartPan(e, canvas)) return;
        ensureMindMapState();
        selectedNodeId = null;
        syncStyleUi();
        nodesLayer?.querySelectorAll('.wtp-mind-tree-node').forEach((el) => el.classList.remove('selected'));
        panning = true;
        canvas.classList.add('panning');
        startX = e.clientX;
        startY = e.clientY;
        panX = ensureMindMapState().viewport.panX;
        panY = ensureMindMapState().viewport.panY;
        e.preventDefault();
      });

      document.addEventListener('mousemove', (e) => {
        if (!panning) return;
        const s = ensureMindMapState();
        s.viewport.panX = panX + e.clientX - startX;
        s.viewport.panY = panY + e.clientY - startY;
        applyViewport();
      });

      document.addEventListener('mouseup', () => {
        if (!panning) return;
        panning = false;
        canvas.classList.remove('panning');
        scheduleMindMapSave();
      });

      canvas.addEventListener('contextmenu', showCanvasContextMenu);

      canvas.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          const s = ensureMindMapState();
          const v = s.viewport;
          const delta = e.deltaY > 0 ? 0.9 : 1.1;
          v.zoom = Math.max(0.35, Math.min(2.5, v.zoom * delta));
          applyViewport();
          scheduleMindMapSave();
        },
        { passive: false }
      );
    }

    const shell = wtpCreateFloatingPanel({
      id: 'wtp-float-remarks',
      title: wtpBilingual('floatRemarksTitle'),
      geoPrefix: 'wtpFloatRemarks',
      stackOffset: 60,
      maxW: 10000,
      maxWidthRatio: 0.98,
      maxHeightRatio: 0.96,
      defaultWidth: 560,
      defaultHeight: 480,
      onMount(body) {
        body.innerHTML = `
          <div class="wtp-mind-wrap">
            <div class="wtp-mind-toolbar">
              <button type="button" data-action="branch-left">${wtpBilingual('mindMapAddBranchLeft')}</button>
              <button type="button" data-action="branch-right">${wtpBilingual('mindMapAddBranchRight')}</button>
              <button type="button" data-action="child">${wtpBilingual('mindMapAddChild')}</button>
              <button type="button" data-action="leaf">${wtpBilingual('mindMapAddLeaf')}</button>
              <button type="button" data-action="delete">${wtpBilingual('mindMapDelete')}</button>
              <button type="button" class="wtp-mind-save-new" data-action="save-new">${wtpBilingual('mindMapSaveSnapshot')}</button>
              <button type="button" class="wtp-mind-save-update hidden" data-action="save-update">${wtpBilingual('mindMapSaveUpdate')}</button>
              <button type="button" class="wtp-mind-save-as hidden" data-action="save-as">${wtpBilingual('mindMapSaveAs')}</button>
              <button type="button" data-action="clear-all">${wtpBilingual('mindMapClearAll')}</button>
            </div>
            <div class="wtp-mind-style-bar">
              <label class="wtp-mind-style-label">${wtpBilingual('mindMapShape')}</label>
              <select class="wtp-mind-shape-select">
                <option value="rounded">${wtpBilingual('mindMapShapeRounded')}</option>
                <option value="rect">${wtpBilingual('mindMapShapeRect')}</option>
              </select>
              <label class="wtp-mind-style-label">${wtpBilingual('mindMapBorderColor')}</label>
              <input type="color" class="wtp-mind-border-input" value="#000000" />
              <label class="wtp-mind-style-label">${wtpBilingual('mindMapFillColor')}</label>
              <input type="color" class="wtp-mind-fill-input" value="#ffffff" />
              <label class="wtp-mind-style-label">${wtpBilingual('mindMapBranchColor')}</label>
              <input type="color" class="wtp-mind-branch-input" value="#f97316" />
            </div>
            <p class="wtp-mind-hint">${wtpBilingual('mindMapTreeHint')}</p>
            <div class="wtp-mind-canvas">
              <div class="wtp-mind-world">
                <svg class="wtp-mind-tree-svg" xmlns="http://www.w3.org/2000/svg"></svg>
                <div class="wtp-mind-nodes-layer"></div>
              </div>
            </div>
          </div>
        `;

        mindToolbarEl = body.querySelector('.wtp-mind-toolbar');
        const styleBarEl = body.querySelector('.wtp-mind-style-bar');
        const hintEl = body.querySelector('.wtp-mind-hint');
        blockPanOnEl(mindToolbarEl);
        blockPanOnEl(styleBarEl);
        blockPanOnEl(hintEl);
        mindDeleteBtn = mindToolbarEl?.querySelector('[data-action="delete"]');
        saveNewBtn = mindToolbarEl?.querySelector('[data-action="save-new"]');
        saveUpdateBtn = mindToolbarEl?.querySelector('[data-action="save-update"]');
        saveAsBtn = mindToolbarEl?.querySelector('[data-action="save-as"]');
        shapeSelectEl = body.querySelector('.wtp-mind-shape-select');
        borderInputEl = body.querySelector('.wtp-mind-border-input');
        fillInputEl = body.querySelector('.wtp-mind-fill-input');
        branchInputEl = body.querySelector('.wtp-mind-branch-input');
        mindCanvasEl = body.querySelector('.wtp-mind-canvas');
        worldEl = body.querySelector('.wtp-mind-world');
        nodesLayer = body.querySelector('.wtp-mind-nodes-layer');
        svg = body.querySelector('.wtp-mind-tree-svg');
        gLinks = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        gLinks.setAttribute('class', 'wtp-mind-tree-links');
        svg.appendChild(gLinks);

        shapeSelectEl?.addEventListener('change', () => applyStyle('shape', shapeSelectEl.value));
        borderInputEl?.addEventListener('input', () => applyStyle('borderColor', borderInputEl.value));
        fillInputEl?.addEventListener('input', () => applyStyle('fillColor', fillInputEl.value));
        branchInputEl?.addEventListener('input', () => applyStyle('branchColor', branchInputEl.value));

        const markToolbar = () => {
          if (typeof globalThis.wtpMarkToolbarInteraction === 'function') {
            globalThis.wtpMarkToolbarInteraction();
          }
        };
        mindToolbarEl?.querySelectorAll('button, select').forEach((el) => {
          el.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            markToolbar();
          });
          el.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            markToolbar();
          });
        });
        mindToolbarEl?.querySelectorAll('button').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            markToolbar();
            const action = btn.dataset.action;
            if (action === 'branch-left') addChild('branch', 'left');
            else if (action === 'branch-right') addChild('branch', 'right');
            else if (action === 'child') addChild('branch', null);
            else if (action === 'leaf') addChild('leaf', null);
            else if (action === 'delete') deleteSubtree(selectedNodeId);
            else if (action === 'save-new') saveSnapshotNew();
            else if (action === 'save-update') saveSnapshotUpdate();
            else if (action === 'save-as') saveSnapshotAs();
            else if (action === 'clear-all') clearAll();
          });
        });

        shell.panel.setAttribute('tabindex', '-1');

        function isMindShortcutTarget() {
          const ae = document.activeElement;
          if (!ae) return false;
          if (ae.closest?.('.wtp-mind-tree-editor')) return true;
          if (ae.isContentEditable && ae.closest?.('#wtp-float-remarks')) return true;
          return false;
        }

        function modKey(e) {
          return e.ctrlKey || e.metaKey;
        }

        shell.panel.addEventListener('keydown', (e) => {
          const editing = isMindShortcutTarget();
          const mod = modKey(e);

          if (e.key === 'Escape' && !editing) {
            if (selectedNodeId) {
              e.preventDefault();
              selectedNodeId = null;
              updateNodeSelection();
            }
            hideContextMenu();
            return;
          }

          if (mod && e.key.toLowerCase() === 's' && !editing) {
            e.preventDefault();
            if (e.shiftKey) {
              const hasSnap = !!getActiveSnapshotId?.();
              if (hasSnap) saveSnapshotAs();
              else saveSnapshotNew();
            } else {
              saveSnapshot();
            }
            return;
          }

          if (editing) return;

          if (e.key === 'Delete' && selectedNodeId) {
            const s = ensureMindMapState();
            if (selectedNodeId !== s.rootId) {
              e.preventDefault();
              deleteSubtree(selectedNodeId);
            }
            return;
          }

          if (mod && e.altKey && e.key === 'ArrowLeft') {
            e.preventDefault();
            addChild('branch', 'left');
            return;
          }
          if (mod && e.altKey && e.key === 'ArrowRight') {
            e.preventDefault();
            addChild('branch', 'right');
            return;
          }
          if (mod && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            addChild('branch', null);
            return;
          }
          if (mod && e.shiftKey && e.key.toLowerCase() === 'l') {
            e.preventDefault();
            addChild('leaf', null);
          }
        });

        ensureMindMapState();
        mindMapDirty = false;
        selectedNodeId = getMindMapState().rootId;
        syncStyleUi();
        syncSaveToolbar();
        setupPanZoom(mindCanvasEl);
        document.addEventListener('click', hideContextMenu);
        shell.panel.addEventListener('mousedown', () => shell.panel.focus({ preventScroll: true }));
        requestAnimationFrame(() => redraw());
      },
      onShow: () => {
        loadMindMap();
        shell.panel.focus({ preventScroll: true });
      }
    });

    async function loadMindMap() {
      const gen = ++loadGeneration;
      ensureMindMapState();
      setMindToolbarDisabled(true);
      try {
        const skipDraft = sessionStorage.getItem('wtpSkipDraftLoadOnce') === '1';
        const pendingId = sessionStorage.getItem('wtpPendingMindMapSnapshotId');
        const snapId =
          pendingId || (skipDraft ? getActiveSnapshotId?.() : null) || null;

        if (snapId) {
          sessionStorage.removeItem('wtpPendingMindMapSnapshotId');
          sessionStorage.removeItem('wtpSkipDraftLoadOnce');
          const snapRes = await browser.runtime.sendMessage({
            type: 'GET_SAVED_MINDMAP',
            id: snapId
          });
          if (gen !== loadGeneration) return;
          if (snapRes?.item?.mapData) {
            applySnapshotItem(snapRes.item);
            return;
          }
        }

        sessionStorage.removeItem('wtpSkipDraftLoadOnce');
        let loaded = null;
        const res = await browser.runtime.sendMessage({
          type: 'GET_SITE_MINDMAP',
          pageKey: pageKey()
        });
        if (res?.mapData) loaded = migrateMapData(res.mapData);
        if (gen !== loadGeneration) return;
        if (!mindMapDirty && loaded) {
          setActiveSnapshotId?.(null);
          setMindMapState(loaded);
        } else if (mindMapDirty && loaded?.viewport) {
          getMindMapState().viewport = loaded.viewport;
        }
        ensureMindMapState();
        selectedNodeId = getMindMapState().rootId;
        redraw();
        syncSaveToolbar();
      } catch (err) {
        console.warn('[wtp] loadMindMap error:', err);
      } finally {
        if (gen === loadGeneration) {
          setMindToolbarDisabled(false);
          syncSaveToolbar();
        }
      }
    }

    return { shell, loadMindMap, applySnapshot: applySnapshotItem };
  }

  globalThis.wtpCreateTreeMindMapPanel = createMindMapPanel;
})();
