(function initFSReviewHelpers(globalScope) {
  'use strict';

  const ACTION_KEY_MAP = Object.freeze({
    y: 'yes',
    n: 'no',
    u: 'unsure',
    h: 'newHighlight',
    a: 'attach',
    d: 'detach',
    enter: 'next'
  });

  const ACTION_LABELS = Object.freeze({
    yes: ['yes'],
    no: ['no'],
    unsure: ['unsure'],
    newHighlight: ['new highlight'],
    attach: ['attach'],
    detach: ['detach', 'detach highlight', 'remove highlight'],
    next: ['next'],
    done: ['done']
  });

  const NEXT_EXCLUDED_LABELS = Object.freeze([
    'go back',
    'back',
    'previous'
  ]);

  const NON_TEXT_INPUT_TYPES = new Set([
    'button',
    'submit',
    'reset',
    'checkbox',
    'radio',
    'file',
    'hidden',
    'image'
  ]);

  const STEP_ALLOWED_ACTIONS = Object.freeze({
    step1: Object.freeze(['yes', 'no', 'unsure', 'next']),
    step2: Object.freeze(['newHighlight', 'attach', 'detach', 'next']),
    step3: Object.freeze(['next', 'done']),
    step4: Object.freeze(['done', 'next']),
    unknown: Object.freeze([])
  });

  /**
   * Normalize button/heading text by stripping icon glyphs and collapsing whitespace.
   * @param {string} raw
   * @returns {string}
   */
  function normalizeText(raw) {
    if (typeof raw !== 'string') {
      return '';
    }
    return raw
      .replace(/[✓✔×✕✖✗✘<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * Traverse light DOM and any open shadowRoot descendants matching selector.
   * @param {ParentNode} root
   * @param {string} selector
   * @param {Element[]} [results]
   * @returns {Element[]}
   */
  function queryAllDeep(root, selector, results = []) {
    if (!root || typeof root.querySelectorAll !== 'function') {
      return results;
    }

    const directMatches = root.querySelectorAll(selector);
    for (let i = 0; i < directMatches.length; i += 1) {
      results.push(directMatches[i]);
    }

    const allNodes = root.querySelectorAll('*');
    for (let i = 0; i < allNodes.length; i += 1) {
      const node = allNodes[i];
      if (node.shadowRoot) {
        queryAllDeep(node.shadowRoot, selector, results);
      }
    }
    return results;
  }

  const IGNORED_TEXT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

  /**
   * Collect visible text across light DOM and open shadow roots for step detection.
   * Excludes <script>, <style>, <template>, hidden nodes, and our own HUD.
   * @param {ParentNode} root
   * @returns {string}
   */
  function collectVisibleText(root) {
    if (!root) {
      return '';
    }
    const target = root.body || root;
    const chunks = [];

    if (typeof target.innerText === 'string') {
      if (target.id !== 'fs-stage1-hud') {
        chunks.push(target.innerText);
      }
    } else if (target.childNodes && target.childNodes.length > 0) {
      for (let i = 0; i < target.childNodes.length; i += 1) {
        const child = target.childNodes[i];
        if (child.nodeType === 3 && child.nodeValue) {
          chunks.push(child.nodeValue);
        } else if (child.nodeType === 1) {
          const tag = String(child.tagName || '').toUpperCase();
          if (!IGNORED_TEXT_TAGS.has(tag) && child.id !== 'fs-stage1-hud' && isElementVisible(child)) {
            chunks.push(collectVisibleText(child));
          }
        }
      }
    } else if (typeof target.textContent === 'string' && target.textContent.trim()) {
      chunks.push(target.textContent);
    }

    if (typeof target.querySelectorAll === 'function') {
      const nodes = target.querySelectorAll('*');
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (node.id === 'fs-stage1-hud') {
          continue;
        }
        if (node.shadowRoot) {
          chunks.push(collectVisibleText(node.shadowRoot));
        }
      }
    }
    return normalizeText(chunks.join(' '));
  }

  /**
   * Determine if an element is currently visible in the viewport/layout.
   * @param {Element | null} el
   * @returns {boolean}
   */
  function isElementVisible(el) {
    if (!el) {
      return false;
    }
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    const win = el.ownerDocument && el.ownerDocument.defaultView;
    if (win && typeof win.getComputedStyle === 'function') {
      const style = win.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0' ||
        style.pointerEvents === 'none'
      ) {
        return false;
      }
    }

    if (typeof el.getBoundingClientRect === 'function') {
      const rect = el.getBoundingClientRect();
      if (rect && typeof rect.width === 'number' && typeof rect.height === 'number') {
        if (rect.width <= 0 || rect.height <= 0) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Determine if an interactive control is enabled.
   * @param {Element | null} el
   * @returns {boolean}
   */
  function isButtonEnabled(el) {
    if (!el) {
      return false;
    }
    if (el.disabled === true || el.hasAttribute('disabled')) {
      return false;
    }
    if (el.getAttribute('aria-disabled') === 'true') {
      return false;
    }
    return true;
  }

  /**
   * Detect the current Full Name Review step from visible page text.
   * @param {ParentNode} root
   * @returns {'step1' | 'step2' | 'step3' | 'step4' | 'unknown'}
   */
  function detectStep(root) {
    const text = typeof root === 'string' ? normalizeText(root) : collectVisibleText(root);
    if (!text) {
      return 'unknown';
    }
    if (text.includes('step 1 of 4') || text.includes('is the full name highlighted')) {
      return 'step1';
    }
    if (text.includes('step 2 of 4') || text.includes('add or remove highlights')) {
      return 'step2';
    }
    if (text.includes('step 3 of 4') || text.includes('drag the name parts')) {
      return 'step3';
    }
    if (text.includes('step 4 of 4')) {
      return 'step4';
    }
    return 'unknown';
  }

  /**
   * Detect whether a modal or dialog is currently open on the page.
   * @param {ParentNode} root
   * @returns {boolean}
   */
  function isDialogOpen(root) {
    const dialogs = queryAllDeep(
      root,
      '[role="dialog"], [role="alertdialog"], dialog[open], [aria-modal="true"]'
    );
    for (let i = 0; i < dialogs.length; i += 1) {
      const dialog = dialogs[i];
      if (dialog.id === 'fs-stage1-hud' || (typeof dialog.closest === 'function' && dialog.closest('#fs-stage1-hud'))) {
        continue;
      }
      if (isElementVisible(dialog)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Return the focused single-line text <input> element from event path, or null.
   * @param {KeyboardEvent | { target?: any, composedPath?: () => any[] }} event
   * @returns {Element | null}
   */
  function findSingleLineTextInput(event) {
    if (!event) {
      return null;
    }
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    for (let i = 0; i < path.length; i += 1) {
      const node = path[i];
      if (!node || !node.tagName) {
        continue;
      }
      const tag = String(node.tagName).toUpperCase();
      if (tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable) {
        return null;
      }
      if (tag === 'INPUT') {
        const type = typeof node.getAttribute === 'function'
          ? String(node.getAttribute('type') || node.type || 'text').toLowerCase()
          : String(node.type || 'text').toLowerCase();
        return NON_TEXT_INPUT_TYPES.has(type) ? null : node;
      }
    }
    return null;
  }

  /**
   * Check whether a keyboard event originated inside an editable input/control.
   * @param {KeyboardEvent | { target?: any, composedPath?: () => any[] }} event
   * @returns {boolean}
   */
  function isEditableTarget(event) {
    if (!event) {
      return false;
    }
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    for (let i = 0; i < path.length; i += 1) {
      const node = path[i];
      if (!node || !node.tagName) {
        continue;
      }
      const tag = String(node.tagName).toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return true;
      }
      if (node.isContentEditable) {
        return true;
      }
      if (typeof node.getAttribute === 'function') {
        const ce = node.getAttribute('contenteditable');
        const role = node.getAttribute('role');
        if (ce === '' || ce === 'true' || role === 'textbox') {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Return the allowed logical actions for a given step.
   * @param {string} step
   * @returns {readonly string[]}
   */
  function getAllowedActionsForStep(step) {
    return STEP_ALLOWED_ACTIONS[step] || STEP_ALLOWED_ACTIONS.unknown;
  }

  /**
   * Extract normalized accessible label from a clickable element.
   * @param {Element} el
   * @returns {string}
   */
  function getControlLabel(el) {
    const text = normalizeText(el.innerText || el.textContent || '');
    const aria = normalizeText(el.getAttribute('aria-label') || '');
    return text || aria;
  }

  function dedupeNestedElements(elements) {
    if (elements.length <= 1) {
      return elements;
    }
    return elements.filter((el, idx) => {
      for (let j = 0; j < elements.length; j += 1) {
        if (idx !== j && typeof el.contains === 'function' && el.contains(elements[j])) {
          return false;
        }
      }
      return true;
    });
  }

  function matchesActionLabel(action, targetLabels, label, aria) {
    if (targetLabels.includes(label) || targetLabels.includes(aria)) {
      return true;
    }
    if (action === 'detach') {
      return label.includes('detach') || aria.includes('detach');
    }
    return false;
  }

  function collectMatchingControls(root, action) {
    const targetLabels = ACTION_LABELS[action];
    if (!targetLabels) {
      return [];
    }

    const candidates = queryAllDeep(root, 'button, [role="button"], a');
    const matches = [];
    for (let i = 0; i < candidates.length; i += 1) {
      const el = candidates[i];
      if (el.id === 'fs-stage1-hud' || (typeof el.closest === 'function' && el.closest('#fs-stage1-hud'))) {
        continue;
      }
      if (typeof el.closest === 'function' && el.closest('[inert], [aria-hidden="true"]')) {
        continue;
      }
      const label = getControlLabel(el);
      const aria = normalizeText(el.getAttribute('aria-label') || '');

      if (action === 'next' || action === 'done') {
        if (NEXT_EXCLUDED_LABELS.includes(label) || NEXT_EXCLUDED_LABELS.includes(aria)) {
          continue;
        }
      }

      if (matchesActionLabel(action, targetLabels, label, aria) && isButtonEnabled(el) && isElementVisible(el)) {
        matches.push(el);
      }
    }
    return dedupeNestedElements(matches);
  }

  /**
   * Find the unique visible, enabled control matching an action on a recognized step,
   * returning diagnostic count when 0 or >1 controls matched.
   * @param {ParentNode} root
   * @param {string} action
   * @param {string} step
   * @returns {{ control: Element | null, matchCount: number }}
   */
  function diagnoseActionControl(root, action, step) {
    const allowed = getAllowedActionsForStep(step);
    const actionsToTry = [];

    if (action === 'next') {
      if (step === 'step4') {
        if (allowed.includes('done')) actionsToTry.push('done');
        if (allowed.includes('next')) actionsToTry.push('next');
      } else {
        if (allowed.includes('next')) actionsToTry.push('next');
        if (allowed.includes('done')) actionsToTry.push('done');
      }
    } else if (allowed.includes(action)) {
      actionsToTry.push(action);
    }

    let lastCount = 0;
    for (let i = 0; i < actionsToTry.length; i += 1) {
      const matches = collectMatchingControls(root, actionsToTry[i]);
      if (matches.length === 1) {
        return { control: matches[0], matchCount: 1 };
      }
      if (matches.length > 1) {
        lastCount = matches.length;
      }
    }
    return { control: null, matchCount: lastCount };
  }

  /**
   * Find the unique visible, enabled control matching an action on a recognized step.
   * On step3/step4, Enter ("next") also falls back to / matches "done".
   * @param {ParentNode} root
   * @param {string} action
   * @param {string} step
   * @returns {Element | null}
   */
  function findActionControl(root, action, step) {
    return diagnoseActionControl(root, action, step).control;
  }

  /**
   * Map a KeyboardEvent key to an action name or null.
   * @param {string} key
   * @returns {string | null}
   */
  function mapKeyToAction(key) {
    if (typeof key !== 'string') {
      return null;
    }
    return ACTION_KEY_MAP[key.toLowerCase()] || null;
  }

  /**
   * Evaluate whether shortcuts should be suppressed for the current event and page state.
   * Allows Enter inside single-line text <input> boxes so users can advance Next/Done without clicking outside first.
   * @param {KeyboardEvent} event
   * @param {{ paused: boolean }} state
   * @param {ParentNode} root
   * @returns {{ suppressed: boolean, reason: string, step: string, inputElement?: Element | null }}
   */
  function evaluateShortcutGuards(event, state, root) {
    const step = detectStep(root);
    if (state && state.paused) {
      return { suppressed: true, reason: 'paused', step };
    }
    if (!event) {
      return { suppressed: true, reason: 'no_event', step };
    }
    if (event.defaultPrevented || event.isComposing) {
      return { suppressed: true, reason: 'event_ignored', step };
    }
    if (event.repeat) {
      return { suppressed: true, reason: 'key_repeat', step };
    }
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return { suppressed: true, reason: 'modifier_key', step };
    }
    if (isDialogOpen(root)) {
      return { suppressed: true, reason: 'dialog_open', step };
    }
    if (step === 'unknown') {
      return { suppressed: true, reason: 'unrecognized_step', step };
    }

    if (isEditableTarget(event)) {
      const isEnter = typeof event.key === 'string' && event.key.toLowerCase() === 'enter';
      const inputEl = isEnter ? findSingleLineTextInput(event) : null;
      if (isEnter && inputEl) {
        return { suppressed: false, reason: 'ok_input_enter', step, inputElement: inputEl };
      }
      return { suppressed: true, reason: 'typing', step };
    }

    return { suppressed: false, reason: 'ok', step };
  }

  /**
   * Classify whether an active Step 2 selection is an explicit ready-made word box
   * vs. a box currently being drawn/resized, or ambiguous (e.g. unverified live DOM).
   * @param {ParentNode} root
   * @param {{ pointerDown?: boolean, isDrawingOrResizing?: boolean }} [interaction]
   * @returns {'ready_word_box' | 'drawing_or_resizing' | 'ambiguous'}
   */
  function classifySelectionBoxState(root, interaction = {}) {
    if (interaction.pointerDown || interaction.isDrawingOrResizing) {
      return 'drawing_or_resizing';
    }

    const activeDrawing = queryAllDeep(
      root,
      '[data-fs-selection-state="drawing"], [data-fs-selection-state="resizing"], [data-resizing="true"], [data-drawing="true"]'
    );
    for (let i = 0; i < activeDrawing.length; i += 1) {
      if (isElementVisible(activeDrawing[i])) {
        return 'drawing_or_resizing';
      }
    }

    const readyBoxes = queryAllDeep(
      root,
      '[data-fs-ready-word-box="true"], [data-selection-kind="ready-word"]'
    );
    for (let i = 0; i < readyBoxes.length; i += 1) {
      const box = readyBoxes[i];
      if (!isElementVisible(box)) {
        continue;
      }
      if (
        box.getAttribute('data-user-modified') === 'true' ||
        box.getAttribute('data-needs-resize') === 'true'
      ) {
        return 'drawing_or_resizing';
      }
      return 'ready_word_box';
    }

    return 'ambiguous';
  }

  const exported = {
    ACTION_KEY_MAP,
    ACTION_LABELS,
    NEXT_EXCLUDED_LABELS,
    STEP_ALLOWED_ACTIONS,
    normalizeText,
    queryAllDeep,
    collectVisibleText,
    isElementVisible,
    isButtonEnabled,
    detectStep,
    isDialogOpen,
    isEditableTarget,
    getAllowedActionsForStep,
    diagnoseActionControl,
    findActionControl,
    mapKeyToAction,
    evaluateShortcutGuards,
    classifySelectionBoxState
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
  if (globalScope) {
    globalScope.FSReviewHelpers = exported;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);

