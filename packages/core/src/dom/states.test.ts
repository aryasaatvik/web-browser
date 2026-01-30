/**
 * Tests for element state checking system.
 *
 * Note: happy-dom doesn't support layout calculations (getBoundingClientRect),
 * so we mock these for layout-dependent tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkElementState,
  checkElementStates,
  checkElementStatesSync,
  waitForElementState,
  type ElementState,
} from './states.js';

describe('Element State Utilities', () => {
  let container: HTMLDivElement;
  let rafCallbacks: (() => void)[];
  let currentTime: number;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    rafCallbacks = [];
    currentTime = 0;

    // Mock requestAnimationFrame for stability tests
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = rafCallbacks.length;
      rafCallbacks.push(() => callback(currentTime));
      return id;
    });

    // Mock performance.now
    vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  // Helper to advance time and run pending RAF callbacks
  function advanceFrame(ms: number = 16.67) {
    currentTime += ms;
    const callbacks = rafCallbacks.splice(0);
    callbacks.forEach((cb) => cb());
  }

  // Helper to mock getBoundingClientRect
  function mockBoundingRect(element: Element, rect: Partial<DOMRect>) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      top: 0,
      right: 100,
      bottom: 50,
      left: 0,
      toJSON: () => ({}),
      ...rect,
    } as DOMRect);
  }

  describe('checkElementState', () => {
    describe('visible/hidden states', () => {
      it('should detect visible element', () => {
        const element = document.createElement('button');
        element.textContent = 'Click me';
        container.appendChild(element);
        mockBoundingRect(element, { width: 100, height: 50 });

        const result = checkElementState(element, 'visible');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('visible');
      });

      it('should detect hidden element with display:none', () => {
        const element = document.createElement('button');
        element.style.display = 'none';
        container.appendChild(element);

        const result = checkElementState(element, 'hidden');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('hidden');
      });

      it('should detect hidden element with visibility:hidden', () => {
        const element = document.createElement('button');
        element.style.visibility = 'hidden';
        container.appendChild(element);
        mockBoundingRect(element, { width: 100, height: 50 });

        const result = checkElementState(element, 'hidden');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('hidden');
      });

      it('should detect hidden element with opacity:0', () => {
        const element = document.createElement('button');
        element.style.opacity = '0';
        container.appendChild(element);
        mockBoundingRect(element, { width: 100, height: 50 });

        const result = checkElementState(element, 'hidden');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('hidden');
      });

      it('should detect hidden element with zero dimensions', () => {
        const element = document.createElement('button');
        container.appendChild(element);
        mockBoundingRect(element, { width: 0, height: 0 });

        const result = checkElementState(element, 'hidden');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('hidden');
      });

      it('should return visible=false for invisible element', () => {
        const element = document.createElement('button');
        element.style.display = 'none';
        container.appendChild(element);

        const result = checkElementState(element, 'visible');
        expect(result.matches).toBe(false);
        expect(result.received).toBe('hidden');
      });

      it('should treat disconnected element as hidden', () => {
        const element = document.createElement('button');
        // Not appended - disconnected

        const result = checkElementState(element, 'hidden');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('hidden');
      });
    });

    describe('enabled/disabled states', () => {
      it('should detect enabled button', () => {
        const element = document.createElement('button');
        element.textContent = 'Click me';
        container.appendChild(element);

        const result = checkElementState(element, 'enabled');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('enabled');
      });

      it('should detect disabled button with disabled attribute', () => {
        const element = document.createElement('button');
        element.disabled = true;
        container.appendChild(element);

        const result = checkElementState(element, 'disabled');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('disabled');
      });

      it('should detect disabled input with disabled attribute', () => {
        const element = document.createElement('input');
        element.disabled = true;
        container.appendChild(element);

        const result = checkElementState(element, 'disabled');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('disabled');
      });

      it('should detect disabled select with disabled attribute', () => {
        const element = document.createElement('select');
        element.disabled = true;
        container.appendChild(element);

        const result = checkElementState(element, 'disabled');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('disabled');
      });

      it('should detect disabled textarea with disabled attribute', () => {
        const element = document.createElement('textarea');
        element.disabled = true;
        container.appendChild(element);

        const result = checkElementState(element, 'disabled');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('disabled');
      });

      it('should detect disabled element with aria-disabled="true"', () => {
        const element = document.createElement('div');
        element.setAttribute('role', 'button');
        element.setAttribute('aria-disabled', 'true');
        container.appendChild(element);

        const result = checkElementState(element, 'disabled');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('disabled');
      });

      it('should detect enabled element with aria-disabled="false"', () => {
        const element = document.createElement('div');
        element.setAttribute('role', 'button');
        element.setAttribute('aria-disabled', 'false');
        container.appendChild(element);

        const result = checkElementState(element, 'enabled');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('enabled');
      });

      it('should inherit aria-disabled from ancestor', () => {
        const parent = document.createElement('div');
        parent.setAttribute('aria-disabled', 'true');
        const element = document.createElement('button');
        parent.appendChild(element);
        container.appendChild(parent);

        const result = checkElementState(element, 'disabled');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('disabled');
      });

      it('should detect disabled option in disabled optgroup', () => {
        const select = document.createElement('select');
        const optgroup = document.createElement('optgroup');
        optgroup.disabled = true;
        const option = document.createElement('option');
        option.value = 'test';
        optgroup.appendChild(option);
        select.appendChild(optgroup);
        container.appendChild(select);

        const result = checkElementState(option, 'disabled');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('disabled');
      });

      it('should detect disabled input in disabled fieldset', () => {
        const fieldset = document.createElement('fieldset');
        fieldset.disabled = true;
        const input = document.createElement('input');
        fieldset.appendChild(input);
        container.appendChild(fieldset);

        const result = checkElementState(input, 'disabled');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('disabled');
      });

      it('should NOT disable input in legend inside disabled fieldset', () => {
        const fieldset = document.createElement('fieldset');
        fieldset.disabled = true;
        const legend = document.createElement('legend');
        const input = document.createElement('input');
        legend.appendChild(input);
        fieldset.appendChild(legend);
        container.appendChild(fieldset);

        const result = checkElementState(input, 'enabled');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('enabled');
      });
    });

    describe('editable state', () => {
      it('should detect editable text input', () => {
        const element = document.createElement('input');
        element.type = 'text';
        container.appendChild(element);

        const result = checkElementState(element, 'editable');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('editable');
      });

      it('should detect non-editable readonly input', () => {
        const element = document.createElement('input');
        element.type = 'text';
        element.readOnly = true;
        container.appendChild(element);

        const result = checkElementState(element, 'editable');
        expect(result.matches).toBe(false);
        expect(result.received).toBe('readonly');
      });

      it('should detect non-editable disabled input', () => {
        const element = document.createElement('input');
        element.type = 'text';
        element.disabled = true;
        container.appendChild(element);

        const result = checkElementState(element, 'editable');
        expect(result.matches).toBe(false);
        expect(result.received).toBe('disabled');
      });

      it('should detect editable textarea', () => {
        const element = document.createElement('textarea');
        container.appendChild(element);

        const result = checkElementState(element, 'editable');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('editable');
      });

      it('should detect non-editable readonly textarea', () => {
        const element = document.createElement('textarea');
        element.readOnly = true;
        container.appendChild(element);

        const result = checkElementState(element, 'editable');
        expect(result.matches).toBe(false);
        expect(result.received).toBe('readonly');
      });

      it('should detect editable contenteditable element', () => {
        const element = document.createElement('div');
        element.contentEditable = 'true';
        container.appendChild(element);

        const result = checkElementState(element, 'editable');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('editable');
      });

      it('should detect non-editable element with aria-readonly="true"', () => {
        const element = document.createElement('div');
        element.setAttribute('role', 'textbox');
        element.setAttribute('aria-readonly', 'true');
        container.appendChild(element);

        const result = checkElementState(element, 'editable');
        expect(result.matches).toBe(false);
        expect(result.received).toBe('readonly');
      });

      it('should throw for non-editable element type', () => {
        const element = document.createElement('div');
        container.appendChild(element);

        expect(() => checkElementState(element, 'editable')).toThrow(
          'Element is not an <input>, <textarea>, <select> or [contenteditable]'
        );
      });
    });

    describe('checked/unchecked states', () => {
      it('should detect checked checkbox', () => {
        const element = document.createElement('input');
        element.type = 'checkbox';
        element.checked = true;
        container.appendChild(element);

        const result = checkElementState(element, 'checked');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('checked');
        expect(result.isRadio).toBe(false);
      });

      it('should detect unchecked checkbox', () => {
        const element = document.createElement('input');
        element.type = 'checkbox';
        element.checked = false;
        container.appendChild(element);

        const result = checkElementState(element, 'unchecked');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('unchecked');
        expect(result.isRadio).toBe(false);
      });

      it('should detect checked radio button', () => {
        const element = document.createElement('input');
        element.type = 'radio';
        element.checked = true;
        container.appendChild(element);

        const result = checkElementState(element, 'checked');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('checked');
        expect(result.isRadio).toBe(true);
      });

      it('should detect unchecked radio button', () => {
        const element = document.createElement('input');
        element.type = 'radio';
        element.checked = false;
        container.appendChild(element);

        const result = checkElementState(element, 'unchecked');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('unchecked');
        expect(result.isRadio).toBe(true);
      });

      it('should detect checked element with aria-checked="true"', () => {
        const element = document.createElement('div');
        element.setAttribute('role', 'checkbox');
        element.setAttribute('aria-checked', 'true');
        container.appendChild(element);

        const result = checkElementState(element, 'checked');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('checked');
      });

      it('should detect unchecked element with aria-checked="false"', () => {
        const element = document.createElement('div');
        element.setAttribute('role', 'checkbox');
        element.setAttribute('aria-checked', 'false');
        container.appendChild(element);

        const result = checkElementState(element, 'unchecked');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('unchecked');
      });

      it('should detect checked switch role', () => {
        const element = document.createElement('div');
        element.setAttribute('role', 'switch');
        element.setAttribute('aria-checked', 'true');
        container.appendChild(element);

        const result = checkElementState(element, 'checked');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('checked');
      });

      it('should throw for non-checkable element', () => {
        const element = document.createElement('button');
        container.appendChild(element);

        expect(() => checkElementState(element, 'checked')).toThrow(
          'Not a checkbox or radio button'
        );
      });
    });

    describe('indeterminate state', () => {
      it('should detect indeterminate checkbox via property', () => {
        const element = document.createElement('input');
        element.type = 'checkbox';
        element.indeterminate = true;
        container.appendChild(element);

        const result = checkElementState(element, 'indeterminate');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('mixed');
      });

      it('should detect indeterminate via aria-checked="mixed"', () => {
        const element = document.createElement('div');
        element.setAttribute('role', 'checkbox');
        element.setAttribute('aria-checked', 'mixed');
        container.appendChild(element);

        const result = checkElementState(element, 'indeterminate');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('mixed');
      });

      it('should return checked for non-indeterminate checkbox', () => {
        const element = document.createElement('input');
        element.type = 'checkbox';
        element.checked = true;
        element.indeterminate = false;
        container.appendChild(element);

        const result = checkElementState(element, 'indeterminate');
        expect(result.matches).toBe(false);
        expect(result.received).toBe('checked');
      });

      it('should return unchecked for non-indeterminate unchecked checkbox', () => {
        const element = document.createElement('input');
        element.type = 'checkbox';
        element.checked = false;
        element.indeterminate = false;
        container.appendChild(element);

        const result = checkElementState(element, 'indeterminate');
        expect(result.matches).toBe(false);
        expect(result.received).toBe('unchecked');
      });

      it('should throw for non-checkable element', () => {
        const element = document.createElement('button');
        container.appendChild(element);

        expect(() => checkElementState(element, 'indeterminate')).toThrow(
          'Not a checkbox or radio button'
        );
      });
    });

    describe('stable state (sync check)', () => {
      it('should return matches:true for element with valid dimensions', () => {
        const element = document.createElement('div');
        container.appendChild(element);
        mockBoundingRect(element, { width: 100, height: 50 });

        const result = checkElementState(element, 'stable');
        expect(result.matches).toBe(true);
        expect(result.received).toBe('stable');
      });

      it('should return matches:false for disconnected element', () => {
        const element = document.createElement('div');
        // Not appended - disconnected

        const result = checkElementState(element, 'stable');
        expect(result.matches).toBe(false);
        expect(result.received).toBe('disconnected');
      });

      it('should return matches:false for element with no size', () => {
        const element = document.createElement('div');
        container.appendChild(element);
        mockBoundingRect(element, { width: 0, height: 0 });

        const result = checkElementState(element, 'stable');
        expect(result.matches).toBe(false);
        expect(result.received).toBe('no-size');
      });
    });

    describe('disconnected element handling', () => {
      it('should return error:notconnected for visible check on disconnected element', () => {
        const element = document.createElement('button');
        // Not appended - disconnected

        const result = checkElementState(element, 'visible');
        expect(result.matches).toBe(false);
        expect(result.received).toBe('error:notconnected');
      });

      it('should return error:notconnected for enabled check on disconnected element', () => {
        const element = document.createElement('button');
        // Not appended - disconnected

        const result = checkElementState(element, 'enabled');
        expect(result.matches).toBe(false);
        expect(result.received).toBe('error:notconnected');
      });
    });
  });

  describe('checkElementStates', () => {
    it('should return success when all states match', async () => {
      const element = document.createElement('button');
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      const result = await checkElementStates(element, ['visible', 'enabled']);
      expect(result.success).toBe(true);
      expect(result.missingState).toBeUndefined();
    });

    it('should return first failing state', async () => {
      const element = document.createElement('button');
      element.disabled = true;
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      const result = await checkElementStates(element, ['visible', 'enabled']);
      expect(result.success).toBe(false);
      expect(result.missingState).toBe('enabled');
    });

    it('should handle stable state with other states', async () => {
      const element = document.createElement('button');
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      const resultPromise = checkElementStates(element, ['stable', 'visible', 'enabled']);

      // Run RAF callbacks for stability check
      advanceFrame(20);
      advanceFrame(20);
      advanceFrame(20);

      const result = await resultPromise;
      expect(result.success).toBe(true);
    });

    it('should fail on stable state for moving element', async () => {
      const element = document.createElement('button');
      container.appendChild(element);

      let top = 100;
      vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => ({
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        top: top++, // Always moving
        right: 100,
        bottom: top + 49,
        left: 0,
        toJSON: () => ({}),
      } as DOMRect));

      // Use a very short timeout so test doesn't hang
      const resultPromise = checkElementStates(element, ['stable', 'visible']);

      // Run RAF callbacks with shorter timeout (default 5000ms stability timeout)
      // We need to advance past the stability timeout
      for (let i = 0; i < 400; i++) {
        advanceFrame(20);
      }

      const result = await resultPromise;
      expect(result.success).toBe(false);
      expect(result.missingState).toBe('stable');
    }, 10000); // Increase test timeout

    it('should handle disconnected element', async () => {
      const element = document.createElement('button');
      // Not appended - disconnected

      const result = await checkElementStates(element, ['visible', 'enabled']);
      expect(result.success).toBe(false);
      // Either visible or enabled will fail first
      expect(['visible', 'enabled']).toContain(result.missingState);
    });
  });

  describe('checkElementStatesSync', () => {
    it('should return success when all states match', () => {
      const element = document.createElement('button');
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      const result = checkElementStatesSync(element, ['visible', 'enabled']);
      expect(result.success).toBe(true);
      expect(result.missingState).toBeUndefined();
    });

    it('should return first failing state', () => {
      const element = document.createElement('button');
      element.disabled = true;
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      const result = checkElementStatesSync(element, ['visible', 'enabled']);
      expect(result.success).toBe(false);
      expect(result.missingState).toBe('enabled');
    });

    it('should handle element that throws during state check', () => {
      const element = document.createElement('div');
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      // editable will throw for plain div, but checkElementStatesSync catches it
      // Order matters - 'visible' passes, 'editable' fails
      const result = checkElementStatesSync(element, ['visible', 'editable']);
      expect(result.success).toBe(false);
      expect(result.missingState).toBe('editable');
    });
  });

  describe('waitForElementState', () => {
    it('should return immediately if state matches', async () => {
      const element = document.createElement('button');
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      const result = await waitForElementState(element, 'visible', 1000);
      expect(result.matches).toBe(true);
      expect(result.received).toBe('visible');
    });

    it('should wait for element to become visible', async () => {
      vi.useFakeTimers();

      const element = document.createElement('button');
      element.style.display = 'none';
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      // Start waiting
      const resultPromise = waitForElementState(element, 'visible', 500);

      // Make element visible after short delay
      setTimeout(() => {
        element.style.display = 'block';
      }, 100);

      // Advance time to trigger the state change
      await vi.advanceTimersByTimeAsync(150);

      const result = await resultPromise;
      expect(result.matches).toBe(true);

      vi.useRealTimers();
    });

    it('should timeout if state never matches', async () => {
      vi.useFakeTimers();

      const element = document.createElement('button');
      element.style.display = 'none';
      container.appendChild(element);

      const resultPromise = waitForElementState(element, 'visible', 100);

      // Advance time past timeout
      await vi.advanceTimersByTimeAsync(150);

      const result = await resultPromise;
      expect(result.matches).toBe(false);
      expect(result.received).toBe('hidden');

      vi.useRealTimers();
    });

    it('should wait for stable state using RAF', async () => {
      const element = document.createElement('button');
      container.appendChild(element);
      mockBoundingRect(element, { width: 100, height: 50 });

      const resultPromise = waitForElementState(element, 'stable', 1000);

      // Run RAF callbacks
      advanceFrame(20);
      advanceFrame(20);
      advanceFrame(20);

      const result = await resultPromise;
      expect(result.matches).toBe(true);
      expect(result.received).toBe('stable');
    });
  });
});
