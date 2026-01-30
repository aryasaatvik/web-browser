/**
 * Tests for KeyboardState class.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  KeyboardState,
  type Modifier,
  detectPlatform,
  resolveSmartModifier,
  parseKeyCombinationSmart,
} from './keyboard.js';
import {
  Modifiers,
  getKeyDefinitionWithShift,
  getKeyDefinitionFromChar,
  Keys,
} from './keys.js';

describe('KeyboardState', () => {
  let keyboard: KeyboardState;

  beforeEach(() => {
    keyboard = new KeyboardState();
  });

  describe('initialization', () => {
    it('should start with no pressed keys', () => {
      expect(keyboard.getPressedKeys().size).toBe(0);
    });

    it('should start with no pressed modifiers', () => {
      expect(keyboard.getModifiers().size).toBe(0);
    });

    it('should start with modifier mask of 0', () => {
      expect(keyboard.getModifierMask()).toBe(0);
    });
  });

  describe('down()', () => {
    it('should track key as pressed', () => {
      keyboard.down('a');
      expect(keyboard.isPressed('a')).toBe(true);
    });

    it('should return correct event data', () => {
      const event = keyboard.down('a');
      expect(event.key).toBe('a');
      expect(event.code).toBe('KeyA');
      expect(event.keyCode).toBe(65);
      expect(event.repeat).toBe(false);
    });

    it('should return repeat=true for already pressed key', () => {
      keyboard.down('a');
      const event = keyboard.down('a');
      expect(event.repeat).toBe(true);
    });

    it('should track modifier key as modifier', () => {
      keyboard.down('Shift');
      expect(keyboard.isModifierPressed('Shift')).toBe(true);
    });

    it('should include modifier state in event data', () => {
      keyboard.down('Shift');
      const event = keyboard.down('a');
      expect(event.shiftKey).toBe(true);
    });
  });

  describe('up()', () => {
    it('should remove key from pressed set', () => {
      keyboard.down('a');
      expect(keyboard.isPressed('a')).toBe(true);
      keyboard.up('a');
      expect(keyboard.isPressed('a')).toBe(false);
    });

    it('should return correct event data', () => {
      keyboard.down('a');
      const event = keyboard.up('a');
      expect(event.key).toBe('a');
      expect(event.code).toBe('KeyA');
      expect(event.repeat).toBe(false);
    });

    it('should remove modifier from modifiers set', () => {
      keyboard.down('Control');
      expect(keyboard.isModifierPressed('Control')).toBe(true);
      keyboard.up('Control');
      expect(keyboard.isModifierPressed('Control')).toBe(false);
    });
  });

  describe('press()', () => {
    it('should return both down and up events', () => {
      const { down, up } = keyboard.press('a');
      expect(down.key).toBe('a');
      expect(up.key).toBe('a');
    });

    it('should not leave key pressed after press', () => {
      keyboard.press('a');
      expect(keyboard.isPressed('a')).toBe(false);
    });

    it('should handle key combinations like Control+A', () => {
      const { down, up } = keyboard.press('Control+a');
      expect(down.ctrlKey).toBe(true);
      expect(down.key).toBe('a');
    });

    it('should release modifiers after key combination', () => {
      keyboard.press('Control+Shift+a');
      expect(keyboard.isModifierPressed('Control')).toBe(false);
      expect(keyboard.isModifierPressed('Shift')).toBe(false);
    });
  });

  describe('isPressed()', () => {
    it('should return false for unpressed key', () => {
      expect(keyboard.isPressed('a')).toBe(false);
    });

    it('should return true for pressed key', () => {
      keyboard.down('a');
      expect(keyboard.isPressed('a')).toBe(true);
    });

    it('should track multiple keys', () => {
      keyboard.down('a');
      keyboard.down('b');
      expect(keyboard.isPressed('a')).toBe(true);
      expect(keyboard.isPressed('b')).toBe(true);
      keyboard.up('a');
      expect(keyboard.isPressed('a')).toBe(false);
      expect(keyboard.isPressed('b')).toBe(true);
    });
  });

  describe('isModifierPressed()', () => {
    it('should return false for unpressed modifier', () => {
      expect(keyboard.isModifierPressed('Shift')).toBe(false);
    });

    it('should return true for pressed modifier', () => {
      keyboard.down('Shift');
      expect(keyboard.isModifierPressed('Shift')).toBe(true);
    });

    it('should track all modifier types', () => {
      const modifiers: Modifier[] = ['Alt', 'Control', 'Meta', 'Shift'];
      for (const mod of modifiers) {
        keyboard.down(mod);
        expect(keyboard.isModifierPressed(mod)).toBe(true);
      }
    });
  });

  describe('getModifierMask()', () => {
    it('should return 0 with no modifiers', () => {
      expect(keyboard.getModifierMask()).toBe(0);
    });

    it('should return correct mask for Alt', () => {
      keyboard.down('Alt');
      expect(keyboard.getModifierMask()).toBe(Modifiers.Alt);
    });

    it('should return correct mask for Control', () => {
      keyboard.down('Control');
      expect(keyboard.getModifierMask()).toBe(Modifiers.Control);
    });

    it('should return correct mask for Meta', () => {
      keyboard.down('Meta');
      expect(keyboard.getModifierMask()).toBe(Modifiers.Meta);
    });

    it('should return correct mask for Shift', () => {
      keyboard.down('Shift');
      expect(keyboard.getModifierMask()).toBe(Modifiers.Shift);
    });

    it('should combine multiple modifiers', () => {
      keyboard.down('Control');
      keyboard.down('Shift');
      expect(keyboard.getModifierMask()).toBe(Modifiers.Control | Modifiers.Shift);
    });

    it('should return correct mask for all modifiers', () => {
      keyboard.down('Alt');
      keyboard.down('Control');
      keyboard.down('Meta');
      keyboard.down('Shift');
      expect(keyboard.getModifierMask()).toBe(
        Modifiers.Alt | Modifiers.Control | Modifiers.Meta | Modifiers.Shift
      );
    });
  });

  describe('ensureModifiers()', () => {
    it('should press missing modifiers', () => {
      const result = keyboard.ensureModifiers(['Shift', 'Control']);
      expect(result.pressed).toContain('Shift');
      expect(result.pressed).toContain('Control');
      expect(result.released).toHaveLength(0);
      expect(keyboard.isModifierPressed('Shift')).toBe(true);
      expect(keyboard.isModifierPressed('Control')).toBe(true);
    });

    it('should release extra modifiers', () => {
      keyboard.down('Shift');
      keyboard.down('Control');
      keyboard.down('Alt');
      const result = keyboard.ensureModifiers(['Shift']);
      expect(result.pressed).toHaveLength(0);
      expect(result.released).toContain('Control');
      expect(result.released).toContain('Alt');
      expect(keyboard.isModifierPressed('Shift')).toBe(true);
      expect(keyboard.isModifierPressed('Control')).toBe(false);
      expect(keyboard.isModifierPressed('Alt')).toBe(false);
    });

    it('should not change already correct modifiers', () => {
      keyboard.down('Shift');
      const result = keyboard.ensureModifiers(['Shift']);
      expect(result.pressed).toHaveLength(0);
      expect(result.released).toHaveLength(0);
    });

    it('should handle empty required modifiers', () => {
      keyboard.down('Shift');
      const result = keyboard.ensureModifiers([]);
      expect(result.released).toContain('Shift');
      expect(keyboard.isModifierPressed('Shift')).toBe(false);
    });
  });

  describe('getModifiers()', () => {
    it('should return empty set initially', () => {
      const mods = keyboard.getModifiers();
      expect(mods.size).toBe(0);
    });

    it('should return copy of modifiers set', () => {
      keyboard.down('Shift');
      const mods = keyboard.getModifiers();
      mods.delete('Shift');
      expect(keyboard.isModifierPressed('Shift')).toBe(true);
    });
  });

  describe('getPressedKeys()', () => {
    it('should return empty set initially', () => {
      const keys = keyboard.getPressedKeys();
      expect(keys.size).toBe(0);
    });

    it('should return copy of pressed keys set', () => {
      keyboard.down('a');
      const keys = keyboard.getPressedKeys();
      keys.delete('KeyA');
      expect(keyboard.isPressed('a')).toBe(true);
    });
  });

  describe('reset()', () => {
    it('should clear all pressed keys', () => {
      keyboard.down('a');
      keyboard.down('b');
      keyboard.reset();
      expect(keyboard.getPressedKeys().size).toBe(0);
    });

    it('should clear all pressed modifiers', () => {
      keyboard.down('Shift');
      keyboard.down('Control');
      keyboard.reset();
      expect(keyboard.getModifiers().size).toBe(0);
    });

    it('should reset modifier mask to 0', () => {
      keyboard.down('Shift');
      keyboard.reset();
      expect(keyboard.getModifierMask()).toBe(0);
    });
  });

  describe('key combinations', () => {
    it('should handle Ctrl+Shift+A', () => {
      const { down } = keyboard.press('Control+Shift+a');
      expect(down.ctrlKey).toBe(true);
      expect(down.shiftKey).toBe(true);
      expect(down.key).toBe('a');
    });

    it('should release modifiers in reverse order', () => {
      keyboard.press('Control+Shift+a');
      expect(keyboard.isModifierPressed('Control')).toBe(false);
      expect(keyboard.isModifierPressed('Shift')).toBe(false);
    });

    it('should handle Meta+a (Mac command)', () => {
      const { down } = keyboard.press('Meta+a');
      expect(down.metaKey).toBe(true);
      expect(down.key).toBe('a');
    });

    it('should handle Alt+Tab', () => {
      const { down } = keyboard.press('Alt+Tab');
      expect(down.altKey).toBe(true);
      expect(down.key).toBe('Tab');
    });
  });

  describe('auto-repeat detection', () => {
    it('should detect auto-repeat on same key', () => {
      const first = keyboard.down('a');
      const second = keyboard.down('a');
      expect(first.repeat).toBe(false);
      expect(second.repeat).toBe(true);
    });

    it('should not detect repeat for different keys', () => {
      const first = keyboard.down('a');
      const second = keyboard.down('b');
      expect(first.repeat).toBe(false);
      expect(second.repeat).toBe(false);
    });

    it('should reset repeat after up', () => {
      keyboard.down('a');
      keyboard.up('a');
      const event = keyboard.down('a');
      expect(event.repeat).toBe(false);
    });
  });

  describe('special keys', () => {
    it('should handle Enter key', () => {
      const event = keyboard.down('Enter');
      expect(event.key).toBe('Enter');
      expect(event.code).toBe('Enter');
      expect(event.keyCode).toBe(13);
    });

    it('should handle Escape key', () => {
      const event = keyboard.down('Escape');
      expect(event.key).toBe('Escape');
      expect(event.code).toBe('Escape');
    });

    it('should handle arrow keys', () => {
      const left = keyboard.down('ArrowLeft');
      expect(left.key).toBe('ArrowLeft');
      keyboard.up('ArrowLeft');

      const right = keyboard.down('ArrowRight');
      expect(right.key).toBe('ArrowRight');
    });

    it('should handle function keys', () => {
      const f1 = keyboard.down('F1');
      expect(f1.key).toBe('F1');
      expect(f1.keyCode).toBe(112);
    });

    it('should handle Space key', () => {
      const event = keyboard.down('Space');
      expect(event.key).toBe(' ');
      expect(event.code).toBe('Space');
    });
  });

  describe('location property', () => {
    it('should return correct location for left Shift', () => {
      const event = keyboard.down('ShiftLeft');
      expect(event.location).toBe(1);
    });

    it('should return correct location for right Shift', () => {
      const event = keyboard.down('ShiftRight');
      expect(event.location).toBe(2);
    });

    it('should return 0 for standard keys', () => {
      const event = keyboard.down('a');
      expect(event.location).toBe(0);
    });
  });

  describe('platform support', () => {
    it('should default to detected platform', () => {
      const kb = new KeyboardState();
      expect(['mac', 'windows', 'linux']).toContain(kb.getPlatform());
    });

    it('should accept explicit platform in constructor', () => {
      const kb = new KeyboardState('mac');
      expect(kb.getPlatform()).toBe('mac');
    });

    it('should accept windows platform', () => {
      const kb = new KeyboardState('windows');
      expect(kb.getPlatform()).toBe('windows');
    });

    it('should accept linux platform', () => {
      const kb = new KeyboardState('linux');
      expect(kb.getPlatform()).toBe('linux');
    });
  });

  describe('pressSmart()', () => {
    it('should resolve ControlOrMeta to Meta on Mac', () => {
      const kb = new KeyboardState('mac');
      const { down } = kb.pressSmart('ControlOrMeta+a');
      expect(down.metaKey).toBe(true);
      expect(down.ctrlKey).toBe(false);
      expect(down.key).toBe('a');
    });

    it('should resolve ControlOrMeta to Control on Windows', () => {
      const kb = new KeyboardState('windows');
      const { down } = kb.pressSmart('ControlOrMeta+a');
      expect(down.ctrlKey).toBe(true);
      expect(down.metaKey).toBe(false);
      expect(down.key).toBe('a');
    });

    it('should resolve ControlOrMeta to Control on Linux', () => {
      const kb = new KeyboardState('linux');
      const { down } = kb.pressSmart('ControlOrMeta+a');
      expect(down.ctrlKey).toBe(true);
      expect(down.metaKey).toBe(false);
    });

    it('should resolve CmdOrCtrl to Meta on Mac', () => {
      const kb = new KeyboardState('mac');
      const { down } = kb.pressSmart('CmdOrCtrl+c');
      expect(down.metaKey).toBe(true);
      expect(down.ctrlKey).toBe(false);
      expect(down.key).toBe('c');
    });

    it('should resolve CmdOrCtrl to Control on Windows', () => {
      const kb = new KeyboardState('windows');
      const { down } = kb.pressSmart('CmdOrCtrl+v');
      expect(down.ctrlKey).toBe(true);
      expect(down.metaKey).toBe(false);
      expect(down.key).toBe('v');
    });

    it('should handle regular modifiers', () => {
      const kb = new KeyboardState('mac');
      const { down } = kb.pressSmart('Control+Shift+a');
      expect(down.ctrlKey).toBe(true);
      expect(down.shiftKey).toBe(true);
      expect(down.key).toBe('a');
    });

    it('should throw on invalid key combination', () => {
      const kb = new KeyboardState('mac');
      expect(() => kb.pressSmart('ControlOrMeta+')).toThrow();
    });
  });
});

describe('Shifted key definitions', () => {
  describe('Keys object shift variants', () => {
    it('should have shift variant for Digit1', () => {
      expect(Keys.Digit1.shiftKey).toBe('!');
      expect(Keys.Digit1.shiftText).toBe('!');
    });

    it('should have shift variant for Digit2', () => {
      expect(Keys.Digit2.shiftKey).toBe('@');
    });

    it('should have shift variant for Digit0', () => {
      expect(Keys.Digit0.shiftKey).toBe(')');
    });

    it('should have shift variant for Semicolon', () => {
      expect(Keys.Semicolon.shiftKey).toBe(':');
    });

    it('should have shift variant for Quote', () => {
      expect(Keys.Quote.shiftKey).toBe('"');
    });

    it('should have shift variant for BracketLeft', () => {
      expect(Keys.BracketLeft.shiftKey).toBe('{');
    });

    it('should have shift variant for BracketRight', () => {
      expect(Keys.BracketRight.shiftKey).toBe('}');
    });

    it('should have shift variant for letter keys', () => {
      expect(Keys.KeyA.shiftKey).toBe('A');
      expect(Keys.KeyZ.shiftKey).toBe('Z');
    });

    it('should have shift variants for all punctuation', () => {
      expect(Keys.Comma.shiftKey).toBe('<');
      expect(Keys.Period.shiftKey).toBe('>');
      expect(Keys.Slash.shiftKey).toBe('?');
      expect(Keys.Backquote.shiftKey).toBe('~');
      expect(Keys.Minus.shiftKey).toBe('_');
      expect(Keys.Equal.shiftKey).toBe('+');
      expect(Keys.Backslash.shiftKey).toBe('|');
    });
  });

  describe('getKeyDefinitionWithShift()', () => {
    it('should return shifted key when shiftPressed is true', () => {
      const def = getKeyDefinitionWithShift('Digit1', true);
      expect(def).not.toBeNull();
      expect(def!.key).toBe('!');
      expect(def!.text).toBe('!');
    });

    it('should return normal key when shiftPressed is false', () => {
      const def = getKeyDefinitionWithShift('Digit1', false);
      expect(def).not.toBeNull();
      expect(def!.key).toBe('1');
      expect(def!.text).toBe('1');
    });

    it('should handle keys without shift variants', () => {
      const def = getKeyDefinitionWithShift('Enter', true);
      expect(def).not.toBeNull();
      expect(def!.key).toBe('Enter');
    });

    it('should return null for unknown keys', () => {
      const def = getKeyDefinitionWithShift('UnknownKey', true);
      expect(def).toBeNull();
    });

    it('should handle Semicolon with shift', () => {
      const def = getKeyDefinitionWithShift('Semicolon', true);
      expect(def!.key).toBe(':');
      expect(def!.text).toBe(':');
    });

    it('should handle Quote with shift', () => {
      const def = getKeyDefinitionWithShift('Quote', true);
      expect(def!.key).toBe('"');
    });

    it('should preserve keyCode from original definition', () => {
      const def = getKeyDefinitionWithShift('Digit1', true);
      expect(def!.keyCode).toBe(49); // Same as Digit1
    });
  });

  describe('getKeyDefinitionFromChar()', () => {
    it('should find ! and return Digit1 with needsShift=true', () => {
      const result = getKeyDefinitionFromChar('!');
      expect(result).not.toBeNull();
      expect(result!.definition.code).toBe('Digit1');
      expect(result!.needsShift).toBe(true);
    });

    it('should find 1 and return Digit1 with needsShift=false', () => {
      const result = getKeyDefinitionFromChar('1');
      expect(result).not.toBeNull();
      expect(result!.definition.code).toBe('Digit1');
      expect(result!.needsShift).toBe(false);
    });

    it('should find A (uppercase) with needsShift=true', () => {
      const result = getKeyDefinitionFromChar('A');
      expect(result).not.toBeNull();
      expect(result!.needsShift).toBe(true);
    });

    it('should find a (lowercase) with needsShift=false', () => {
      const result = getKeyDefinitionFromChar('a');
      expect(result).not.toBeNull();
      expect(result!.definition.code).toBe('KeyA');
      expect(result!.needsShift).toBe(false);
    });

    it('should find @ and return Digit2 with needsShift=true', () => {
      const result = getKeyDefinitionFromChar('@');
      expect(result).not.toBeNull();
      expect(result!.definition.code).toBe('Digit2');
      expect(result!.needsShift).toBe(true);
    });

    it('should find : and return Semicolon with needsShift=true', () => {
      const result = getKeyDefinitionFromChar(':');
      expect(result).not.toBeNull();
      expect(result!.definition.code).toBe('Semicolon');
      expect(result!.needsShift).toBe(true);
    });

    it('should find " and return Quote with needsShift=true', () => {
      const result = getKeyDefinitionFromChar('"');
      expect(result).not.toBeNull();
      expect(result!.definition.code).toBe('Quote');
      expect(result!.needsShift).toBe(true);
    });

    it('should find { and return BracketLeft with needsShift=true', () => {
      const result = getKeyDefinitionFromChar('{');
      expect(result).not.toBeNull();
      expect(result!.definition.code).toBe('BracketLeft');
      expect(result!.needsShift).toBe(true);
    });

    it('should handle all number shifted symbols', () => {
      const shiftedSymbols = [
        { char: ')', code: 'Digit0' },
        { char: '!', code: 'Digit1' },
        { char: '@', code: 'Digit2' },
        { char: '#', code: 'Digit3' },
        { char: '$', code: 'Digit4' },
        { char: '%', code: 'Digit5' },
        { char: '^', code: 'Digit6' },
        { char: '&', code: 'Digit7' },
        { char: '*', code: 'Digit8' },
        { char: '(', code: 'Digit9' },
      ];

      for (const { char, code } of shiftedSymbols) {
        const result = getKeyDefinitionFromChar(char);
        expect(result).not.toBeNull();
        expect(result!.definition.code).toBe(code);
        expect(result!.needsShift).toBe(true);
      }
    });
  });
});

describe('Smart modifiers', () => {
  describe('detectPlatform()', () => {
    it('should return a valid platform', () => {
      const platform = detectPlatform();
      expect(['mac', 'windows', 'linux']).toContain(platform);
    });
  });

  describe('resolveSmartModifier()', () => {
    it('should resolve ControlOrMeta to Meta on Mac', () => {
      expect(resolveSmartModifier('ControlOrMeta', 'mac')).toBe('Meta');
    });

    it('should resolve ControlOrMeta to Control on Windows', () => {
      expect(resolveSmartModifier('ControlOrMeta', 'windows')).toBe('Control');
    });

    it('should resolve ControlOrMeta to Control on Linux', () => {
      expect(resolveSmartModifier('ControlOrMeta', 'linux')).toBe('Control');
    });

    it('should resolve CmdOrCtrl to Meta on Mac', () => {
      expect(resolveSmartModifier('CmdOrCtrl', 'mac')).toBe('Meta');
    });

    it('should resolve CmdOrCtrl to Control on Windows', () => {
      expect(resolveSmartModifier('CmdOrCtrl', 'windows')).toBe('Control');
    });

    it('should pass through regular modifiers', () => {
      expect(resolveSmartModifier('Control', 'mac')).toBe('Control');
      expect(resolveSmartModifier('Shift', 'windows')).toBe('Shift');
      expect(resolveSmartModifier('Alt', 'linux')).toBe('Alt');
      expect(resolveSmartModifier('Meta', 'mac')).toBe('Meta');
    });
  });

  describe('parseKeyCombinationSmart()', () => {
    it('should parse ControlOrMeta+A on Mac as Meta+A', () => {
      const { modifiers, key } = parseKeyCombinationSmart('ControlOrMeta+A', 'mac');
      expect(modifiers).toBe(Modifiers.Meta);
      expect(key?.key).toBe('A');
    });

    it('should parse ControlOrMeta+A on Windows as Control+A', () => {
      const { modifiers, key } = parseKeyCombinationSmart('ControlOrMeta+A', 'windows');
      expect(modifiers).toBe(Modifiers.Control);
      expect(key?.key).toBe('A');
    });

    it('should parse CmdOrCtrl+C on Mac as Meta+C', () => {
      const { modifiers, key } = parseKeyCombinationSmart('CmdOrCtrl+C', 'mac');
      expect(modifiers).toBe(Modifiers.Meta);
      expect(key?.key).toBe('C');
    });

    it('should parse CmdOrCtrl+V on Windows as Control+V', () => {
      const { modifiers, key } = parseKeyCombinationSmart('CmdOrCtrl+V', 'windows');
      expect(modifiers).toBe(Modifiers.Control);
    });

    it('should handle multiple modifiers with smart modifier', () => {
      const { modifiers, key } = parseKeyCombinationSmart('ControlOrMeta+Shift+A', 'mac');
      expect(modifiers).toBe(Modifiers.Meta | Modifiers.Shift);
      expect(key?.key).toBe('A');
    });

    it('should handle regular modifiers without change', () => {
      const { modifiers, key } = parseKeyCombinationSmart('Control+A', 'mac');
      expect(modifiers).toBe(Modifiers.Control);
    });

    it('should handle case insensitivity for smart modifiers', () => {
      const result1 = parseKeyCombinationSmart('controlormeta+a', 'mac');
      const result2 = parseKeyCombinationSmart('CONTROLORMETA+a', 'mac');
      const result3 = parseKeyCombinationSmart('cmdorctrl+a', 'mac');

      expect(result1.modifiers).toBe(Modifiers.Meta);
      expect(result2.modifiers).toBe(Modifiers.Meta);
      expect(result3.modifiers).toBe(Modifiers.Meta);
    });
  });
});
