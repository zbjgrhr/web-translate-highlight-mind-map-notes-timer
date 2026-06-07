/** z-index: page < note 3644 < side 3646 < toolbar 3648 < float 3649 < mind-menu 3650 < float-active 3651 */
const WTP_Z_FLOAT_PANEL = 2147483649;
const WTP_Z_FLOAT_ACTIVE = 2147483651;

/**
 * Draggable, resizable floating panel shell (non-modal).
 */
function wtpCreateFloatingPanel(options) {
  const {
    id,
    title = '',
    geoPrefix,
    minW = 280,
    maxW = 720,
    minH = 220,
    maxWidthRatio = 0.85,
    maxHeightRatio = 0.9,
    defaultWidth = 400,
    defaultHeight = 440,
    zIndex = WTP_Z_FLOAT_PANEL
  } = options;

  const WIDTH_KEY = `${geoPrefix}Width`;
  const HEIGHT_KEY = `${geoPrefix}Height`;
  const TOP_KEY = `${geoPrefix}Top`;
  const LEFT_KEY = `${geoPrefix}Left`;

  const panel = document.createElement('div');
  panel.id = id;
  panel.className = 'wtp-float-panel hidden';
  panel.style.zIndex = String(zIndex);
  panel.innerHTML = `
    <div class="wtp-float-frame">
      <div class="wtp-float-resize wtp-float-resize-top" data-edge="n"></div>
      <div class="wtp-float-resize wtp-float-resize-right" data-edge="e"></div>
      <div class="wtp-float-resize wtp-float-resize-bottom" data-edge="s"></div>
      <div class="wtp-float-resize wtp-float-resize-left" data-edge="w"></div>
      <div class="wtp-float-resize wtp-float-resize-nw" data-edge="nw"></div>
      <div class="wtp-float-resize wtp-float-resize-ne" data-edge="ne"></div>
      <div class="wtp-float-resize wtp-float-resize-sw" data-edge="sw"></div>
      <div class="wtp-float-resize wtp-float-resize-se" data-edge="se"></div>
      <div class="wtp-float-inner">
        <header class="wtp-float-header">
          <h2 class="wtp-float-drag-title"></h2>
          <button type="button" class="wtp-float-reset" title=""></button>
          <button type="button" class="wtp-float-close" aria-label="close">×</button>
        </header>
        <div class="wtp-float-body"></div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const titleEl = panel.querySelector('.wtp-float-drag-title');
  const resetBtn = panel.querySelector('.wtp-float-reset');
  const closeBtn = panel.querySelector('.wtp-float-close');
  const bodyEl = panel.querySelector('.wtp-float-body');
  const headerEl = panel.querySelector('.wtp-float-header');

  titleEl.textContent = title;
  resetBtn.title = wtpBilingual('resetNotePanel');
  closeBtn.setAttribute('aria-label', wtpBilingual('close'));

  function maxH() {
    return Math.max(minH, Math.floor(window.innerHeight * maxHeightRatio) - 8);
  }

  function clampWidth(w) {
    const cap = Math.min(maxW, Math.floor(window.innerWidth * maxWidthRatio) - 8);
    return Math.max(minW, Math.min(cap, w));
  }

  function clampHeight(h) {
    return Math.max(minH, Math.min(maxH(), h));
  }

  function isReasonablePosition(top, left) {
    return (
      Number.isFinite(top) &&
      Number.isFinite(left) &&
      top >= 0 &&
      left >= 0 &&
      left <= window.innerWidth - minW * 0.35 &&
      top <= window.innerHeight - minH * 0.25
    );
  }

  function getRect() {
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
    localStorage.setItem(TOP_KEY, String(Math.round(t)));
    localStorage.setItem(LEFT_KEY, String(Math.round(l)));
    localStorage.setItem(WIDTH_KEY, String(w));
    localStorage.setItem(HEIGHT_KEY, String(h));
  }

  function saveGeometry() {
    const r = getRect();
    applyGeometry(r.top, r.left, r.width, r.height);
  }

  function clearSavedLayout() {
    [WIDTH_KEY, HEIGHT_KEY, TOP_KEY, LEFT_KEY].forEach((k) => localStorage.removeItem(k));
  }

  function defaultLeft(width) {
    const sideHost = document.getElementById('wtp-side-panel-host');
    let left = window.innerWidth - width - 16;
    if (sideHost && !sideHost.classList.contains('wtp-host-hidden')) {
      left -= (sideHost.offsetWidth || 340) + 12;
    }
    return Math.max(8, left);
  }

  function applyDefaultPosition() {
    const w = clampWidth(parseInt(localStorage.getItem(WIDTH_KEY), 10) || defaultWidth);
    const h = clampHeight(parseInt(localStorage.getItem(HEIGHT_KEY), 10) || defaultHeight);
    const offset = options.stackOffset || 0;
    applyGeometry(60 + offset, defaultLeft(w) - offset, w, h);
  }

  function applySavedLayout() {
    const top = parseInt(localStorage.getItem(TOP_KEY), 10);
    const left = parseInt(localStorage.getItem(LEFT_KEY), 10);
    const w = parseInt(localStorage.getItem(WIDTH_KEY), 10);
    const h = parseInt(localStorage.getItem(HEIGHT_KEY), 10);
    if (!isReasonablePosition(top, left)) return false;
    applyGeometry(top, left, w || defaultWidth, h || defaultHeight);
    return true;
  }

  function bindCaptureDrag(el, onStart) {
    const start = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const state = onStart(e);
      if (!state) return;
      panel.classList.add('wtp-float-dragging');
      document.body.classList.add('wtp-float-dragging');
      document.body.style.userSelect = 'none';
      if (state.cursor) document.body.style.cursor = state.cursor;

      const onMove = (ev) => {
        ev.preventDefault();
        state.onMove(ev);
      };
      const onUp = () => {
        state.onEnd?.();
        panel.classList.remove('wtp-float-dragging');
        document.body.classList.remove('wtp-float-dragging');
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
      const start = getRect();
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
          if (edge.includes('s')) height = ev.clientY - start.top;
          if (edge.includes('w')) {
            left = ev.clientX;
            width = right - left;
          }
          if (edge.includes('e')) width = ev.clientX - start.left;
          applyGeometry(top, left, width, height);
        },
        onEnd: saveGeometry
      };
    });
  }

  panel.querySelectorAll('.wtp-float-resize[data-edge]').forEach(setupResizeHandle);

  bindCaptureDrag(headerEl, (e) => {
    if (e.target.closest('button')) return null;
    const start = getRect();
    return {
      cursor: 'move',
      onMove(ev) {
        applyGeometry(start.top + ev.clientY - e.clientY, start.left + ev.clientX - e.clientX, start.width, start.height);
      },
      onEnd: saveGeometry
    };
  });

  resetBtn.addEventListener('click', () => {
    clearSavedLayout();
    applyDefaultPosition();
  });

  closeBtn.addEventListener('click', () => hide());

  let mounted = false;

  function show() {
    if (!applySavedLayout()) applyDefaultPosition();
    panel.classList.remove('hidden');
    if (!mounted && options.onMount) {
      options.onMount(bodyEl, api);
      mounted = true;
    }
    options.onShow?.();
    bringToFront();
  }

  function hide() {
    panel.classList.add('hidden');
    options.onHide?.();
  }

  function toggle() {
    if (panel.classList.contains('hidden')) show();
    else hide();
  }

  function isOpen() {
    return !panel.classList.contains('hidden');
  }

  function bringToFront() {
    panel.style.zIndex = String(WTP_Z_FLOAT_ACTIVE);
  }

  panel.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    bringToFront();
  }, true);

  function setTitle(t) {
    titleEl.textContent = t;
  }

  const api = { panel, bodyEl, show, hide, toggle, isOpen, setTitle, bringToFront, saveGeometry };

  return api;
}

if (typeof globalThis !== 'undefined') {
  globalThis.wtpCreateFloatingPanel = wtpCreateFloatingPanel;
  globalThis.WTP_Z_FLOAT_PANEL = WTP_Z_FLOAT_PANEL;
  globalThis.WTP_Z_FLOAT_ACTIVE = WTP_Z_FLOAT_ACTIVE;
}
