/**
 * Keyboard event construction utilities.
 */

import {
  getKeyDefinition,
  getKeyDefinitionWithShift,
  parseKeyCombination,
  Modifiers,
  type KeyDefinition,
} from './keys.js';
import { isEditable } from '../dom/utils.js';

/**
 * Platform type for smart modifier resolution.
 */
export type Platform = 'mac' | 'windows' | 'linux';

/**
 * Detect current platform from navigator or environment.
 */
export function detectPlatform(): Platform {
  if (typeof navigator !== 'undefined') {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('mac')) return 'mac';
    if (platform.includes('win')) return 'windows';
  }
  // Check Node.js environment (with type guard to avoid TS errors)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeProcess = typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined;
  if (nodeProcess?.platform) {
    if (nodeProcess.platform === 'darwin') return 'mac';
    if (nodeProcess.platform === 'win32') return 'windows';
  }
  return 'linux';
}

/**
 * Smart modifier that resolves differently per platform.
 * ControlOrMeta/CmdOrCtrl -> Meta on Mac, Control elsewhere.
 */
export type SmartModifier = Modifier | 'ControlOrMeta' | 'CmdOrCtrl';

/**
 * Resolve a smart modifier to an actual modifier based on platform.
 */
export function resolveSmartModifier(
  modifier: SmartModifier,
  platform?: Platform
): Modifier {
  const p = platform ?? detectPlatform();

  switch (modifier) {
    case 'ControlOrMeta':
    case 'CmdOrCtrl':
      return p === 'mac' ? 'Meta' : 'Control';
    default:
      return modifier;
  }
}

/**
 * Parse key combination with smart modifier support.
 * Examples: "ControlOrMeta+A", "CmdOrCtrl+C"
 */
export function parseKeyCombinationSmart(
  combo: string,
  platform?: Platform
): {
  modifiers: number;
  key: KeyDefinition | null;
} {
  const parts = combo.split('+');
  let modifiers = Modifiers.None;
  let mainKey: string | null = null;

  for (const part of parts) {
    const normalized = part.trim();
    const lower = normalized.toLowerCase();

    // Handle smart modifiers
    if (lower === 'controlormeta' || lower === 'cmdorctrl') {
      const resolved = resolveSmartModifier('ControlOrMeta', platform);
      modifiers |= Modifiers[resolved];
      continue;
    }

    // Handle regular modifiers
    switch (lower) {
      case 'control':
      case 'ctrl':
        modifiers |= Modifiers.Control;
        break;
      case 'shift':
        modifiers |= Modifiers.Shift;
        break;
      case 'alt':
      case 'option':
        modifiers |= Modifiers.Alt;
        break;
      case 'meta':
      case 'command':
      case 'cmd':
        modifiers |= Modifiers.Meta;
        break;
      default:
        mainKey = normalized;
    }
  }

  return {
    modifiers,
    key: mainKey ? getKeyDefinition(mainKey) : null,
  };
}

export interface KeyboardEventOptions {
  modifiers?: number;
}

/**
 * Modifier key type
 */
export type Modifier = 'Alt' | 'Control' | 'Meta' | 'Shift';

/**
 * Options for type operation
 */
export interface TypeOptions {
  delay?: number; // Delay between characters in ms
}

/**
 * Keyboard event init data returned by state methods
 */
export interface KeyboardEventData {
  key: string;
  code: string;
  keyCode: number;
  location: number;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

const MODIFIER_KEYS: Modifier[] = ['Alt', 'Control', 'Meta', 'Shift'];

/**
 * Stateful keyboard that tracks pressed keys and modifiers.
 * Ports Playwright's keyboard state management pattern.
 */
export class KeyboardState {
  private pressedModifiers = new Set<Modifier>();
  private pressedKeys = new Set<string>();
  private platform: Platform;

  constructor(platform?: Platform) {
    this.platform = platform ?? detectPlatform();
  }

  /**
   * Get the platform this keyboard is configured for.
   */
  getPlatform(): Platform {
    return this.platform;
  }

  /**
   * Press a key down. Returns the keyboard event data.
   * Tracks the key as pressed to prevent auto-repeat issues.
   */
  down(key: string): KeyboardEventData {
    const keyDef = this.getKeyDefinition(key);
    const code = keyDef.code || key;
    const autoRepeat = this.pressedKeys.has(code);
    this.pressedKeys.add(code);

    // Track modifier state
    if (MODIFIER_KEYS.includes(keyDef.key as Modifier)) {
      this.pressedModifiers.add(keyDef.key as Modifier);
    }

    return this.createEventData(keyDef, autoRepeat);
  }

  /**
   * Release a key. Returns the keyboard event data.
   * Removes key from pressed set.
   */
  up(key: string): KeyboardEventData {
    const keyDef = this.getKeyDefinition(key);
    const code = keyDef.code || key;
    this.pressedKeys.delete(code);

    // Update modifier state
    if (MODIFIER_KEYS.includes(keyDef.key as Modifier)) {
      this.pressedModifiers.delete(keyDef.key as Modifier);
    }

    return this.createEventData(keyDef, false);
  }

