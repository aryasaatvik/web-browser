/**
 * Tests for layout selector engines.
 *
 * Note: happy-dom doesn't support layout calculations (getBoundingClientRect),
 * so we mock these for all layout-dependent tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  boxLeftOf,
  boxRightOf,
  boxAbove,
  boxBelow,
  boxNear,
  layoutSelectorScore,
  createLayoutEngine,
  layoutEngines,
  registerLayoutEngines,
  kLayoutSelectorNames,
  type LayoutSelectorName,
} from './layout.js';
import { selectorEngines } from './engine.js';
import { cssEngine } from './css.js';
import { textEngine } from './text.js';
import { registerInternalEngines } from './internal.js';

// Ensure CSS, text and internal engines are registered for nested selector tests
selectorEngines.register(cssEngine);
selectorEngines.register(textEngine);
registerInternalEngines();
registerLayoutEngines();

/**
 * Create a mock DOMRect for testing.
 */
function createRect(
  left: number,
  top: number,
  width: number,
  height: number
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('Layout Selector Engines', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  // Helper to mock getBoundingClientRect on an element
  function mockBoundingRect(element: Element, rect: DOMRect) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect);
  }

  describe('boxLeftOf', () => {
    it('should return distance when element is directly to the left', () => {
      // box1 is at x=0, box2 is at x=150
      // box1.right = 100, box2.left = 150, distance = 50
      const box1 = createRect(0, 0, 100, 50);
      const box2 = createRect(150, 0, 100, 50);

      const result = boxLeftOf(box1, box2, undefined);

      expect(result).toBe(50); // 150 - 100 = 50
    });

    it('should return undefined when element is not to the left (overlapping)', () => {
      // box1 overlaps with box2
      const box1 = createRect(50, 0, 100, 50);
      const box2 = createRect(100, 0, 100, 50);

      const result = boxLeftOf(box1, box2, undefined);

      // box2.left (100) - box1.right (150) = -50, negative so undefined
      expect(result).toBeUndefined();
    });

    it('should return undefined when element is to the right', () => {
      // box1 is to the right of box2
      const box1 = createRect(200, 0, 100, 50);
      const box2 = createRect(0, 0, 100, 50);

      const result = boxLeftOf(box1, box2, undefined);

      // box2.left (0) - box1.right (300) = -300
      expect(result).toBeUndefined();
    });

    it('should add penalty for vertical misalignment (box1 extends below)', () => {
      // box1 extends below box2
      const box1 = createRect(0, 0, 100, 100); // bottom = 100
      const box2 = createRect(150, 0, 100, 50); // bottom = 50

      const result = boxLeftOf(box1, box2, undefined);

      // distance = 150 - 100 = 50
      // penalty = max(50 - 100, 0) + max(0 - 0, 0) = 0 + 0 = 0
      // But box1 extends BELOW box2, so:
      // max(box2.bottom - box1.bottom, 0) = max(50 - 100, 0) = 0
      // max(box1.top - box2.top, 0) = max(0 - 0, 0) = 0
      // So result = 50
      expect(result).toBe(50);
    });

    it('should add penalty for vertical misalignment (box1 extends above)', () => {
      // box1 is above box2
      const box1 = createRect(0, 0, 100, 50); // top = 0, bottom = 50
      const box2 = createRect(150, 20, 100, 50); // top = 20, bottom = 70

      const result = boxLeftOf(box1, box2, undefined);

      // distance = 150 - 100 = 50
      // penalty = max(70 - 50, 0) + max(0 - 20, 0) = max(20, 0) + max(-20, 0) = 20 + 0 = 20
      expect(result).toBe(50 + 20); // 70
    });

    it('should respect maxDistance constraint', () => {
      const box1 = createRect(0, 0, 100, 50);
      const box2 = createRect(200, 0, 100, 50);

      // Distance is 100, maxDistance is 50
      const result = boxLeftOf(box1, box2, 50);

      expect(result).toBeUndefined();
    });

    it('should return score when within maxDistance', () => {
      const box1 = createRect(0, 0, 100, 50);
      const box2 = createRect(120, 0, 100, 50);

      // Distance is 20, maxDistance is 50
      const result = boxLeftOf(box1, box2, 50);

      expect(result).toBe(20);
    });

    it('should return 0 when elements are touching', () => {
      const box1 = createRect(0, 0, 100, 50);
      const box2 = createRect(100, 0, 100, 50);

      const result = boxLeftOf(box1, box2, undefined);

      expect(result).toBe(0);
    });
  });

  describe('boxRightOf', () => {
    it('should return distance when element is directly to the right', () => {
      // box1 is at x=200, box2 is at x=0
      const box1 = createRect(200, 0, 100, 50);
      const box2 = createRect(0, 0, 100, 50);

      const result = boxRightOf(box1, box2, undefined);

      // box1.left (200) - box2.right (100) = 100
      expect(result).toBe(100);
    });

    it('should return undefined when element is not to the right', () => {
      // box1 is to the left of box2
      const box1 = createRect(0, 0, 100, 50);
      const box2 = createRect(200, 0, 100, 50);

      const result = boxRightOf(box1, box2, undefined);

      // box1.left (0) - box2.right (300) = -300
      expect(result).toBeUndefined();
    });

    it('should return undefined when overlapping', () => {
      const box1 = createRect(50, 0, 100, 50);
      const box2 = createRect(0, 0, 100, 50);

      const result = boxRightOf(box1, box2, undefined);

      // box1.left (50) - box2.right (100) = -50
      expect(result).toBeUndefined();
    });

    it('should add penalty for vertical misalignment', () => {
      // box1 is vertically offset from box2
      const box1 = createRect(200, 100, 100, 50); // top = 100, bottom = 150
      const box2 = createRect(0, 0, 100, 50); // top = 0, bottom = 50

      const result = boxRightOf(box1, box2, undefined);

      // distance = 200 - 100 = 100
      // penalty = max(50 - 150, 0) + max(100 - 0, 0) = 0 + 100 = 100
      expect(result).toBe(200);
    });

    it('should respect maxDistance constraint', () => {
      const box1 = createRect(200, 0, 100, 50);
      const box2 = createRect(0, 0, 100, 50);

      // Distance is 100, maxDistance is 50
      const result = boxRightOf(box1, box2, 50);

      expect(result).toBeUndefined();
    });

    it('should return 0 when elements are touching', () => {
      const box1 = createRect(100, 0, 100, 50);
      const box2 = createRect(0, 0, 100, 50);

      const result = boxRightOf(box1, box2, undefined);

      expect(result).toBe(0);
    });
  });

  describe('boxAbove', () => {
    it('should return distance when element is directly above', () => {
      // box1 is above box2
      const box1 = createRect(0, 0, 100, 50); // bottom = 50
      const box2 = createRect(0, 100, 100, 50); // top = 100

      const result = boxAbove(box1, box2, undefined);

      // box2.top (100) - box1.bottom (50) = 50
      expect(result).toBe(50);
    });

    it('should return undefined when element is not above', () => {
      // box1 is below box2
      const box1 = createRect(0, 100, 100, 50);
      const box2 = createRect(0, 0, 100, 50);

      const result = boxAbove(box1, box2, undefined);

      // box2.top (0) - box1.bottom (150) = -150
      expect(result).toBeUndefined();
    });

    it('should return undefined when overlapping vertically', () => {
      const box1 = createRect(0, 25, 100, 50);
      const box2 = createRect(0, 50, 100, 50);

      const result = boxAbove(box1, box2, undefined);

      // box2.top (50) - box1.bottom (75) = -25
      expect(result).toBeUndefined();
    });

    it('should add penalty for horizontal misalignment', () => {
      // box1 is horizontally offset from box2
      const box1 = createRect(200, 0, 100, 50); // left = 200, right = 300
      const box2 = createRect(0, 100, 100, 50); // left = 0, right = 100

      const result = boxAbove(box1, box2, undefined);

      // distance = 100 - 50 = 50
      // penalty = max(200 - 0, 0) + max(100 - 300, 0) = 200 + 0 = 200
      expect(result).toBe(250);
    });

    it('should respect maxDistance constraint', () => {
      const box1 = createRect(0, 0, 100, 50);
      const box2 = createRect(0, 200, 100, 50);

      // Distance is 150, maxDistance is 100
      const result = boxAbove(box1, box2, 100);

      expect(result).toBeUndefined();
    });

    it('should return 0 when elements are touching', () => {
      const box1 = createRect(0, 0, 100, 50);
      const box2 = createRect(0, 50, 100, 50);

      const result = boxAbove(box1, box2, undefined);

      expect(result).toBe(0);
    });
  });

  describe('boxBelow', () => {
    it('should return distance when element is directly below', () => {
      // box1 is below box2
      const box1 = createRect(0, 100, 100, 50); // top = 100
      const box2 = createRect(0, 0, 100, 50); // bottom = 50

      const result = boxBelow(box1, box2, undefined);

      // box1.top (100) - box2.bottom (50) = 50
      expect(result).toBe(50);
    });

    it('should return undefined when element is not below', () => {
      // box1 is above box2
      const box1 = createRect(0, 0, 100, 50);
      const box2 = createRect(0, 100, 100, 50);

      const result = boxBelow(box1, box2, undefined);

      // box1.top (0) - box2.bottom (150) = -150
      expect(result).toBeUndefined();
    });

    it('should return undefined when overlapping vertically', () => {
      const box1 = createRect(0, 50, 100, 50);
      const box2 = createRect(0, 25, 100, 50);

      const result = boxBelow(box1, box2, undefined);

      // box1.top (50) - box2.bottom (75) = -25
      expect(result).toBeUndefined();
    });

    it('should add penalty for horizontal misalignment', () => {
      // box1 is horizontally offset from box2
      const box1 = createRect(200, 100, 100, 50); // left = 200, right = 300
      const box2 = createRect(0, 0, 100, 50); // left = 0, right = 100

      const result = boxBelow(box1, box2, undefined);

      // distance = 100 - 50 = 50
      // penalty = max(200 - 0, 0) + max(100 - 300, 0) = 200 + 0 = 200
      expect(result).toBe(250);
    });

    it('should respect maxDistance constraint', () => {
      const box1 = createRect(0, 200, 100, 50);
      const box2 = createRect(0, 0, 100, 50);

      // Distance is 150, maxDistance is 100
      const result = boxBelow(box1, box2, 100);

      expect(result).toBeUndefined();
    });

    it('should return 0 when elements are touching', () => {
      const box1 = createRect(0, 50, 100, 50);
      const box2 = createRect(0, 0, 100, 50);

      const result = boxBelow(box1, box2, undefined);

      expect(result).toBe(0);
    });
  });

  describe('boxNear', () => {
    it('should return 0 for adjacent elements (touching)', () => {
      const box1 = createRect(0, 0, 100, 50);
      const box2 = createRect(100, 0, 100, 50);

      const result = boxNear(box1, box2, undefined);

      expect(result).toBe(0);
    });

    it('should return gap distance for nearby elements', () => {
      const box1 = createRect(0, 0, 100, 50);
      const box2 = createRect(120, 0, 100, 50); // 20px gap to the right

      const result = boxNear(box1, box2, undefined);

      expect(result).toBe(20);
    });

    it('should return undefined when elements exceed threshold', () => {
      const box1 = createRect(0, 0, 100, 50);
      const box2 = createRect(200, 0, 100, 50); // 100px gap

      const result = boxNear(box1, box2, undefined);

      // Default threshold is 50, gap is 100
      expect(result).toBeUndefined();
    });

    it('should use custom maxDistance threshold', () => {
      const box1 = createRect(0, 0, 100, 50);
      const box2 = createRect(200, 0, 100, 50); // 100px gap

      const result = boxNear(box1, box2, 150);

      expect(result).toBe(100);
    });

    it('should sum gaps from multiple directions', () => {
      // box1 and box2 are diagonal, with gaps in both x and y
      const box1 = createRect(0, 0, 100, 50);
      const box2 = createRect(110, 60, 100, 50); // 10px right, 10px down

      const result = boxNear(box1, box2, undefined);

      // x gap: 110 - 100 = 10
      // y gap: 60 - 50 = 10
      expect(result).toBe(20);
    });

    it('should return 0 for overlapping elements', () => {
      const box1 = createRect(0, 0, 100, 50);
      const box2 = createRect(50, 25, 100, 50);

      const result = boxNear(box1, box2, undefined);

      expect(result).toBe(0);
    });

    it('should handle diagonal elements within threshold', () => {
      const box1 = createRect(0, 0, 100, 100);
      const box2 = createRect(120, 120, 100, 100);

      // x gap: 120 - 100 = 20
      // y gap: 120 - 100 = 20
      const result = boxNear(box1, box2, undefined);

      expect(result).toBe(40);
    });

    it('should return undefined when diagonal distance exceeds threshold', () => {
      const box1 = createRect(0, 0, 100, 100);
      const box2 = createRect(130, 130, 100, 100);

      // x gap: 30, y gap: 30, total: 60 > 50 default threshold
      const result = boxNear(box1, box2, undefined);

      expect(result).toBeUndefined();
    });
  });

  describe('layoutSelectorScore', () => {
    it('should return score for single matching inner element', () => {
      container.innerHTML = `
        <div id="left" style="position: absolute; left: 0; top: 0; width: 100px; height: 50px;"></div>
        <div id="right" style="position: absolute; left: 200px; top: 0; width: 100px; height: 50px;"></div>
      `;

      const left = container.querySelector('#left')!;
      const right = container.querySelector('#right')!;

      mockBoundingRect(left, createRect(0, 0, 100, 50));
      mockBoundingRect(right, createRect(200, 0, 100, 50));

      const score = layoutSelectorScore('left-of', left, [right], undefined);

      // left is left-of right: box2.left (200) - box1.right (100) = 100
      expect(score).toBe(100);
    });

    it('should return best score among multiple inner elements', () => {
      container.innerHTML = `
        <div id="target"></div>
        <div id="ref1"></div>
        <div id="ref2"></div>
      `;

      const target = container.querySelector('#target')!;
      const ref1 = container.querySelector('#ref1')!;
      const ref2 = container.querySelector('#ref2')!;

      mockBoundingRect(target, createRect(0, 0, 100, 50));
      mockBoundingRect(ref1, createRect(200, 0, 100, 50)); // 100px gap
      mockBoundingRect(ref2, createRect(150, 0, 100, 50)); // 50px gap

      const score = layoutSelectorScore(
        'left-of',
        target,
        [ref1, ref2],
        undefined
      );

      // Should return best score (lowest), which is 50
      expect(score).toBe(50);
    });

    it('should return undefined when no inner elements match', () => {
      container.innerHTML = `
        <div id="target"></div>
        <div id="ref"></div>
      `;

      const target = container.querySelector('#target')!;
      const ref = container.querySelector('#ref')!;

      // target is to the right of ref, not left-of
      mockBoundingRect(target, createRect(200, 0, 100, 50));
      mockBoundingRect(ref, createRect(0, 0, 100, 50));

      const score = layoutSelectorScore('left-of', target, [ref], undefined);

      expect(score).toBeUndefined();
    });

    it('should skip element if it is the same as an inner element', () => {
      container.innerHTML = `<div id="target"></div>`;

      const target = container.querySelector('#target')!;
      mockBoundingRect(target, createRect(0, 0, 100, 50));

      const score = layoutSelectorScore('near', target, [target], undefined);

      expect(score).toBeUndefined();
    });

    it('should respect maxDistance constraint', () => {
      container.innerHTML = `
        <div id="target"></div>
        <div id="ref"></div>
      `;

      const target = container.querySelector('#target')!;
      const ref = container.querySelector('#ref')!;

      mockBoundingRect(target, createRect(0, 0, 100, 50));
      mockBoundingRect(ref, createRect(200, 0, 100, 50));

      // Distance is 100, maxDistance is 50
      const score = layoutSelectorScore('left-of', target, [ref], 50);

      expect(score).toBeUndefined();
    });
  });

  describe('Layout engines', () => {
    describe('createLayoutEngine', () => {
      it('should create engine with correct name', () => {
        const engine = createLayoutEngine('left-of');
        expect(engine.name).toBe('internal:left-of');
      });

      it('should query elements matching layout criteria', () => {
        container.innerHTML = `
          <div id="left"></div>
          <div id="right"></div>
          <div id="other"></div>
        `;

        const left = container.querySelector('#left')!;
        const right = container.querySelector('#right')!;
        const other = container.querySelector('#other')!;

        // Position left to the left of right
        mockBoundingRect(left, createRect(0, 0, 100, 50));
        mockBoundingRect(right, createRect(200, 0, 100, 50));
        // other is below, not left-of
        mockBoundingRect(other, createRect(0, 100, 100, 50));

        const engine = createLayoutEngine('left-of');
        const results = engine.queryAll(container, 'css=#right');

        // Only 'left' should be left-of 'right'
        expect(results).toContain(left);
        expect(results).not.toContain(right);
      });

      it('should return sorted results by score', () => {
        container.innerHTML = `
          <div id="close"></div>
          <div id="far"></div>
          <div id="ref"></div>
        `;

        const close = container.querySelector('#close')!;
        const far = container.querySelector('#far')!;
        const ref = container.querySelector('#ref')!;

        // close is 50px to the left of ref
        mockBoundingRect(close, createRect(0, 0, 100, 50));
        // far is 150px to the left of ref
        mockBoundingRect(far, createRect(-100, 0, 100, 50));
        // ref is the reference element
        mockBoundingRect(ref, createRect(150, 0, 100, 50));

        const engine = createLayoutEngine('left-of');
        const results = engine.queryAll(container, 'css=#ref');

        // Both should be in results, sorted by distance (close first)
        expect(results.indexOf(close)).toBeLessThan(results.indexOf(far));
      });

      it('should return empty array when no inner elements found', () => {
        container.innerHTML = `<div id="target"></div>`;

        const engine = createLayoutEngine('left-of');
        const results = engine.queryAll(container, 'css=#nonexistent');

        expect(results).toEqual([]);
      });

      it('should return first match with query()', () => {
        container.innerHTML = `
          <div id="first"></div>
          <div id="second"></div>
          <div id="ref"></div>
        `;

        const first = container.querySelector('#first')!;
        const second = container.querySelector('#second')!;
        const ref = container.querySelector('#ref')!;

        mockBoundingRect(first, createRect(0, 0, 100, 50));
        mockBoundingRect(second, createRect(-50, 0, 100, 50));
        mockBoundingRect(ref, createRect(150, 0, 100, 50));

        const engine = createLayoutEngine('left-of');
        const result = engine.query(container, 'css=#ref');

        // Should return the closest one (first, at distance 50)
        expect(result).toBe(first);
      });

      it('should return null when no matches with query()', () => {
        container.innerHTML = `
          <div id="right"></div>
          <div id="ref"></div>
        `;

        const right = container.querySelector('#right')!;
        const ref = container.querySelector('#ref')!;

        // right is to the right of ref, not left-of
        mockBoundingRect(right, createRect(300, 0, 100, 50));
        mockBoundingRect(ref, createRect(0, 0, 100, 50));

        const engine = createLayoutEngine('left-of');
        const result = engine.query(container, 'css=#ref');

        expect(result).toBeNull();
      });
    });

    describe('internal:left-of', () => {
      it('should find elements to the left of reference', () => {
        container.innerHTML = `
          <button id="left">Left</button>
          <input id="input" />
          <button id="right">Right</button>
        `;

        const leftBtn = container.querySelector('#left')!;
        const input = container.querySelector('#input')!;
        const rightBtn = container.querySelector('#right')!;

        mockBoundingRect(leftBtn, createRect(0, 0, 80, 30));
        mockBoundingRect(input, createRect(100, 0, 100, 30));
        mockBoundingRect(rightBtn, createRect(220, 0, 80, 30));

        const engine = layoutEngines['internal:left-of'];
        const results = engine.queryAll(container, 'css=#input');

        expect(results).toContain(leftBtn);
        expect(results).not.toContain(rightBtn);
        expect(results).not.toContain(input);
      });
    });

    describe('internal:right-of', () => {
      it('should find elements to the right of reference', () => {
        container.innerHTML = `
          <button id="left">Left</button>
          <input id="input" />
          <button id="right">Right</button>
        `;

        const leftBtn = container.querySelector('#left')!;
        const input = container.querySelector('#input')!;
        const rightBtn = container.querySelector('#right')!;

        mockBoundingRect(leftBtn, createRect(0, 0, 80, 30));
        mockBoundingRect(input, createRect(100, 0, 100, 30));
        mockBoundingRect(rightBtn, createRect(220, 0, 80, 30));

        const engine = layoutEngines['internal:right-of'];
        const results = engine.queryAll(container, 'css=#input');

        expect(results).toContain(rightBtn);
        expect(results).not.toContain(leftBtn);
        expect(results).not.toContain(input);
      });
    });

    describe('internal:above', () => {
      it('should find elements above reference', () => {
        container.innerHTML = `
          <div id="header">Header</div>
          <div id="main">Main</div>
          <div id="footer">Footer</div>
        `;

        const header = container.querySelector('#header')!;
        const main = container.querySelector('#main')!;
        const footer = container.querySelector('#footer')!;

        mockBoundingRect(header, createRect(0, 0, 200, 50));
        mockBoundingRect(main, createRect(0, 60, 200, 100));
        mockBoundingRect(footer, createRect(0, 170, 200, 50));

        const engine = layoutEngines['internal:above'];
        const results = engine.queryAll(container, 'css=#main');

        expect(results).toContain(header);
        expect(results).not.toContain(footer);
        expect(results).not.toContain(main);
      });
    });

    describe('internal:below', () => {
      it('should find elements below reference', () => {
        container.innerHTML = `
          <div id="header">Header</div>
          <div id="main">Main</div>
          <div id="footer">Footer</div>
        `;

        const header = container.querySelector('#header')!;
        const main = container.querySelector('#main')!;
        const footer = container.querySelector('#footer')!;

        mockBoundingRect(header, createRect(0, 0, 200, 50));
        mockBoundingRect(main, createRect(0, 60, 200, 100));
        mockBoundingRect(footer, createRect(0, 170, 200, 50));

        const engine = layoutEngines['internal:below'];
        const results = engine.queryAll(container, 'css=#main');

        expect(results).toContain(footer);
        expect(results).not.toContain(header);
        expect(results).not.toContain(main);
      });
    });

    describe('internal:near', () => {
      it('should find elements near reference', () => {
        container.innerHTML = `
          <div id="close">Close</div>
          <div id="ref">Reference</div>
          <div id="far">Far</div>
        `;

        const close = container.querySelector('#close')!;
        const ref = container.querySelector('#ref')!;
        const far = container.querySelector('#far')!;

        mockBoundingRect(close, createRect(0, 0, 100, 50));
        mockBoundingRect(ref, createRect(120, 0, 100, 50)); // 20px away
        mockBoundingRect(far, createRect(300, 0, 100, 50)); // 80px away (> 50 default)

        const engine = layoutEngines['internal:near'];
        const results = engine.queryAll(container, 'css=#ref');

        expect(results).toContain(close);
        expect(results).not.toContain(far);
        expect(results).not.toContain(ref);
      });

      it('should use custom maxDistance from selector', () => {
        container.innerHTML = `
          <div id="close">Close</div>
          <div id="ref">Reference</div>
          <div id="far">Far</div>
        `;

        const close = container.querySelector('#close')!;
        const ref = container.querySelector('#ref')!;
        const far = container.querySelector('#far')!;

        mockBoundingRect(close, createRect(0, 0, 100, 50));
        mockBoundingRect(ref, createRect(120, 0, 100, 50)); // 20px away
        mockBoundingRect(far, createRect(300, 0, 100, 50)); // 80px away

        const engine = layoutEngines['internal:near'];
        const results = engine.queryAll(container, 'css=#ref, 100');

        expect(results).toContain(close);
        expect(results).toContain(far); // Now within range
      });
    });

    describe('maxDistance parameter parsing', () => {
      it('should parse maxDistance from selector body', () => {
        container.innerHTML = `
          <div id="target"></div>
          <div id="ref"></div>
        `;

        const target = container.querySelector('#target')!;
        const ref = container.querySelector('#ref')!;

        mockBoundingRect(target, createRect(0, 0, 100, 50));
        mockBoundingRect(ref, createRect(200, 0, 100, 50)); // 100px away

        const engine = layoutEngines['internal:left-of'];

        // Without maxDistance, should match (default is Infinity for directional)
        const resultsNoMax = engine.queryAll(container, 'css=#ref');
        expect(resultsNoMax).toContain(target);

        // With maxDistance of 50, should not match
        const resultsWithMax = engine.queryAll(container, 'css=#ref, 50');
        expect(resultsWithMax).not.toContain(target);
      });

      it('should handle nested parentheses in inner selector', () => {
        container.innerHTML = `
          <div id="target"></div>
          <div id="ref" class="foo"></div>
        `;

        const target = container.querySelector('#target')!;
        const ref = container.querySelector('#ref')!;

        mockBoundingRect(target, createRect(0, 0, 100, 50));
        mockBoundingRect(ref, createRect(150, 0, 100, 50));

        const engine = layoutEngines['internal:left-of'];
        // Selector with brackets that contain commas
        const results = engine.queryAll(container, 'css=div[class="foo"], 100');

        expect(results).toContain(target);
      });
    });
  });

  describe('layoutEngines map', () => {
    it('should contain all layout engines', () => {
      expect(layoutEngines['internal:left-of']).toBeDefined();
      expect(layoutEngines['internal:right-of']).toBeDefined();
      expect(layoutEngines['internal:above']).toBeDefined();
      expect(layoutEngines['internal:below']).toBeDefined();
      expect(layoutEngines['internal:near']).toBeDefined();
    });

    it('should have correct engine names', () => {
      for (const [name, engine] of Object.entries(layoutEngines)) {
        expect(engine.name).toBe(name);
      }
    });
  });

  describe('kLayoutSelectorNames', () => {
    it('should contain all layout selector names', () => {
      expect(kLayoutSelectorNames).toContain('left-of');
      expect(kLayoutSelectorNames).toContain('right-of');
      expect(kLayoutSelectorNames).toContain('above');
      expect(kLayoutSelectorNames).toContain('below');
      expect(kLayoutSelectorNames).toContain('near');
      expect(kLayoutSelectorNames.length).toBe(5);
    });
  });

  describe('registerLayoutEngines', () => {
    it('should register all engines with the global registry', () => {
      // Already called in setup, verify engines are registered
      expect(selectorEngines.get('internal:left-of')).toBeDefined();
      expect(selectorEngines.get('internal:right-of')).toBeDefined();
      expect(selectorEngines.get('internal:above')).toBeDefined();
      expect(selectorEngines.get('internal:below')).toBeDefined();
      expect(selectorEngines.get('internal:near')).toBeDefined();
    });
  });

  describe('Integration with chained selectors', () => {
    it('should work with text selectors as inner selector', () => {
      container.innerHTML = `
        <label>Username</label>
        <input id="username" type="text" />
      `;

      const label = container.querySelector('label')!;
      const input = container.querySelector('input')!;

      mockBoundingRect(label, createRect(0, 0, 100, 20));
      mockBoundingRect(input, createRect(0, 30, 200, 30));

      const engine = layoutEngines['internal:below'];
      const results = engine.queryAll(container, 'css=label');

      expect(results).toContain(input);
    });
  });
});
