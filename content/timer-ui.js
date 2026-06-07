(function () {
  let badgeEl = null;
  let expiredOverlay = null;
  let tickInterval = null;
  let lastFlashMinute = null;

  function btnLabel(key) {
    return typeof wtpBilingual === 'function' ? wtpBilingual(key) : key;
  }

  function formatMs(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
  }

  function getRemainingMs(state) {
    if (!state) return 0;
    if (state.status === 'running') return Math.max(0, state.endTime - Date.now());
    if (state.status === 'paused') return state.remainingMs || 0;
    return 0;
  }

  function ensureBadge() {
    if (badgeEl) return badgeEl;
    badgeEl = document.createElement('div');
    badgeEl.id = 'wtp-timer-badge';
    badgeEl.className = 'hidden';
    document.body.appendChild(badgeEl);
    return badgeEl;
  }

  async function refreshBadge() {
    const res = await browser.runtime.sendMessage({ type: 'TIMER_GET' });
    const state = res?.state;
    const badge = ensureBadge();

    if (!state || (state.status !== 'running' && state.status !== 'paused')) {
      badge.classList.add('hidden');
      badge.classList.remove('flash', 'paused');
      lastFlashMinute = null;
      return;
    }

    const left = getRemainingMs(state);
    badge.classList.remove('hidden');
    badge.textContent = formatMs(left);
    badge.classList.toggle('paused', state.status === 'paused');

    const mins = Math.ceil(left / 60000);
    if (state.status === 'running' && (mins === 3 || mins === 2 || mins === 1)) {
      if (lastFlashMinute !== mins) {
        lastFlashMinute = mins;
        badge.classList.add('flash');
        setTimeout(() => badge.classList.remove('flash'), 4000);
      }
    } else if (mins > 3) {
      lastFlashMinute = null;
    }
  }

  function startBadgeTick() {
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(refreshBadge, 250);
    refreshBadge();
  }

  function ensureExpiredOverlay() {
    if (expiredOverlay) return expiredOverlay;
    expiredOverlay = document.createElement('div');
    expiredOverlay.id = 'wtp-timer-expired-overlay';
    expiredOverlay.className = 'hidden';
    expiredOverlay.innerHTML = `
      <div class="wtp-timer-expired-card" role="alertdialog" aria-modal="true">
        <p class="wtp-timer-expired-title"></p>
        <button type="button" class="wtp-timer-expired-close primary"></button>
      </div>
    `;
    const card = expiredOverlay.querySelector('.wtp-timer-expired-card');
    expiredOverlay.querySelector('.wtp-timer-expired-title').textContent =
      btnLabel('timerExpiredTitle');
    expiredOverlay.querySelector('.wtp-timer-expired-close').textContent =
      btnLabel('timerExpiredClose');
    expiredOverlay.querySelector('.wtp-timer-expired-close').addEventListener('click', () => {
      expiredOverlay.classList.add('hidden');
    });
    expiredOverlay.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    card.addEventListener('click', (e) => e.stopPropagation());
    document.body.appendChild(expiredOverlay);
    return expiredOverlay;
  }

  function showTimerExpiredOverlay() {
    const overlay = ensureExpiredOverlay();
    overlay.querySelector('.wtp-timer-expired-title').textContent =
      btnLabel('timerExpiredTitle');
    overlay.querySelector('.wtp-timer-expired-close').textContent =
      btnLabel('timerExpiredClose');
    overlay.classList.remove('hidden');
    const badge = ensureBadge();
    badge.classList.remove('hidden');
    badge.classList.add('flash');
    badge.textContent = '00:00:00';
  }

  function createTimerFab() {
    const fab = document.createElement('button');
    fab.id = 'wtp-timer-fab';
    fab.type = 'button';
    fab.textContent = btnLabel('timerFab');
    document.body.appendChild(fab);

    const overlay = document.createElement('div');
    overlay.id = 'wtp-timer-overlay';
    overlay.className = 'hidden';
    overlay.innerHTML = `
      <div id="wtp-timer-dialog" role="dialog">
        <h2></h2>
        <p class="timer-dialog-status"></p>
        <div class="countdown" id="wtp-fab-countdown">00:05:00</div>
        <div class="time-inputs">
          <label><span class="lbl-h"></span><input type="number" id="wtp-fab-hours" min="0" max="99" value="0" /></label>
          <label><span class="lbl-m"></span><input type="number" id="wtp-fab-minutes" min="0" max="59" value="5" /></label>
          <label><span class="lbl-s"></span><input type="number" id="wtp-fab-seconds" min="0" max="59" value="0" /></label>
        </div>
        <div class="btn-row">
          <button type="button" class="fab-start primary"></button>
          <button type="button" class="fab-pause"></button>
          <button type="button" class="fab-reset"></button>
          <button type="button" class="fab-close"></button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const $ = (sel) => overlay.querySelector(sel);

    function refreshDialogLabels() {
      overlay.querySelector('h2').textContent = btnLabel('timerDialogTitle');
      $('.lbl-h').textContent =
        typeof wtpGetStrings === 'function' ? wtpGetStrings('zh').hours : 'H';
      $('.lbl-m').textContent =
        typeof wtpGetStrings === 'function' ? wtpGetStrings('zh').minutes : 'M';
      $('.lbl-s').textContent =
        typeof wtpGetStrings === 'function' ? wtpGetStrings('zh').seconds : 'S';
      $('.fab-start').textContent = btnLabel('start');
      $('.fab-pause').textContent = btnLabel('pause');
      $('.fab-reset').textContent = btnLabel('reset');
      $('.fab-close').textContent = btnLabel('close');
    }

    function getDurationMs() {
      const h = parseInt($('#wtp-fab-hours').value, 10) || 0;
      const m = parseInt($('#wtp-fab-minutes').value, 10) || 0;
      const s = parseInt($('#wtp-fab-seconds').value, 10) || 0;
      return (h * 3600 + m * 60 + s) * 1000;
    }

    async function refreshDialog() {
      const res = await browser.runtime.sendMessage({ type: 'TIMER_GET' });
      const state = res?.state;
      const cd = $('#wtp-fab-countdown');
      if (!state) {
        cd.textContent = formatMs(getDurationMs());
        $('.fab-start').disabled = false;
        $('.fab-pause').disabled = true;
        $('.fab-pause').textContent = btnLabel('pause');
        $('#wtp-fab-hours').disabled = false;
        $('#wtp-fab-minutes').disabled = false;
        $('#wtp-fab-seconds').disabled = false;
        return;
      }
      $('#wtp-fab-hours').disabled = true;
      $('#wtp-fab-minutes').disabled = true;
      $('#wtp-fab-seconds').disabled = true;
      const left = getRemainingMs(state);
      cd.textContent = formatMs(left);
      $('.fab-start').disabled = true;
      $('.fab-pause').disabled = false;
      $('.fab-pause').textContent =
        state.status === 'paused' ? btnLabel('resume') : btnLabel('pause');
    }

    function openModal() {
      refreshDialogLabels();
      overlay.classList.remove('hidden');
      refreshDialog();
    }

    function closeModal() {
      overlay.classList.add('hidden');
    }

    fab.addEventListener('click', openModal);
    $('.fab-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    $('.fab-start').addEventListener('click', async () => {
      const durationMs = getDurationMs();
      const res = await browser.runtime.sendMessage({ type: 'TIMER_START', durationMs });
      if (!res?.ok) alert(res?.error || 'Failed');
      startBadgeTick();
      refreshDialog();
      closeModal();
    });

    $('.fab-pause').addEventListener('click', async () => {
      const cur = await browser.runtime.sendMessage({ type: 'TIMER_GET' });
      const state = cur?.state;
      if (!state) return;
      if (state.status === 'running') {
        await browser.runtime.sendMessage({ type: 'TIMER_PAUSE' });
      } else if (state.status === 'paused') {
        await browser.runtime.sendMessage({ type: 'TIMER_RESUME' });
      }
      refreshDialog();
      refreshBadge();
    });

    $('.fab-reset').addEventListener('click', async () => {
      await browser.runtime.sendMessage({ type: 'TIMER_RESET' });
      refreshDialog();
      refreshBadge();
    });

    refreshDialogLabels();
    startBadgeTick();

    return { openModal, refreshBadge, startBadgeTick };
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TIMER_EXPIRED') {
      showTimerExpiredOverlay();
    }
    if (msg.type === 'REFRESH_TIMER_BADGE') refreshBadge();
  });

  globalThis.wtpTimerUi = createTimerFab();
})();
