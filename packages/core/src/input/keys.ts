/**
 * Key code definitions for keyboard input.
 */

export interface KeyDefinition {
  key: string;
  code: string;
  keyCode: number;
  text?: string;
  location?: number;
  // Shifted variants (Playwright-style)
  shiftKey?: string; // The key when Shift is pressed (e.g., '!' for '1')
  shiftKeyCode?: number; // The keyCode when shifted
  shiftText?: string; // The text when shifted
}

/**
 * Modifier key flags
 */
export const Modifiers = {
  None: 0,
  Alt: 1,
  Control: 2,
  Meta: 4,
  Shift: 8,
} as const;

/**
 * Key definitions for common keys.
 */
export const Keys: Record<string, KeyDefinition> = {
  // Special keys
  Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9, text: '\t' },
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  Shift: { key: 'Shift', code: 'ShiftLeft', keyCode: 16, location: 1 },
  ShiftLeft: { key: 'Shift', code: 'ShiftLeft', keyCode: 16, location: 1 },
  ShiftRight: { key: 'Shift', code: 'ShiftRight', keyCode: 16, location: 2 },
  Control: { key: 'Control', code: 'ControlLeft', keyCode: 17, location: 1 },
  ControlLeft: { key: 'Control', code: 'ControlLeft', keyCode: 17, location: 1 },
  ControlRight: { key: 'Control', code: 'ControlRight', keyCode: 17, location: 2 },
  Alt: { key: 'Alt', code: 'AltLeft', keyCode: 18, location: 1 },
  AltLeft: { key: 'Alt', code: 'AltLeft', keyCode: 18, location: 1 },
  AltRight: { key: 'Alt', code: 'AltRight', keyCode: 18, location: 2 },
  Pause: { key: 'Pause', code: 'Pause', keyCode: 19 },
  CapsLock: { key: 'CapsLock', code: 'CapsLock', keyCode: 20 },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  PageUp: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  PageDown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  End: { key: 'End', code: 'End', keyCode: 35 },
  Home: { key: 'Home', code: 'Home', keyCode: 36 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  Insert: { key: 'Insert', code: 'Insert', keyCode: 45 },
  Delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  Meta: { key: 'Meta', code: 'MetaLeft', keyCode: 91, location: 1 },
  MetaLeft: { key: 'Meta', code: 'MetaLeft', keyCode: 91, location: 1 },
  MetaRight: { key: 'Meta', code: 'MetaRight', keyCode: 93, location: 2 },

  // Function keys
  F1: { key: 'F1', code: 'F1', keyCode: 112 },
  F2: { key: 'F2', code: 'F2', keyCode: 113 },
  F3: { key: 'F3', code: 'F3', keyCode: 114 },
  F4: { key: 'F4', code: 'F4', keyCode: 115 },
  F5: { key: 'F5', code: 'F5', keyCode: 116 },
  F6: { key: 'F6', code: 'F6', keyCode: 117 },
  F7: { key: 'F7', code: 'F7', keyCode: 118 },
  F8: { key: 'F8', code: 'F8', keyCode: 119 },
  F9: { key: 'F9', code: 'F9', keyCode: 120 },
  F10: { key: 'F10', code: 'F10', keyCode: 121 },
  F11: { key: 'F11', code: 'F11', keyCode: 122 },
  F12: { key: 'F12', code: 'F12', keyCode: 123 },

  // Number keys (top row) with shifted symbols
  Digit0: { key: '0', code: 'Digit0', keyCode: 48, text: '0', shiftKey: ')', shiftText: ')' },
  Digit1: { key: '1', code: 'Digit1', keyCode: 49, text: '1', shiftKey: '!', shiftText: '!' },
  Digit2: { key: '2', code: 'Digit2', keyCode: 50, text: '2', shiftKey: '@', shiftText: '@' },
  Digit3: { key: '3', code: 'Digit3', keyCode: 51, text: '3', shiftKey: '#', shiftText: '#' },
  Digit4: { key: '4', code: 'Digit4', keyCode: 52, text: '4', shiftKey: '$', shiftText: '$' },
  Digit5: { key: '5', code: 'Digit5', keyCode: 53, text: '5', shiftKey: '%', shiftText: '%' },
  Digit6: { key: '6', code: 'Digit6', keyCode: 54, text: '6', shiftKey: '^', shiftText: '^' },
  Digit7: { key: '7', code: 'Digit7', keyCode: 55, text: '7', shiftKey: '&', shiftText: '&' },
  Digit8: { key: '8', code: 'Digit8', keyCode: 56, text: '8', shiftKey: '*', shiftText: '*' },
  Digit9: { key: '9', code: 'Digit9', keyCode: 57, text: '9', shiftKey: '(', shiftText: '(' },

  // Letter keys with shifted (uppercase) variants
  KeyA: { key: 'a', code: 'KeyA', keyCode: 65, text: 'a', shiftKey: 'A', shiftText: 'A' },
  KeyB: { key: 'b', code: 'KeyB', keyCode: 66, text: 'b', shiftKey: 'B', shiftText: 'B' },
  KeyC: { key: 'c', code: 'KeyC', keyCode: 67, text: 'c', shiftKey: 'C', shiftText: 'C' },
  KeyD: { key: 'd', code: 'KeyD', keyCode: 68, text: 'd', shiftKey: 'D', shiftText: 'D' },
  KeyE: { key: 'e', code: 'KeyE', keyCode: 69, text: 'e', shiftKey: 'E', shiftText: 'E' },
  KeyF: { key: 'f', code: 'KeyF', keyCode: 70, text: 'f', shiftKey: 'F', shiftText: 'F' },
  KeyG: { key: 'g', code: 'KeyG', keyCode: 71, text: 'g', shiftKey: 'G', shiftText: 'G' },
  KeyH: { key: 'h', code: 'KeyH', keyCode: 72, text: 'h', shiftKey: 'H', shiftText: 'H' },
  KeyI: { key: 'i', code: 'KeyI', keyCode: 73, text: 'i', shiftKey: 'I', shiftText: 'I' },
  KeyJ: { key: 'j', code: 'KeyJ', keyCode: 74, text: 'j', shiftKey: 'J', shiftText: 'J' },
  KeyK: { key: 'k', code: 'KeyK', keyCode: 75, text: 'k', shiftKey: 'K', shiftText: 'K' },
  KeyL: { key: 'l', code: 'KeyL', keyCode: 76, text: 'l', shiftKey: 'L', shiftText: 'L' },
  KeyM: { key: 'm', code: 'KeyM', keyCode: 77, text: 'm', shiftKey: 'M', shiftText: 'M' },
  KeyN: { key: 'n', code: 'KeyN', keyCode: 78, text: 'n', shiftKey: 'N', shiftText: 'N' },
  KeyO: { key: 'o', code: 'KeyO', keyCode: 79, text: 'o', shiftKey: 'O', shiftText: 'O' },
  KeyP: { key: 'p', code: 'KeyP', keyCode: 80, text: 'p', shiftKey: 'P', shiftText: 'P' },
  KeyQ: { key: 'q', code: 'KeyQ', keyCode: 81, text: 'q', shiftKey: 'Q', shiftText: 'Q' },
  KeyR: { key: 'r', code: 'KeyR', keyCode: 82, text: 'r', shiftKey: 'R', shiftText: 'R' },
  KeyS: { key: 's', code: 'KeyS', keyCode: 83, text: 's', shiftKey: 'S', shiftText: 'S' },
  KeyT: { key: 't', code: 'KeyT', keyCode: 84, text: 't', shiftKey: 'T', shiftText: 'T' },
  KeyU: { key: 'u', code: 'KeyU', keyCode: 85, text: 'u', shiftKey: 'U', shiftText: 'U' },
  KeyV: { key: 'v', code: 'KeyV', keyCode: 86, text: 'v', shiftKey: 'V', shiftText: 'V' },
  KeyW: { key: 'w', code: 'KeyW', keyCode: 87, text: 'w', shiftKey: 'W', shiftText: 'W' },
  KeyX: { key: 'x', code: 'KeyX', keyCode: 88, text: 'x', shiftKey: 'X', shiftText: 'X' },
  KeyY: { key: 'y', code: 'KeyY', keyCode: 89, text: 'y', shiftKey: 'Y', shiftText: 'Y' },
  KeyZ: { key: 'z', code: 'KeyZ', keyCode: 90, text: 'z', shiftKey: 'Z', shiftText: 'Z' },

  // Punctuation with shifted symbols
  Semicolon: { key: ';', code: 'Semicolon', keyCode: 186, text: ';', shiftKey: ':', shiftText: ':' },
  Equal: { key: '=', code: 'Equal', keyCode: 187, text: '=', shiftKey: '+', shiftText: '+' },
  Comma: { key: ',', code: 'Comma', keyCode: 188, text: ',', shiftKey: '<', shiftText: '<' },
  Minus: { key: '-', code: 'Minus', keyCode: 189, text: '-', shiftKey: '_', shiftText: '_' },
  Period: { key: '.', code: 'Period', keyCode: 190, text: '.', shiftKey: '>', shiftText: '>' },
  Slash: { key: '/', code: 'Slash', keyCode: 191, text: '/', shiftKey: '?', shiftText: '?' },
  Backquote: { key: '`', code: 'Backquote', keyCode: 192, text: '`', shiftKey: '~', shiftText: '~' },
  BracketLeft: { key: '[', code: 'BracketLeft', keyCode: 219, text: '[', shiftKey: '{', shiftText: '{' },
  Backslash: { key: '\\', code: 'Backslash', keyCode: 220, text: '\\', shiftKey: '|', shiftText: '|' },
  BracketRight: { key: ']', code: 'BracketRight', keyCode: 221, text: ']', shiftKey: '}', shiftText: '}' },
  Quote: { key: "'", code: 'Quote', keyCode: 222, text: "'", shiftKey: '"', shiftText: '"' },

  // Numpad keys
  NumLock: { key: 'NumLock', code: 'NumLock', keyCode: 144 },
  Numpad0: { key: '0', code: 'Numpad0', keyCode: 96, text: '0', location: 3 },
  Numpad1: { key: '1', code: 'Numpad1', keyCode: 97, text: '1', location: 3 },
  Numpad2: { key: '2', code: 'Numpad2', keyCode: 98, text: '2', location: 3 },
  Numpad3: { key: '3', code: 'Numpad3', keyCode: 99, text: '3', location: 3 },
  Numpad4: { key: '4', code: 'Numpad4', keyCode: 100, text: '4', location: 3 },
  Numpad5: { key: '5', code: 'Numpad5', keyCode: 101, text: '5', location: 3 },
  Numpad6: { key: '6', code: 'Numpad6', keyCode: 102, text: '6', location: 3 },
  Numpad7: { key: '7', code: 'Numpad7', keyCode: 103, text: '7', location: 3 },
  Numpad8: { key: '8', code: 'Numpad8', keyCode: 104, text: '8', location: 3 },
  Numpad9: { key: '9', code: 'Numpad9', keyCode: 105, text: '9', location: 3 },
  NumpadMultiply: { key: '*', code: 'NumpadMultiply', keyCode: 106, text: '*', location: 3 },
  NumpadAdd: { key: '+', code: 'NumpadAdd', keyCode: 107, text: '+', location: 3 },
  NumpadSubtract: { key: '-', code: 'NumpadSubtract', keyCode: 109, text: '-', location: 3 },
  NumpadDecimal: { key: '.', code: 'NumpadDecimal', keyCode: 110, text: '.', location: 3 },
  NumpadDivide: { key: '/', code: 'NumpadDivide', keyCode: 111, text: '/', location: 3 },
  NumpadEnter: { key: 'Enter', code: 'NumpadEnter', keyCode: 13, text: '\r', location: 3 },
  NumpadEqual: { key: '=', code: 'NumpadEqual', keyCode: 187, text: '=', location: 3 },

  // Media keys
  MediaPlayPause: { key: 'MediaPlayPause', code: 'MediaPlayPause', keyCode: 179 },
  MediaStop: { key: 'MediaStop', code: 'MediaStop', keyCode: 178 },
  MediaTrackNext: { key: 'MediaTrackNext', code: 'MediaTrackNext', keyCode: 176 },
  MediaTrackPrevious: { key: 'MediaTrackPrevious', code: 'MediaTrackPrevious', keyCode: 177 },
  AudioVolumeMute: { key: 'AudioVolumeMute', code: 'AudioVolumeMute', keyCode: 173 },
  AudioVolumeDown: { key: 'AudioVolumeDown', code: 'AudioVolumeDown', keyCode: 174 },
  AudioVolumeUp: { key: 'AudioVolumeUp', code: 'AudioVolumeUp', keyCode: 175 },

  // Browser keys
  BrowserBack: { key: 'BrowserBack', code: 'BrowserBack', keyCode: 166 },
  BrowserForward: { key: 'BrowserForward', code: 'BrowserForward', keyCode: 167 },
  BrowserRefresh: { key: 'BrowserRefresh', code: 'BrowserRefresh', keyCode: 168 },
  BrowserStop: { key: 'BrowserStop', code: 'BrowserStop', keyCode: 169 },
  BrowserSearch: { key: 'BrowserSearch', code: 'BrowserSearch', keyCode: 170 },
  BrowserFavorites: { key: 'BrowserFavorites', code: 'BrowserFavorites', keyCode: 171 },
  BrowserHome: { key: 'BrowserHome', code: 'BrowserHome', keyCode: 172 },

  // Additional special keys
  ScrollLock: { key: 'ScrollLock', code: 'ScrollLock', keyCode: 145 },
  PrintScreen: { key: 'PrintScreen', code: 'PrintScreen', keyCode: 44 },
  ContextMenu: { key: 'ContextMenu', code: 'ContextMenu', keyCode: 93 },
};

