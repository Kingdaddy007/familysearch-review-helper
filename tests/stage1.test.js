'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const helpers = require('../dom-helpers.js');

function makeButton({ text, disabled = false, visible = true, ariaLabel = '', id = '' }) {
  return {
    id,
    tagName: 'BUTTON',
    innerText: text,
    textContent: text,
    disabled,
    hidden: !visible,
    shadowRoot: null,
    closest: () => null,
    hasAttribute: (attr) => (attr === 'disabled' ? disabled : false),
    getAttribute: (attr) => {
      if (attr === 'aria-label') return ariaLabel;
      if (attr === 'aria-disabled') return disabled ? 'true' : null;
      if (attr === 'aria-hidden') return visible ? null : 'true';
      return null;
    },
    getBoundingClientRect: () => (visible ? { width: 80, height: 32 } : { width: 0, height: 0 }),
    ownerDocument: null
  };
}

function makeMockRoot({ textContent = '', buttons = [], dialogs = [], selectionNodes = [] }) {
  return {
    textContent,
    querySelectorAll: (selector) => {
      if (selector === '*') return [];
      if (selector === 'button, [role="button"], a') return buttons;
      if (selector.includes('[role="dialog"]')) return dialogs;
      if (selector.includes('data-fs-selection-state') || selector.includes('data-fs-ready-word-box')) {
        return selectionNodes.filter((n) => n.matchesSelector(selector));
      }
      return [];
    }
  };
}

