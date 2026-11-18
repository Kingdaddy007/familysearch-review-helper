(function initFSReviewStage1Content() {
  'use strict';

  const Helpers = globalThis.FSReviewHelpers;
  if (!Helpers) {
    return;
  }

  const STORAGE_KEYS = {
    paused: 'fsStage1Paused',
    autoAttach: 'fsStage1AutoAttach'
  };

  const state = {
    paused: false,
    autoAttachEnabled: false,
    legendOpen: false,
    pointerDown: false,
    lastStatusNote: 'Ready',
    lastAutoAttachAt: 0,
    handledAttachButtons: new WeakSet()
  };

  function hasChromeStorage() {
    return Boolean(
      typeof chrome !== 'undefined' &&
        chrome.storage &&
        chrome.storage.local &&
        typeof chrome.storage.local.get === 'function'
    );
  }

  function loadSettings(onDone) {
    if (!hasChromeStorage()) {
      onDone();
      return;
    }
    chrome.storage.local.get(
      { [STORAGE_KEYS.paused]: false, [STORAGE_KEYS.autoAttach]: false },
      (items) => {
        state.paused = Boolean(items[STORAGE_KEYS.paused]);
        state.autoAttachEnabled = Boolean(items[STORAGE_KEYS.autoAttach]);
        onDone();
      }
    );
  }

  function saveSettings() {
    if (!hasChromeStorage()) {
      return;
    }
    chrome.storage.local.set({
      [STORAGE_KEYS.paused]: state.paused,
      [STORAGE_KEYS.autoAttach]: state.autoAttachEnabled
    });
  }

  function isInsideHud(event) {
    if (!event) {
      return false;
    }
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    return path.some((node) => node && node.id === 'fs-stage1-hud');
  }

  function formatStepLabel(step) {
    switch (step) {
      case 'step1':
        return 'Step 1';
      case 'step2':
        return 'Step 2';
      case 'step3':
        return 'Step 3';
      case 'step4':
        return 'Step 4';
      default:
        return 'Unrecognized';
    }
  }

  function createHud() {
    if (document.getElementById('fs-stage1-hud')) {
      return;
    }

    const hud = document.createElement('aside');
    hud.id = 'fs-stage1-hud';
    hud.setAttribute('aria-label', 'Full Name Review Helper Controls');
    hud.innerHTML = `
      <div class="fs-hud-row">
        <span class="fs-hud-title">FS Helper v0.2</span>
        <span class="fs-hud-badge" data-hud-step>Checking…</span>
        <button type="button" class="fs-hud-btn" data-hud-pause aria-pressed="false">Active</button>
        <button type="button" class="fs-hud-btn" data-hud-legend aria-expanded="false">Keys ?</button>
      </div>
      <div class="fs-hud-row fs-hud-subrow">
        <button type="button" class="fs-hud-btn fs-hud-auto" data-hud-auto-attach aria-pressed="false">
          Auto-Attach: OFF
        </button>
        <span class="fs-hud-status" data-hud-status>Ready</span>
      </div>
      <div class="fs-hud-legend" data-hud-legend-panel hidden>
        <div><kbd>Y</kbd> Yes &nbsp; <kbd>N</kbd> No &nbsp; <kbd>U</kbd> Unsure</div>
        <div><kbd>H</kbd> New Highlight &nbsp; <kbd>A</kbd> Attach &nbsp; <kbd>D</kbd> Detach</div>
        <div><kbd>Enter</kbd> Next / Done (works in name boxes)</div>
      </div>
    `;

    document.body.appendChild(hud);

    const pauseBtn = hud.querySelector('[data-hud-pause]');
    const legendBtn = hud.querySelector('[data-hud-legend]');
    const autoBtn = hud.querySelector('[data-hud-auto-attach]');

    pauseBtn.addEventListener('click', (ev) => {
      state.paused = !state.paused;
      state.lastStatusNote = state.paused ? 'Paused by user' : 'Resumed';
      if (ev.detail > 0) pauseBtn.blur();
      saveSettings();
      renderHud();
    });

    legendBtn.addEventListener('click', (ev) => {
      state.legendOpen = !state.legendOpen;
      if (ev.detail > 0) legendBtn.blur();
      renderHud();
    });

    autoBtn.addEventListener('click', (ev) => {
      state.autoAttachEnabled = !state.autoAttachEnabled;
      state.lastStatusNote = state.autoAttachEnabled
        ? 'Auto-Attach ON (guarded)'
        : 'Auto-Attach OFF (use A)';
      if (ev.detail > 0) autoBtn.blur();
      saveSettings();
      renderHud();
    });

    renderHud();
  }

  function renderHud() {
    const hud = document.getElementById('fs-stage1-hud');
    if (!hud) {
      return;
    }

    const step = Helpers.detectStep(document);
    const dialogOpen = Helpers.isDialogOpen(document);

    const stepEl = hud.querySelector('[data-hud-step]');
    const pauseBtn = hud.querySelector('[data-hud-pause]');
    const legendBtn = hud.querySelector('[data-hud-legend]');
    const legendPanel = hud.querySelector('[data-hud-legend-panel]');
    const autoBtn = hud.querySelector('[data-hud-auto-attach]');
    const statusEl = hud.querySelector('[data-hud-status]');

    stepEl.textContent = dialogOpen ? `${formatStepLabel(step)} · Dialog` : formatStepLabel(step);

    pauseBtn.textContent = state.paused ? 'Paused' : 'Active';
    pauseBtn.setAttribute('aria-pressed', String(state.paused));
    pauseBtn.classList.toggle('is-paused', state.paused);

    legendBtn.setAttribute('aria-expanded', String(state.legendOpen));
    legendPanel.hidden = !state.legendOpen;

    autoBtn.textContent = state.autoAttachEnabled ? 'Auto-Attach: ON' : 'Auto-Attach: OFF';
    autoBtn.setAttribute('aria-pressed', String(state.autoAttachEnabled));
    autoBtn.classList.toggle('is-enabled', state.autoAttachEnabled);

    statusEl.textContent = state.lastStatusNote;
  }

  function isActiveReviewRoute() {
    if (location.protocol === 'file:') {
      return true;
    }
    return /getinvolved\/full-name-review/i.test(location.pathname);
  }

  function syncRouteVisibility() {
    const active = isActiveReviewRoute();
    const hud = document.getElementById('fs-stage1-hud');
    if (active && !hud) {
      createHud();
    } else if (hud) {
      hud.hidden = !active;
    }
    return active;
  }

  let transition = null;
  let pending = false;

  function waitForDone(request) {
    if (request !== transition) return;
    if (performance.now() >= request.expires || state.paused ||
        !isActiveReviewRoute() || Helpers.isDialogOpen(document)) {
      transition = null;
      return;
    }
    const step = Helpers.detectStep(document);
    if (step === 'step4') {
      const { control, matchCount } = Helpers.diagnoseActionControl(document, 'done', step);
      if (control || matchCount > 1) {
        transition = null;
        if (control) {
          control.click();
          state.lastStatusNote = 'Pressed ENTER → Done';
          scheduleCheck();
        }
        return;
      }
    } else if (step !== 'step3' && step !== 'unknown') {
      transition = null;
      return;
    }
    setTimeout(() => waitForDone(request), 24);
  }

  function handleKeyDown(event) {
    if (!isActiveReviewRoute()) {
      return;
    }
    if (isInsideHud(event) && (event.key === 'Enter' || event.key === ' ')) {
      return;
    }

    const action = Helpers.mapKeyToAction(event.key);
    if (!action) {
      return;
    }

    if (event.repeat || event.isComposing || event.defaultPrevented ||
        event.ctrlKey || event.altKey || event.metaKey) return;
    if (action !== 'next') transition = null;
    const guard = Helpers.evaluateShortcutGuards(event, state, document);
    if (action === 'next' && transition && performance.now() < transition.expires &&
        ['ok', 'ok_input_enter', 'unrecognized_step'].includes(guard.reason) &&
        ['step3', 'step4', 'unknown'].includes(guard.step)) {
      event.preventDefault();
      event.stopPropagation();
      if (!pending) {
        pending = true;
        waitForDone(transition);
      }
      return;
    }
    if (guard.suppressed) {
      if (guard.reason === 'typing' || guard.reason === 'dialog_open' || guard.reason === 'paused') {
        state.lastStatusNote = `Ignored (${guard.reason.replace('_', ' ')})`;
        renderHud();
      }
      return;
    }

    if (guard.inputElement && typeof guard.inputElement.blur === 'function') {
      guard.inputElement.blur();
    }

    const diag = Helpers.diagnoseActionControl(document, action, guard.step);
    let control = diag.control;
    if (!control && guard.inputElement) {
      event.preventDefault();
      event.stopPropagation();
      setTimeout(() => {
        const delayedControl = Helpers.findActionControl(document, action, Helpers.detectStep(document));
        if (delayedControl) {
          delayedControl.click();
          state.lastStatusNote = `Pressed ${event.key.toUpperCase()} → ${delayedControl.textContent.trim() || action}`;
          setTimeout(renderHud, 20);
        }
      }, 20);
      return;
    }

    if (!control) {
      state.lastStatusNote =
        diag.matchCount > 1
          ? `Skipped ${event.key.toUpperCase()} (${diag.matchCount} "${action}" buttons)`
          : `No "${action}" button on ${guard.step}`;
      renderHud();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (action === 'next' && guard.step === 'step3' &&
        control !== Helpers.findActionControl(document, 'done', 'step3')) {
      transition = { expires: performance.now() + 750 };
      pending = false;
    }
    control.click();
    state.lastStatusNote = `Pressed ${event.key.toUpperCase()} → ${control.textContent.trim() || action}`;
    setTimeout(renderHud, 20);
  }

  function maybeAutoAttach() {
    if (!state.autoAttachEnabled || state.paused) {
      return;
    }
    if (Helpers.isDialogOpen(document)) {
      return;
    }
    const step = Helpers.detectStep(document);
    if (step !== 'step2') {
      return;
    }

    const attachBtn = Helpers.findActionControl(document, 'attach', step);
    if (!attachBtn || state.handledAttachButtons.has(attachBtn)) {
      return;
    }

    const boxState = Helpers.classifySelectionBoxState(document, {
      pointerDown: state.pointerDown
    });

    if (boxState !== 'ready_word_box') {
      state.lastStatusNote =
        boxState === 'drawing_or_resizing'
          ? 'Resizing/drawing — press A when ready'
          : 'Auto-Attach unverified here — press A';
      renderHud();
      return;
    }

    const now = Date.now();
    if (now - state.lastAutoAttachAt < 350) {
      return;
    }

    state.handledAttachButtons.add(attachBtn);
    state.lastAutoAttachAt = now;
    attachBtn.click();
    state.lastStatusNote = 'Auto-Attached ready word box';
    setTimeout(renderHud, 20);
  }

  let mutationTimer = null;
  function scheduleCheck() {
    if (mutationTimer) {
      return;
    }
    mutationTimer = setTimeout(() => {
      mutationTimer = null;
      if (!syncRouteVisibility()) {
        return;
      }
      renderHud();
      maybeAutoAttach();
    }, 60);
  }

  function start() {
    loadSettings(() => {
      syncRouteVisibility();
      window.addEventListener('popstate', scheduleCheck);
      window.addEventListener('hashchange', scheduleCheck);

      document.addEventListener('keydown', handleKeyDown, true);
      document.addEventListener(
        'pointerdown',
        (event) => {
          transition = null;
          if (!isInsideHud(event)) {
            state.pointerDown = true;
          }
        },
        true
      );
      document.addEventListener(
        'pointerup',
        () => {
          state.pointerDown = false;
          scheduleCheck();
        },
        true
      );

      const observer = new MutationObserver(records => {
        if (records.some(record => !record.target.closest?.('#fs-stage1-hud'))) scheduleCheck();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'aria-disabled', 'hidden', 'open', 'data-fs-selection-state', 'data-user-modified']
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();