  /**
   * Press and release a key. Returns both events.
   * Handles key combinations like "Control+A".
   */
  press(key: string): { down: KeyboardEventData; up: KeyboardEventData } {
    const tokens = this.splitKeyCombination(key);
    const mainKey = tokens[tokens.length - 1];

    // Press modifier keys first
    for (let i = 0; i < tokens.length - 1; i++) {
      this.down(tokens[i]);
    }

    // Press main key
    const downEvent = this.down(mainKey);
    const upEvent = this.up(mainKey);

    // Release modifier keys in reverse order
    for (let i = tokens.length - 2; i >= 0; i--) {
      this.up(tokens[i]);
    }

    return { down: downEvent, up: upEvent };
  }

  /**
   * Press a key combination with smart modifier support.
   * Resolves ControlOrMeta/CmdOrCtrl based on platform.
   * Examples: "ControlOrMeta+A", "CmdOrCtrl+C"
   */
  pressSmart(combo: string): { down: KeyboardEventData; up: KeyboardEventData } {
    const { modifiers, key } = parseKeyCombinationSmart(combo, this.platform);

    if (!key) {
      throw new Error(`Invalid key combination: ${combo}`);
    }

    // Build the resolved key combination
    const modifierNames: string[] = [];
    if (modifiers & Modifiers.Control) modifierNames.push('Control');
    if (modifiers & Modifiers.Shift) modifierNames.push('Shift');
    if (modifiers & Modifiers.Alt) modifierNames.push('Alt');
    if (modifiers & Modifiers.Meta) modifierNames.push('Meta');

    const resolvedCombo =
      modifierNames.length > 0
        ? `${modifierNames.join('+')}+${key.key}`
        : key.key;

    return this.press(resolvedCombo);
  }

  /**
   * Press a key with shift applied if needed.
   * Used when typing characters that require shift.
   */
  downWithShift(key: string): KeyboardEventData {
    const shiftPressed = this.pressedModifiers.has('Shift');
    const keyDef = getKeyDefinitionWithShift(key, shiftPressed);

    if (!keyDef) {
      return this.down(key);
    }

    const code = keyDef.code || key;
    const autoRepeat = this.pressedKeys.has(code);
    this.pressedKeys.add(code);

    // Track modifier state
    if (MODIFIER_KEYS.includes(keyDef.key as Modifier)) {
      this.pressedModifiers.add(keyDef.key as Modifier);
    }

    return this.createEventData(keyDef, autoRepeat);
  }

  /**
   * Check if a key is currently pressed.
   */
  isPressed(key: string): boolean {
    const keyDef = this.getKeyDefinition(key);
    const code = keyDef.code || key;
    return this.pressedKeys.has(code);
  }

  /**
   * Check if a modifier is currently active.
   */
  isModifierPressed(modifier: Modifier): boolean {
    return this.pressedModifiers.has(modifier);
  }

  /**
   * Get the current modifier mask (bitfield).
   * Alt: 1, Control: 2, Meta: 4, Shift: 8
   */
  getModifierMask(): number {
    let mask = 0;
    if (this.pressedModifiers.has('Alt')) mask |= Modifiers.Alt;
    if (this.pressedModifiers.has('Control')) mask |= Modifiers.Control;
    if (this.pressedModifiers.has('Meta')) mask |= Modifiers.Meta;
    if (this.pressedModifiers.has('Shift')) mask |= Modifiers.Shift;
    return mask;
  }

  /**
   * Ensure specific modifiers are pressed, pressing/releasing as needed.
   * Returns the modifiers that were actually changed.
   */
  ensureModifiers(required: Modifier[]): { pressed: Modifier[]; released: Modifier[] } {
    const pressed: Modifier[] = [];
    const released: Modifier[] = [];

    for (const modifier of MODIFIER_KEYS) {
      const needDown = required.includes(modifier);
      const isDown = this.pressedModifiers.has(modifier);

      if (needDown && !isDown) {
        this.down(modifier);
        pressed.push(modifier);
      } else if (!needDown && isDown) {
        this.up(modifier);
        released.push(modifier);
      }
    }

    return { pressed, released };
  }

  /**
   * Get the set of currently pressed modifiers.
   */
  getModifiers(): Set<Modifier> {
    return new Set(this.pressedModifiers);
  }

  /**
   * Get the set of currently pressed keys (by code).
   */
  getPressedKeys(): Set<string> {
    return new Set(this.pressedKeys);
  }

  /**
   * Reset all state (release all keys and modifiers).
   */
  reset(): void {
    this.pressedModifiers.clear();
    this.pressedKeys.clear();
  }

  /**
   * Get key definition for a key string.
   * Handles shifted keys based on current modifier state.
   */
  private getKeyDefinition(key: string): KeyDefinition {
    const keyDef = getKeyDefinition(key);
    if (!keyDef) {
      // Return a minimal definition for unknown keys
      return {
        key,
        code: '',
        keyCode: key.charCodeAt(0),
        text: key.length === 1 ? key : undefined,
      };
    }
    return keyDef;
  }