test('manifest.json is valid Manifest V3 scoped to FamilySearch Get Involved', () => {
  const manifestPath = path.join(__dirname, '..', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.ok(manifest.content_scripts[0].matches.some((m) => m.includes('getinvolved')));
});

test('mapKeyToAction maps exact Stage 1 keys only', () => {
  assert.equal(helpers.mapKeyToAction('y'), 'yes');
  assert.equal(helpers.mapKeyToAction('Y'), 'yes');
  assert.equal(helpers.mapKeyToAction('n'), 'no');
  assert.equal(helpers.mapKeyToAction('u'), 'unsure');
  assert.equal(helpers.mapKeyToAction('h'), 'newHighlight');
  assert.equal(helpers.mapKeyToAction('a'), 'attach');
  assert.equal(helpers.mapKeyToAction('d'), 'detach');
  assert.equal(helpers.mapKeyToAction('D'), 'detach');
  assert.equal(helpers.mapKeyToAction('Enter'), 'next');
  assert.equal(helpers.mapKeyToAction(' '), null);
  assert.equal(helpers.mapKeyToAction('z'), null);
});

test('detectStep recognizes steps 1 to 4 and returns unknown otherwise', () => {
  assert.equal(helpers.detectStep('Full Name Review Step 1 of 4 Is the full name highlighted?'), 'step1');
  assert.equal(helpers.detectStep('Step 2 of 4 Add or remove highlights'), 'step2');
  assert.equal(helpers.detectStep('Step 3 of 4 Drag the name parts below'), 'step3');
  assert.equal(helpers.detectStep('Step 4 of 4 Confirm and finish'), 'step4');
  assert.equal(helpers.detectStep('FamilySearch Home Page'), 'unknown');
});

test('evaluateShortcutGuards suppresses repeat, typing, open dialog, paused, and unknown step', () => {
  const step1Root = makeMockRoot({ textContent: 'Step 1 of 4' });
  assert.equal(
    helpers.evaluateShortcutGuards({ key: 'y', repeat: false }, { paused: false }, step1Root).suppressed,
    false
  );
  assert.equal(
    helpers.evaluateShortcutGuards({ key: 'y', repeat: true }, { paused: false }, step1Root).reason,
    'key_repeat'
  );
  assert.equal(
    helpers.evaluateShortcutGuards({ key: 'y', repeat: false }, { paused: true }, step1Root).reason,
    'paused'
  );
  assert.equal(
    helpers.evaluateShortcutGuards(
      { key: 'y', repeat: false, target: { tagName: 'INPUT' } },
      { paused: false },
      step1Root
    ).reason,
    'typing'
  );

  const step3Root = makeMockRoot({ textContent: 'Step 3 of 4' });
  const textInput = { tagName: 'INPUT', type: 'text' };
  const inputEnterGuard = helpers.evaluateShortcutGuards(
    { key: 'Enter', repeat: false, target: textInput },
    { paused: false },
    step3Root
  );
  assert.equal(inputEnterGuard.suppressed, false);
  assert.equal(inputEnterGuard.reason, 'ok_input_enter');
  assert.equal(inputEnterGuard.inputElement, textInput);

  assert.equal(
    helpers.evaluateShortcutGuards(
      { key: 'Enter', repeat: false, target: { tagName: 'TEXTAREA' } },
      { paused: false },
      step3Root
    ).reason,
    'typing'
  );

  const dialogRoot = makeMockRoot({
    textContent: 'Step 1 of 4',
    dialogs: [makeButton({ text: 'Dialog', visible: true })]
  });
  assert.equal(
    helpers.evaluateShortcutGuards({ key: 'y', repeat: false }, { paused: false }, dialogRoot).reason,
    'dialog_open'
  );
  assert.equal(
    helpers.evaluateShortcutGuards({ key: 'Enter', repeat: false, target: textInput }, { paused: false }, dialogRoot).reason,
    'dialog_open'
  );

  const unknownRoot = makeMockRoot({ textContent: 'Random page' });
  assert.equal(
    helpers.evaluateShortcutGuards({ key: 'y', repeat: false }, { paused: false }, unknownRoot).reason,
    'unrecognized_step'
  );
});

test('findActionControl enforces step gating, ambiguity guard, and matches Done on Step 3/4', () => {
  const yesBtn = makeButton({ text: 'Yes' });
  const nextDisabled = makeButton({ text: 'NEXT', disabled: true });
  const attachBtn = makeButton({ text: '✓ ATTACH' });
  const detachBtn = makeButton({ text: '× DETACH' });
  const nextEnabled = makeButton({ text: 'NEXT', disabled: false });
  const nextDuplicate = makeButton({ text: 'NEXT', disabled: false });
  const doneBtn = makeButton({ text: 'Done', disabled: false });

  const step1Root = makeMockRoot({ buttons: [yesBtn, nextDisabled, attachBtn, detachBtn, doneBtn] });
  assert.equal(helpers.findActionControl(step1Root, 'yes', 'step1'), yesBtn);
  assert.equal(helpers.findActionControl(step1Root, 'next', 'step1'), null);
  assert.equal(helpers.findActionControl(step1Root, 'attach', 'step1'), null);
  assert.equal(helpers.findActionControl(step1Root, 'detach', 'step1'), null);

  const step2Root = makeMockRoot({ buttons: [yesBtn, attachBtn, detachBtn, nextEnabled, doneBtn] });
  assert.equal(helpers.findActionControl(step2Root, 'yes', 'step2'), null);
  assert.equal(helpers.findActionControl(step2Root, 'attach', 'step2'), attachBtn);
  assert.equal(helpers.findActionControl(step2Root, 'detach', 'step2'), detachBtn);
  assert.equal(helpers.findActionControl(step2Root, 'next', 'step2'), nextEnabled);

  const step3Root = makeMockRoot({ buttons: [nextEnabled, doneBtn] });
  assert.equal(helpers.findActionControl(step3Root, 'next', 'step3'), nextEnabled);

  const step4DoneOnlyRoot = makeMockRoot({ buttons: [doneBtn] });
  assert.equal(helpers.findActionControl(step4DoneOnlyRoot, 'next', 'step4'), doneBtn);

  const ambiguousRoot = makeMockRoot({ buttons: [nextEnabled, nextDuplicate] });
  assert.equal(helpers.findActionControl(ambiguousRoot, 'next', 'step2'), null);

  // Deduplicates nested [role="button"] wrapper around <button>
  const innerDetach = makeButton({ text: '× DETACH' });
  const outerWrapper = makeButton({ text: '× DETACH' });
  outerWrapper.contains = (child) => child === innerDetach;
  const nestedRoot = makeMockRoot({ buttons: [outerWrapper, innerDetach] });
  assert.equal(helpers.findActionControl(nestedRoot, 'detach', 'step2'), innerDetach);

  // Matches "Detach highlight", icon ligature prefix "close DETACH", or "x DETACH"
  const closeDetachBtn = makeButton({ text: 'close DETACH' });
  assert.equal(helpers.findActionControl(makeMockRoot({ buttons: [closeDetachBtn] }), 'detach', 'step2'), closeDetachBtn);

  const xDetachBtn = makeButton({ text: 'x DETACH' });
  assert.equal(helpers.findActionControl(makeMockRoot({ buttons: [xDetachBtn] }), 'detach', 'step2'), xDetachBtn);
});

test('classifySelectionBoxState distinguishes ready word box from resizing and live ambiguous DOM', () => {
  const readyNode = {
    hidden: false,
    getAttribute: (a) => (a === 'data-fs-ready-word-box' ? 'true' : null),
    getBoundingClientRect: () => ({ width: 50, height: 20 }),
    matchesSelector: (s) => s.includes('data-fs-ready-word-box')
  };
  const resizingNode = {
    hidden: false,
    getAttribute: (a) => (a === 'data-fs-selection-state' ? 'resizing' : null),
    getBoundingClientRect: () => ({ width: 50, height: 20 }),
    matchesSelector: (s) => s.includes('data-fs-selection-state')
  };

  assert.equal(
    helpers.classifySelectionBoxState(makeMockRoot({ selectionNodes: [readyNode] }), { pointerDown: false }),
    'ready_word_box'
  );
  assert.equal(
    helpers.classifySelectionBoxState(makeMockRoot({ selectionNodes: [readyNode] }), { pointerDown: true }),
    'drawing_or_resizing'
  );
  assert.equal(
    helpers.classifySelectionBoxState(makeMockRoot({ selectionNodes: [resizingNode] }), { pointerDown: false }),
    'drawing_or_resizing'
  );
  assert.equal(
    helpers.classifySelectionBoxState(makeMockRoot({ selectionNodes: [] }), { pointerDown: false }),
    'ambiguous'
  );
});