/**
 * Get key definition from a key name.
 * Supports both key names (Enter, Shift) and single characters.
 */
export function getKeyDefinition(key: string): KeyDefinition | null {
  // Check if it's a named key
  if (Keys[key]) {
    return Keys[key];
  }

  // Check if it's a single character
  if (key.length === 1) {
    const code = key.charCodeAt(0);

    // Letters
    if (code >= 97 && code <= 122) {
      return { key, code: `Key${key.toUpperCase()}`, keyCode: code - 32, text: key };
    }
    if (code >= 65 && code <= 90) {
      return { key, code: `Key${key}`, keyCode: code, text: key };
    }

    // Numbers
    if (code >= 48 && code <= 57) {
      return { key, code: `Digit${key}`, keyCode: code, text: key };
    }

    // Space
    if (key === ' ') {
      return Keys.Space;
    }

    // Return a generic definition for other characters
    return { key, code: '', keyCode: code, text: key };
  }

  return null;
}

/**
 * Parse a key combination string like "Control+Shift+A".
 */
export function parseKeyCombination(combo: string): {
  modifiers: number;
  key: KeyDefinition | null;
} {
  const parts = combo.split('+');
  let modifiers = Modifiers.None;
  let mainKey: string | null = null;

  for (const part of parts) {
    const normalized = part.trim();
    switch (normalized.toLowerCase()) {
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

/**
 * Get key definition with shift applied if needed.
 * When shiftPressed is true and the key has a shift variant,
 * returns a modified definition with the shifted key/text.
 */
export function getKeyDefinitionWithShift(
  key: string,
  shiftPressed: boolean
): KeyDefinition | null {
  const def = getKeyDefinition(key);
  if (!def) return null;

  if (shiftPressed && def.shiftKey) {
    return {
      ...def,
      key: def.shiftKey,
      text: def.shiftText ?? def.shiftKey,
      keyCode: def.shiftKeyCode ?? def.keyCode,
    };
  }

  return def;
}

/**
 * Reverse lookup: find key definition from a character.
 * Used for typing shifted characters like '!' or 'A'.
 * Returns the base key definition and whether shift is needed.
 */
export function getKeyDefinitionFromChar(
  char: string
): { definition: KeyDefinition; needsShift: boolean } | null {
  // First check if it's a shifted version of any key
  for (const [, def] of Object.entries(Keys)) {
    if (def.shiftKey === char || def.shiftText === char) {
      return { definition: def, needsShift: true };
    }
    if (def.key === char || def.text === char) {
      return { definition: def, needsShift: false };
    }
  }

  // Handle uppercase letters dynamically (in case not in Keys)
  if (char.length === 1 && char >= 'A' && char <= 'Z') {
    const lower = char.toLowerCase();
    const def = getKeyDefinition(lower);
    if (def) {
      return {
        definition: { ...def, key: char, text: char },
        needsShift: true,
      };
    }
  }

  // Handle lowercase letters dynamically
  if (char.length === 1 && char >= 'a' && char <= 'z') {
    const def = getKeyDefinition(char);
    if (def) {
      return { definition: def, needsShift: false };
    }
  }

  // Handle numbers dynamically
  if (char.length === 1 && char >= '0' && char <= '9') {
    const def = getKeyDefinition(char);
    if (def) {
      return { definition: def, needsShift: false };
    }
  }

  return null;
}