  /**
   * Create keyboard event data from key definition.
   */
  private createEventData(keyDef: KeyDefinition, repeat: boolean): KeyboardEventData {
    return {
      key: keyDef.key,
      code: keyDef.code,
      keyCode: keyDef.keyCode,
      location: keyDef.location || 0,
      ctrlKey: this.pressedModifiers.has('Control'),
      altKey: this.pressedModifiers.has('Alt'),
      shiftKey: this.pressedModifiers.has('Shift'),
      metaKey: this.pressedModifiers.has('Meta'),
      repeat,
    };
  }

  /**
   * Split a key combination string like "Control+Shift+A" into parts.
   */
  private splitKeyCombination(keyString: string): string[] {
    const keys: string[] = [];
    let building = '';

    for (const char of keyString) {
      if (char === '+' && building) {
        keys.push(building);
        building = '';
      } else {
        building += char;
      }
    }
    keys.push(building);
    return keys;
  }
}

/**
 * Create a keyboard event.
 */
export function createKeyboardEvent(
  type: string,
  keyDef: KeyDefinition,
  options: KeyboardEventOptions = {}
): KeyboardEvent {
  const modifiers = options.modifiers || 0;

  return new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    key: keyDef.key,
    code: keyDef.code,
    keyCode: keyDef.keyCode,
    which: keyDef.keyCode,
    location: keyDef.location || 0,
    ctrlKey: (modifiers & Modifiers.Control) !== 0,
    altKey: (modifiers & Modifiers.Alt) !== 0,
    shiftKey: (modifiers & Modifiers.Shift) !== 0,
    metaKey: (modifiers & Modifiers.Meta) !== 0,
    repeat: false,
    isComposing: false,
  });
}

/**
 * Dispatch a key press (keydown, keypress if printable, keyup).
 */
export function dispatchKeyPress(
  element: Element,
  key: string,
  options: KeyboardEventOptions = {}
): boolean {
  const keyDef = getKeyDefinition(key);
  if (!keyDef) return false;

  const keydown = createKeyboardEvent('keydown', keyDef, options);
  element.dispatchEvent(keydown);

  // Dispatch keypress for printable characters (deprecated but still used)
  if (keyDef.text && keyDef.text.length === 1) {
    const keypress = createKeyboardEvent('keypress', keyDef, options);
    element.dispatchEvent(keypress);
  }

  const keyup = createKeyboardEvent('keyup', keyDef, options);
  element.dispatchEvent(keyup);

  return true;
}

/**
 * Dispatch a key combination like "Control+A".
 */
export function dispatchKeyCombination(
  element: Element,
  combo: string
): boolean {
  const { modifiers, key } = parseKeyCombination(combo);
  if (!key) return false;

  return dispatchKeyPress(element, key.key, { modifiers });
}

/**
 * Type text into an element character by character.
 */
export function typeText(
  element: Element,
  text: string,
  options: { delay?: number } = {}
): void {
  // Focus the element first
  if (element instanceof HTMLElement) {
    element.focus();
  }

  for (const char of text) {
    const keyDef = getKeyDefinition(char);
    if (!keyDef) continue;

    // Dispatch keydown and keypress
    dispatchKeyPress(element, char);

    // If it's an input, insert the character
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      insertTextAtCursor(element, char);
    } else if (element.getAttribute('contenteditable') === 'true') {
      insertTextAtCursor(element, char);
    }
  }
}

/**
 * Insert text at the cursor position in an input or contenteditable.
 */
export function insertTextAtCursor(element: Element, text: string): void {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? element.value.length;
    const before = element.value.slice(0, start);
    const after = element.value.slice(end);

    element.value = before + text + after;
    element.selectionStart = element.selectionEnd = start + text.length;

    // Trigger input event
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (element.getAttribute('contenteditable') === 'true') {
    // For contenteditable, use execCommand or insert at selection
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    // Trigger input event
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/**
 * Clear the text content of an input element.
 */
export function clearElement(element: Element): void {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (element.getAttribute('contenteditable') === 'true') {
    element.textContent = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/**
 * Fill an element with text (clear + type).
 */
export function fillElement(element: Element, text: string): void {
  if (!isEditable(element)) return;

  // Focus the element
  if (element instanceof HTMLElement) {
    element.focus();
  }

  // Clear existing content
  clearElement(element);

  // Set the value directly (faster than typing character by character)
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (element.getAttribute('contenteditable') === 'true') {
    element.textContent = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/**
 * Select all text in an element.
 */
export function selectAll(element: Element): void {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.select();
  } else if (element.getAttribute('contenteditable') === 'true') {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
}

/**
 * Focus an element.
 */
export function focusElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;

  element.focus();
  return document.activeElement === element;
}

/**
 * Blur an element.
 */
export function blurElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;

  element.blur();
  return document.activeElement !== element;
}
