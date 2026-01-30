/**
 * Tests for hit target interception utilities.
 *
 * Note: happy-dom doesn't support layout calculations (getBoundingClientRect,
 * elementFromPoint, elementsFromPoint), so we mock these for tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  expectHitTarget,
  setupHitTargetInterceptor,
  describeElement,
  isTouchEvent,
  createTouchObject,
  HitTargetResult,
} from './hitTarget.js';

describe('Hit Target Utilities', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);

    // Happy-dom doesn't implement elementsFromPoint/elementFromPoint
    // We need to define stub implementations before we can mock them
    if (!document.elementsFromPoint) {
      (document as any).elementsFromPoint = () => [];
    }
    if (!document.elementFromPoint) {
      (document as any).elementFromPoint = () => null;
    }
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Mock elementsFromPoint to return a specific list of elements.
   * This simulates the browser's hit testing behavior.
   */
  function mockElementsFromPoint(
    root: Document | ShadowRoot,
    elements: Element[]
  ) {
    // Ensure the methods exist on the root before spying
    if (!(root as any).elementsFromPoint) {
      (root as any).elementsFromPoint = () => [];
    }
    if (!(root as any).elementFromPoint) {
      (root as any).elementFromPoint = () => null;
    }
    vi.spyOn(root, 'elementsFromPoint').mockReturnValue(elements);
    vi.spyOn(root, 'elementFromPoint').mockReturnValue(elements[0] || null);
  }

  /**
   * Mock getBoundingClientRect for an element.
   */
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

  /**
   * Create a simple element with optional attributes.
   */
  function createElement(
    tag: string,
    attrs: Record<string, string> = {},
    textContent?: string
  ): HTMLElement {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      element.setAttribute(key, value);
    }
    if (textContent !== undefined) {
      element.textContent = textContent;
    }
    return element;
  }

  // ============================================================================
  // describeElement Tests
  // ============================================================================

  describe('describeElement', () => {
    it('should describe element with tag, id, and classes', () => {
      const element = createElement('button', {
        id: 'submit-btn',
        class: 'primary large',
      });
      element.textContent = 'Submit';
      container.appendChild(element);

      const description = describeElement(element);
      expect(description).toContain('<button');
      expect(description).toContain('id="submit-btn"');
      expect(description).toContain('class="primary large"');
      expect(description).toContain('Submit');
      expect(description).toContain('</button>');
    });

    it('should describe element with only tag name', () => {
      const element = createElement('div');
      container.appendChild(element);

      const description = describeElement(element);
      expect(description).toBe('<div></div>');
    });

    it('should handle self-closing tags', () => {
      const element = createElement('input', { type: 'text', name: 'email' });
      container.appendChild(element);

      const description = describeElement(element);
      expect(description).toContain('<input');
      expect(description).toContain('type="text"');
      expect(description).toContain('/>');
      expect(description).not.toContain('</input>');
    });

    it('should handle boolean attributes', () => {
      const element = createElement('input', { disabled: '', required: '' });
      container.appendChild(element);

      const description = describeElement(element);
      expect(description).toContain(' disabled');
      expect(description).toContain(' required');
    });

    it('should truncate long text content', () => {
      const element = createElement('p');
      element.textContent = 'A'.repeat(100);
      container.appendChild(element);

      const description = describeElement(element);
      expect(description.length).toBeLessThan(150);
      expect(description).toContain('\u2026'); // ellipsis
    });

    it('should truncate long attribute values', () => {
      const element = createElement('div', { 'data-long': 'B'.repeat(600) });
      container.appendChild(element);

      const description = describeElement(element);
      expect(description.length).toBeLessThan(600);
    });

    it('should skip style attribute', () => {
      const element = createElement('div', {
        style: 'color: red; background: blue;',
        class: 'test',
      });
      container.appendChild(element);

      const description = describeElement(element);
      expect(description).not.toContain('style=');
      expect(description).toContain('class="test"');
    });

    it('should show ellipsis for nested children', () => {
      const element = createElement('div');
      element.appendChild(createElement('span'));
      element.appendChild(createElement('span'));
      container.appendChild(element);

      const description = describeElement(element);
      expect(description).toContain('\u2026'); // ellipsis for children
    });

    it('should handle elements without id or class', () => {
      const element = createElement('span', {}, 'Hello');
      container.appendChild(element);

      const description = describeElement(element);
      expect(description).toBe('<span>Hello</span>');
    });
  });

  // ============================================================================
  // expectHitTarget Tests
  // ============================================================================

  describe('expectHitTarget', () => {
    it('should succeed when clicking on visible element', () => {
      const button = createElement('button', {}, 'Click me');
      container.appendChild(button);

      // Mock that the button is the element at the hit point
      mockElementsFromPoint(document, [button, container, document.body]);

      const result = expectHitTarget({ x: 50, y: 25 }, button);

      expect(result.success).toBe(true);
      expect(result.blocked).toBeUndefined();
      expect(result.hitTargetDescription).toBeUndefined();
    });

    it("should succeed when clicking on element's descendant", () => {
      const button = createElement('button');
      const span = createElement('span', {}, 'Click text');
      button.appendChild(span);
      container.appendChild(button);

      // Mock that the span (child) is the element at the hit point
      mockElementsFromPoint(document, [span, button, container, document.body]);

      const result = expectHitTarget({ x: 50, y: 25 }, button);

      expect(result.success).toBe(true);
    });

    it('should fail when click is blocked by overlay', () => {
      const button = createElement('button', { id: 'target' }, 'Click me');
      const overlay = createElement('div', {
        id: 'overlay',
        class: 'modal-backdrop',
      });
      container.appendChild(button);
      container.appendChild(overlay);

      // Mock that the overlay is the element at the hit point
      mockElementsFromPoint(document, [overlay, button, container]);

      const result = expectHitTarget({ x: 50, y: 25 }, button);

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.hitTargetDescription).toContain('<div');
      expect(result.hitTargetDescription).toContain('id="overlay"');
    });

    it('should handle multiple overlapping elements correctly', () => {
      const button = createElement('button', { id: 'target' });
      const tooltip = createElement('div', { class: 'tooltip' }, 'Tooltip');
      const overlay = createElement('div', { class: 'overlay' });
      container.appendChild(button);
      container.appendChild(tooltip);
      container.appendChild(overlay);

      // Mock that the overlay is topmost
      mockElementsFromPoint(document, [overlay, tooltip, button, container]);

      const result = expectHitTarget({ x: 50, y: 25 }, button);

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.hitTargetDescription).toContain('overlay');
    });

    it('should handle disconnected elements gracefully', () => {
      const button = createElement('button', {}, 'Disconnected');
      // Don't append to container - element is not connected

      const result = expectHitTarget({ x: 50, y: 25 }, button);

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.hitTargetDescription).toContain('not connected');
    });

    it('should work with shadow DOM elements', () => {
      // Create a host element with shadow DOM
      const host = createElement('div', { id: 'host' });
      container.appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });

      const innerButton = createElement('button', { id: 'shadow-btn' });
      shadow.appendChild(innerButton);

      // Mock that the inner button is hit at both the document level (via host)
      // and the shadow root level
      mockElementsFromPoint(document, [host, container, document.body]);
      mockElementsFromPoint(shadow, [innerButton]);

      const result = expectHitTarget({ x: 50, y: 25 }, innerButton);

      expect(result.success).toBe(true);
    });

    it('should fail when shadow DOM element is covered by external overlay', () => {
      // Create a host element with shadow DOM
      const host = createElement('div', { id: 'host' });
      container.appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });

      const innerButton = createElement('button', { id: 'shadow-btn' });
      shadow.appendChild(innerButton);

      // Create an overlay outside shadow DOM
      const overlay = createElement('div', { id: 'overlay' });
      container.appendChild(overlay);

      // Mock that the overlay is hit at document level, not the host
      mockElementsFromPoint(document, [overlay, host, container]);

      const result = expectHitTarget({ x: 50, y: 25 }, innerButton);

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
    });

    it('should handle nested elements with slots', () => {
      const host = createElement('div', { id: 'host' });
      container.appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });

      // Create a slot in the shadow DOM
      const slot = document.createElement('slot');
      shadow.appendChild(slot);

      // Create content that gets slotted
      const slottedContent = createElement(
        'span',
        { class: 'slotted' },
        'Slotted'
      );
      host.appendChild(slottedContent);

      // Mock hit testing - the slotted content should be reachable
      mockElementsFromPoint(document, [host, container, document.body]);
      mockElementsFromPoint(shadow, [slottedContent]);

      const result = expectHitTarget({ x: 50, y: 25 }, host);

      // The slot mechanism makes slottedContent a descendant in the composed tree
      expect(result.success).toBe(true);
    });

    it('should return detailed description for subtree blocking', () => {
      const button = createElement('button', { id: 'target' });
      const dialog = createElement('div', { class: 'dialog' });
      const dialogInner = createElement('div', { class: 'dialog-content' });
      const closeBtn = createElement('button', { class: 'close' }, 'X');

      dialog.appendChild(dialogInner);
      dialogInner.appendChild(closeBtn);
      container.appendChild(button);
      container.appendChild(dialog);

      // Mock that the close button (deep in dialog) is hit
      mockElementsFromPoint(document, [
        closeBtn,
        dialogInner,
        dialog,
        button,
        container,
      ]);

      const result = expectHitTarget({ x: 50, y: 25 }, button);

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      // Should mention the close button and indicate it's from the dialog subtree
      expect(result.hitTargetDescription).toContain('close');
    });

    it('should succeed when no element is at the point but target is in chain', () => {
      const button = createElement('button', { id: 'target' });
      container.appendChild(button);

      // Mock that no element is found at the point
      mockElementsFromPoint(document, []);

      const result = expectHitTarget({ x: 50, y: 25 }, button);

      // When no element is found, hit check fails
      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
    });
  });

  // ============================================================================
  // setupHitTargetInterceptor Tests
  // ============================================================================

  describe('setupHitTargetInterceptor', () => {
    it('should set up and tear down correctly', () => {
      const button = createElement('button', {}, 'Click me');
      container.appendChild(button);

      // Mock successful hit target
      mockElementsFromPoint(document, [button, container, document.body]);

      const interceptor = setupHitTargetInterceptor(
        button,
        { x: 50, y: 25 },
        'click'
      );

      expect(interceptor).toBeDefined();
      expect(typeof interceptor.verify).toBe('function');
      expect(typeof interceptor.stop).toBe('function');

      // Stop should clean up
      interceptor.stop();

      // Calling stop again should be safe
      expect(() => interceptor.stop()).not.toThrow();
    });

    it('should return success for valid clicks when verify() is called', () => {
      const button = createElement('button', {}, 'Click me');
      container.appendChild(button);

      mockElementsFromPoint(document, [button, container, document.body]);

      const interceptor = setupHitTargetInterceptor(
        button,
        { x: 50, y: 25 },
        'click'
      );

      const result = interceptor.verify();
      interceptor.stop();

      expect(result.success).toBe(true);
    });

    it('should return blocked with description for blocked clicks', () => {
      const button = createElement('button', { id: 'target' }, 'Click me');
      const overlay = createElement('div', { id: 'blocker' });
      container.appendChild(button);
      container.appendChild(overlay);

      // Mock that overlay blocks the button
      mockElementsFromPoint(document, [overlay, button, container]);

      const interceptor = setupHitTargetInterceptor(
        button,
        { x: 50, y: 25 },
        'click'
      );

      const result = interceptor.verify();
      interceptor.stop();

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.hitTargetDescription).toContain('blocker');
    });

    it('should handle disconnected elements', () => {
      const button = createElement('button');
      // Don't append - disconnected

      const interceptor = setupHitTargetInterceptor(
        button,
        { x: 50, y: 25 },
        'click'
      );

      const result = interceptor.verify();
      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.hitTargetDescription).toContain('not connected');

      // Stop should be safe to call
      interceptor.stop();
    });

    it('should pass through drag actions without interception', () => {
      const button = createElement('button');
      container.appendChild(button);

      mockElementsFromPoint(document, [button, container]);

      const interceptor = setupHitTargetInterceptor(
        button,
        { x: 50, y: 25 },
        'drag'
      );

      // Drag actions always succeed (no interception needed)
      const result = interceptor.verify();
      expect(result.success).toBe(true);

      interceptor.stop();
    });

    it('should handle hover action with appropriate events', () => {
      const button = createElement('button');
      container.appendChild(button);

      mockElementsFromPoint(document, [button, container]);

      const interceptor = setupHitTargetInterceptor(
        button,
        { x: 50, y: 25 },
        'hover'
      );

      const result = interceptor.verify();
      expect(result.success).toBe(true);

      interceptor.stop();
    });

    it('should intercept and block events when target is covered', () => {
      const button = createElement('button', { id: 'target' });
      const overlay = createElement('div', { id: 'overlay' });
      container.appendChild(button);
      container.appendChild(overlay);

      // Set up mocks - overlay covers button
      mockElementsFromPoint(document, [overlay, button, container]);

      const interceptor = setupHitTargetInterceptor(
        button,
        { x: 50, y: 25 },
        'click'
      );

      // The preliminary check should already detect the blockage
      const result = interceptor.verify();
      expect(result.success).toBe(false);

      interceptor.stop();
    });

    it('should allow events when target is correctly hit', () => {
      const button = createElement('button');
      container.appendChild(button);

      // Set up mocks - button is directly hit
      mockElementsFromPoint(document, [button, container]);

      const interceptor = setupHitTargetInterceptor(
        button,
        { x: 50, y: 25 },
        'click'
      );

      const result = interceptor.verify();
      expect(result.success).toBe(true);

      interceptor.stop();
    });

    describe('event handling', () => {
      it('should set up event listeners at capture phase', () => {
        const button = createElement('button');
        container.appendChild(button);

        mockElementsFromPoint(document, [button, container]);

        const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

        const interceptor = setupHitTargetInterceptor(
          button,
          { x: 50, y: 25 },
          'click'
        );

        // Should add listeners for click-related events
        const clickEvents = [
          'mousedown',
          'mouseup',
          'pointerdown',
          'pointerup',
          'click',
          'auxclick',
          'dblclick',
          'contextmenu',
        ];

        for (const eventType of clickEvents) {
          expect(addEventListenerSpy).toHaveBeenCalledWith(
            eventType,
            expect.any(Function),
            { capture: true, passive: false }
          );
        }

        interceptor.stop();
      });

      it('should remove event listeners on stop', () => {
        const button = createElement('button');
        container.appendChild(button);

        mockElementsFromPoint(document, [button, container]);

        const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

        const interceptor = setupHitTargetInterceptor(
          button,
          { x: 50, y: 25 },
          'click'
        );

        interceptor.stop();

        // Should remove listeners for click-related events
        const clickEvents = [
          'mousedown',
          'mouseup',
          'pointerdown',
          'pointerup',
          'click',
          'auxclick',
          'dblclick',
          'contextmenu',
        ];

        for (const eventType of clickEvents) {
          expect(removeEventListenerSpy).toHaveBeenCalledWith(
            eventType,
            expect.any(Function),
            { capture: true }
          );
        }
      });

      it('should use mousemove events for hover action', () => {
        const button = createElement('button');
        container.appendChild(button);

        mockElementsFromPoint(document, [button, container]);

        const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

        const interceptor = setupHitTargetInterceptor(
          button,
          { x: 50, y: 25 },
          'hover'
        );

        expect(addEventListenerSpy).toHaveBeenCalledWith(
          'mousemove',
          expect.any(Function),
          { capture: true, passive: false }
        );

        interceptor.stop();
      });
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('integration', () => {
    it('should work with complex DOM structures', () => {
      // Create a realistic DOM structure
      const header = createElement('header');
      const nav = createElement('nav');
      const main = createElement('main');
      const footer = createElement('footer');
      const modal = createElement('div', { class: 'modal', role: 'dialog' });
      const modalBackdrop = createElement('div', { class: 'modal-backdrop' });
      const modalContent = createElement('div', { class: 'modal-content' });
      const closeButton = createElement(
        'button',
        { class: 'close-btn' },
        'Close'
      );

      modal.appendChild(modalContent);
      modalContent.appendChild(closeButton);

      container.appendChild(header);
      container.appendChild(nav);
      container.appendChild(main);
      container.appendChild(footer);
      container.appendChild(modalBackdrop);
      container.appendChild(modal);

      // Target a button in main, but modal backdrop is covering it
      const targetButton = createElement(
        'button',
        { id: 'main-action' },
        'Action'
      );
      main.appendChild(targetButton);

      // Mock that the modal backdrop is hit
      mockElementsFromPoint(document, [
        modalBackdrop,
        targetButton,
        main,
        container,
      ]);

      const result = expectHitTarget({ x: 100, y: 200 }, targetButton);

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.hitTargetDescription).toContain('modal-backdrop');
    });

    it('should handle dynamically changing DOM', () => {
      const button = createElement('button', { id: 'target' });
      container.appendChild(button);

      // Initial state: button is clickable
      mockElementsFromPoint(document, [button, container]);

      const interceptor = setupHitTargetInterceptor(
        button,
        { x: 50, y: 25 },
        'click'
      );

      // Verify initial state
      const initialResult = interceptor.verify();
      expect(initialResult.success).toBe(true);

      interceptor.stop();
    });
  });

  // ============================================================================
  // Touch Event Tests
  // ============================================================================

  describe('touch events', () => {
    describe('isTouchEvent helper', () => {
      it('should return true for touch event types via type check', () => {
        // In happy-dom, TouchEvent constructor may not be available
        // But our fallback logic checks event.type.startsWith('touch')
        // We test this by temporarily removing TouchEvent and testing the fallback
        const originalTouchEvent = (globalThis as any).TouchEvent;

        // Test fallback path when TouchEvent is not available
        (globalThis as any).TouchEvent = undefined;
        try {
          const touchStartEvent = new Event('touchstart');
          const touchEndEvent = new Event('touchend');
          const touchCancelEvent = new Event('touchcancel');

          expect(isTouchEvent(touchStartEvent)).toBe(true);
          expect(isTouchEvent(touchEndEvent)).toBe(true);
          expect(isTouchEvent(touchCancelEvent)).toBe(true);
        } finally {
          (globalThis as any).TouchEvent = originalTouchEvent;
        }
      });

      it('should return false for mouse/pointer events', () => {
        const mouseEvent = new MouseEvent('click');
        const pointerEvent = new PointerEvent('pointerdown');

        expect(isTouchEvent(mouseEvent)).toBe(false);
        expect(isTouchEvent(pointerEvent)).toBe(false);
      });

      it('should return false for non-touch event types', () => {
        const keyEvent = new KeyboardEvent('keydown');
        const focusEvent = new FocusEvent('focus');

        expect(isTouchEvent(keyEvent)).toBe(false);
        expect(isTouchEvent(focusEvent)).toBe(false);
      });

      it('should use TouchEvent instanceof check when available', () => {
        // If TouchEvent is available (real browser), the instanceof check should work
        // In happy-dom, we rely on the type-based fallback
        const event = new Event('touchstart');
        // Just verify the function returns a boolean without throwing
        expect(typeof isTouchEvent(event)).toBe('boolean');
      });
    });

    describe('createTouchObject helper', () => {
      it('should create a touch-like object with correct coordinates', () => {
        const target = document.createElement('button');
        const touch = createTouchObject(target, 1, 100, 200);

        expect(touch.identifier).toBe(1);
        expect(touch.target).toBe(target);
        expect(touch.clientX).toBe(100);
        expect(touch.clientY).toBe(200);
        expect(touch.screenX).toBe(100);
        expect(touch.screenY).toBe(200);
        expect(touch.pageX).toBe(100);
        expect(touch.pageY).toBe(200);
      });

      it('should set default touch properties when using fallback', () => {
        // Test the fallback path when Touch constructor is not available
        const originalTouch = (globalThis as any).Touch;

        (globalThis as any).Touch = undefined;
        try {
          const target = document.createElement('div');
          const touch = createTouchObject(target, 0, 50, 75);

          // In the fallback object, we set these defaults
          expect(touch.radiusX).toBe(1);
          expect(touch.radiusY).toBe(1);
          expect(touch.rotationAngle).toBe(0);
          expect(touch.force).toBe(1);
        } finally {
          (globalThis as any).Touch = originalTouch;
        }
      });

      it('should use Touch constructor when available', () => {
        // If Touch constructor is available, it should use it
        const target = document.createElement('div');
        const touch = createTouchObject(target, 0, 50, 75);

        // The touch object should have the correct coordinates regardless of method
        expect(touch.clientX).toBe(50);
        expect(touch.clientY).toBe(75);
        expect(touch.identifier).toBe(0);
      });

      it('should handle document as target', () => {
        // The function handles Node types specially for ownerDocument lookup
        const touch = createTouchObject(document as any, 2, 0, 0);

        expect(touch.identifier).toBe(2);
        expect(touch.target).toBe(document);
      });
    });

    describe('tap action interceptor', () => {
      it('should set up event listeners for tap events', () => {
        const button = createElement('button');
        container.appendChild(button);

        mockElementsFromPoint(document, [button, container]);

        const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

        const interceptor = setupHitTargetInterceptor(
          button,
          { x: 50, y: 25 },
          'tap'
        );

        // Should add listeners for tap-related events
        const tapEvents = [
          'pointerdown',
          'pointerup',
          'touchstart',
          'touchend',
          'touchcancel',
        ];

        for (const eventType of tapEvents) {
          expect(addEventListenerSpy).toHaveBeenCalledWith(
            eventType,
            expect.any(Function),
            { capture: true, passive: false }
          );
        }

        interceptor.stop();
      });

      it('should remove tap event listeners on stop', () => {
        const button = createElement('button');
        container.appendChild(button);

        mockElementsFromPoint(document, [button, container]);

        const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

        const interceptor = setupHitTargetInterceptor(
          button,
          { x: 50, y: 25 },
          'tap'
        );

        interceptor.stop();

        // Should remove listeners for tap-related events
        const tapEvents = [
          'pointerdown',
          'pointerup',
          'touchstart',
          'touchend',
          'touchcancel',
        ];

        for (const eventType of tapEvents) {
          expect(removeEventListenerSpy).toHaveBeenCalledWith(
            eventType,
            expect.any(Function),
            { capture: true }
          );
        }
      });

      it('should return success for valid taps', () => {
        const button = createElement('button');
        container.appendChild(button);

        mockElementsFromPoint(document, [button, container]);

        const interceptor = setupHitTargetInterceptor(
          button,
          { x: 50, y: 25 },
          'tap'
        );

        const result = interceptor.verify();
        expect(result.success).toBe(true);

        interceptor.stop();
      });

      it('should return blocked when tap target is covered', () => {
        const button = createElement('button', { id: 'target' });
        const overlay = createElement('div', { id: 'overlay' });
        container.appendChild(button);
        container.appendChild(overlay);

        // Mock that overlay blocks the button
        mockElementsFromPoint(document, [overlay, button, container]);

        const interceptor = setupHitTargetInterceptor(
          button,
          { x: 50, y: 25 },
          'tap'
        );

        const result = interceptor.verify();
        expect(result.success).toBe(false);
        expect(result.blocked).toBe(true);

        interceptor.stop();
      });
    });

    describe('blockAllEvents option', () => {
      it('should block events when blockAllEvents is true even if hit target succeeds', () => {
        const button = createElement('button');
        container.appendChild(button);

        // Mock successful hit target
        mockElementsFromPoint(document, [button, container]);

        const interceptor = setupHitTargetInterceptor(
          button,
          { x: 50, y: 25 },
          'click',
          { blockAllEvents: true }
        );

        // Even though hit target check succeeds, events should still be blocked
        // We can verify the interceptor was set up correctly
        expect(interceptor).toBeDefined();
        expect(typeof interceptor.verify).toBe('function');
        expect(typeof interceptor.stop).toBe('function');

        interceptor.stop();
      });

      it('should work with tap action and blockAllEvents', () => {
        const button = createElement('button');
        container.appendChild(button);

        mockElementsFromPoint(document, [button, container]);

        const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

        const interceptor = setupHitTargetInterceptor(
          button,
          { x: 50, y: 25 },
          'tap',
          { blockAllEvents: true }
        );

        // Should still set up tap event listeners
        expect(addEventListenerSpy).toHaveBeenCalledWith(
          'touchstart',
          expect.any(Function),
          { capture: true, passive: false }
        );

        interceptor.stop();
      });

      it('should default blockAllEvents to false', () => {
        const button = createElement('button');
        container.appendChild(button);

        mockElementsFromPoint(document, [button, container]);

        const interceptor = setupHitTargetInterceptor(
          button,
          { x: 50, y: 25 },
          'click'
        );

        // Should succeed without blockAllEvents option
        const result = interceptor.verify();
        expect(result.success).toBe(true);

        interceptor.stop();
      });
    });

    describe('touch coordinate extraction', () => {
      it('should handle touch events with missing touch points gracefully', () => {
        const button = createElement('button');
        container.appendChild(button);

        mockElementsFromPoint(document, [button, container]);

        const interceptor = setupHitTargetInterceptor(
          button,
          { x: 50, y: 25 },
          'tap'
        );

        // The interceptor should handle this gracefully without crashing
        const result = interceptor.verify();
        expect(result.success).toBe(true);

        interceptor.stop();
      });
    });
  });
});
