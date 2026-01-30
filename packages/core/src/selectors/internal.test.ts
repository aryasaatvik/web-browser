/**
 * Tests for internal selector engines.
 *
 * Note: happy-dom doesn't support layout calculations (getBoundingClientRect),
 * so we mock these for visibility-dependent tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseTextSelectorBody,
  parseCompoundSelectorBody,
  createHasEngine,
  createHasNotEngine,
  createHasTextEngine,
  createHasNotTextEngine,
  createAndEngine,
  createOrEngine,
  createLabelEngine,
  createVisibleEngine,
  internalEngines,
  registerInternalEngines,
} from './internal.js';
import { selectorEngines } from './engine.js';
import { cssEngine } from './css.js';
import { textEngine } from './text.js';

// Ensure CSS and text engines are registered for nested selector tests
selectorEngines.register(cssEngine);
selectorEngines.register(textEngine);
registerInternalEngines();

describe('Internal Selector Engines', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

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

  describe('parseTextSelectorBody', () => {
    it('should parse plain text as substring match', () => {
      const result = parseTextSelectorBody('hello');
      expect(result).toEqual({
        text: 'hello',
        exact: false,
        regex: null,
      });
    });

    it('should parse double-quoted text as exact match', () => {
      const result = parseTextSelectorBody('"exact text"');
      expect(result).toEqual({
        text: 'exact text',
        exact: true,
        regex: null,
      });
    });

    it('should parse single-quoted text as exact match', () => {
      const result = parseTextSelectorBody("'exact text'");
      expect(result).toEqual({
        text: 'exact text',
        exact: true,
        regex: null,
      });
    });

    it('should parse regex pattern', () => {
      const result = parseTextSelectorBody('/hello\\s+world/');
      expect(result.text).toBe('hello\\s+world');
      expect(result.exact).toBe(false);
      expect(result.regex).toBeInstanceOf(RegExp);
      expect(result.regex?.source).toBe('hello\\s+world');
    });

    it('should parse regex pattern with flags', () => {
      const result = parseTextSelectorBody('/pattern/gi');
      expect(result.regex?.flags).toBe('gi');
    });

    it('should fall back to literal string for invalid regex', () => {
      // Invalid regex pattern with unbalanced parenthesis
      const result = parseTextSelectorBody('/(/');
      // Should not throw, should treat as literal text
      expect(result.text).toBe('/(/');
      expect(result.exact).toBe(false);
      expect(result.regex).toBe(null);
    });

    it('should fall back to literal string for invalid regex flags', () => {
      // Invalid flags
      const result = parseTextSelectorBody('/pattern/xyz');
      // 'xyz' are not valid regex flags, should fall through
      expect(result.text).toBe('/pattern/xyz');
      expect(result.exact).toBe(false);
      expect(result.regex).toBe(null);
    });
  });

  describe('parseCompoundSelectorBody', () => {
    it('should split on && at top level', () => {
      const result = parseCompoundSelectorBody('css=.foo&&css=.bar');
      expect(result).toEqual(['css=.foo', 'css=.bar']);
    });

    it('should handle multiple selectors', () => {
      const result = parseCompoundSelectorBody('css=a&&css=b&&css=c');
      expect(result).toEqual(['css=a', 'css=b', 'css=c']);
    });

    it('should preserve && inside quotes', () => {
      const result = parseCompoundSelectorBody('text="a&&b"&&css=.foo');
      expect(result).toEqual(['text="a&&b"', 'css=.foo']);
    });

    it('should handle empty body', () => {
      const result = parseCompoundSelectorBody('');
      expect(result).toEqual([]);
    });

    it('should handle whitespace', () => {
      const result = parseCompoundSelectorBody(' css=.foo && css=.bar ');
      expect(result).toEqual(['css=.foo', 'css=.bar']);
    });
  });

  describe('internal:has', () => {
    it('should find elements containing matching descendants', () => {
      container.innerHTML = `
        <div class="parent">
          <button>Click</button>
        </div>
        <div class="empty"></div>
      `;

      const engine = createHasEngine();
      const results = engine.queryAll(container, 'button');

      // Should find the parent that contains a button
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((el) => el.classList.contains('parent'))).toBe(true);
      expect(results.some((el) => el.classList.contains('empty'))).toBe(false);
    });

    it('should return empty when no descendant matches', () => {
      container.innerHTML = `<div class="empty"></div>`;

      const engine = createHasEngine();
      const results = engine.queryAll(container, 'button');

      // Container itself has no button children
      const nonContainerResults = results.filter((el) => el !== container);
      expect(
        nonContainerResults.filter((el) => el.querySelector('button'))
      ).toHaveLength(0);
    });

    it('should work with CSS selectors as body', () => {
      container.innerHTML = `
        <div id="with-class"><span class="highlight">Text</span></div>
        <div id="without-class"><span>Other</span></div>
      `;

      const engine = createHasEngine();
      const results = engine.queryAll(container, 'css=.highlight');

      expect(results.some((el) => el.id === 'with-class')).toBe(true);
    });

    it('should work with text selectors as body', () => {
      container.innerHTML = `
        <div id="has-hello"><span>Hello World</span></div>
        <div id="has-bye"><span>Goodbye</span></div>
      `;

      // Mock visibility for spans (text selector requires visible elements)
      const spans = container.querySelectorAll('span');
      spans.forEach((span) => mockBoundingRect(span, { width: 100, height: 20 }));

      const engine = createHasEngine();
      const results = engine.queryAll(container, 'text=Hello');

      expect(results.some((el) => el.id === 'has-hello')).toBe(true);
    });

    it('should find first matching element with query()', () => {
      container.innerHTML = `
        <div class="first"><button>A</button></div>
        <div class="second"><button>B</button></div>
      `;

      const engine = createHasEngine();
      const result = engine.query(container, 'button');

      expect(result).toBeTruthy();
    });
  });

  describe('internal:has-not', () => {
    it('should filter out elements with descendants', () => {
      container.innerHTML = `
        <div class="has-button"><button>Click</button></div>
        <div class="no-button"><span>Text</span></div>
      `;

      const engine = createHasNotEngine();
      const results = engine.queryAll(container, 'button');

      expect(results.some((el) => el.classList.contains('has-button'))).toBe(
        false
      );
      expect(results.some((el) => el.classList.contains('no-button'))).toBe(
        true
      );
    });

    it('should return all when no matches', () => {
      container.innerHTML = `
        <div class="a"><span>A</span></div>
        <div class="b"><span>B</span></div>
      `;

      const engine = createHasNotEngine();
      const results = engine.queryAll(container, 'button');

      // All elements have no button
      expect(results.length).toBeGreaterThan(0);
    });

    it('should work with various selector types', () => {
      container.innerHTML = `
        <div class="with-link"><a href="#">Link</a></div>
        <div class="no-link"><span>Text</span></div>
      `;

      const engine = createHasNotEngine();
      const results = engine.queryAll(container, 'a');

      expect(results.some((el) => el.classList.contains('with-link'))).toBe(
        false
      );
      expect(results.some((el) => el.classList.contains('no-link'))).toBe(true);
    });
  });

  describe('internal:has-text', () => {
    it('should match substring (default)', () => {
      container.innerHTML = `
        <div class="match">Hello World</div>
        <div class="no-match">Goodbye</div>
      `;

      const engine = createHasTextEngine();
      const results = engine.queryAll(container, 'Hello');

      expect(results.some((el) => el.classList.contains('match'))).toBe(true);
      expect(results.some((el) => el.classList.contains('no-match'))).toBe(
        false
      );
    });

    it('should be case-insensitive for substring match', () => {
      container.innerHTML = `<div class="match">HELLO WORLD</div>`;

      const engine = createHasTextEngine();
      const results = engine.queryAll(container, 'hello');

      expect(results.some((el) => el.classList.contains('match'))).toBe(true);
    });

    it('should match exact text with quotes', () => {
      container.innerHTML = `
        <div class="exact">Submit</div>
        <div class="partial">Submit Form</div>
      `;

      const engine = createHasTextEngine();
      const results = engine.queryAll(container, '"Submit"');

      expect(results.some((el) => el.classList.contains('exact'))).toBe(true);
      expect(results.some((el) => el.classList.contains('partial'))).toBe(
        false
      );
    });

    it('should match regex pattern', () => {
      container.innerHTML = `
        <div class="match">Item 123</div>
        <div class="no-match">Item ABC</div>
      `;

      const engine = createHasTextEngine();
      const results = engine.queryAll(container, '/Item \\d+/');

      expect(results.some((el) => el.classList.contains('match'))).toBe(true);
      expect(results.some((el) => el.classList.contains('no-match'))).toBe(
        false
      );
    });

    it('should normalize whitespace', () => {
      container.innerHTML = `<div class="match">Hello   World</div>`;

      const engine = createHasTextEngine();
      const results = engine.queryAll(container, 'Hello World');

      expect(results.some((el) => el.classList.contains('match'))).toBe(true);
    });
  });

  describe('internal:has-not-text', () => {
    it('should filter out elements matching text', () => {
      container.innerHTML = `
        <div class="match">Hello World</div>
        <div class="no-match">Goodbye</div>
      `;

      const engine = createHasNotTextEngine();
      const results = engine.queryAll(container, 'Hello');

      expect(results.some((el) => el.classList.contains('match'))).toBe(false);
      expect(results.some((el) => el.classList.contains('no-match'))).toBe(
        true
      );
    });

    it('should return non-matching elements', () => {
      container.innerHTML = `
        <div class="a">Apple</div>
        <div class="b">Banana</div>
      `;

      const engine = createHasNotTextEngine();
      const results = engine.queryAll(container, 'Apple');

      expect(results.some((el) => el.classList.contains('a'))).toBe(false);
      expect(results.some((el) => el.classList.contains('b'))).toBe(true);
    });
  });

  describe('internal:and', () => {
    it('should find intersection of two CSS selectors', () => {
      container.innerHTML = `
        <div class="foo bar" id="both"></div>
        <div class="foo" id="only-foo"></div>
        <div class="bar" id="only-bar"></div>
      `;

      const engine = createAndEngine();
      const results = engine.queryAll(container, 'css=.foo&&css=.bar');

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('both');
    });

    it('should find intersection of multiple selectors', () => {
      container.innerHTML = `
        <div class="a b c" id="all"></div>
        <div class="a b" id="ab"></div>
        <div class="a" id="a"></div>
      `;

      const engine = createAndEngine();
      const results = engine.queryAll(container, 'css=.a&&css=.b&&css=.c');

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('all');
    });

    it('should return empty when no intersection', () => {
      container.innerHTML = `
        <div class="foo" id="foo"></div>
        <div class="bar" id="bar"></div>
      `;

      const engine = createAndEngine();
      const results = engine.queryAll(container, 'css=.foo&&css=.bar');

      expect(results.length).toBe(0);
    });

    it('should preserve order', () => {
      container.innerHTML = `
        <div class="foo bar" id="first"></div>
        <div class="foo bar" id="second"></div>
      `;

      const engine = createAndEngine();
      const results = engine.queryAll(container, 'css=.foo&&css=.bar');

      expect(results.length).toBe(2);
      expect(results[0].id).toBe('first');
      expect(results[1].id).toBe('second');
    });
  });

  describe('internal:or', () => {
    it('should find union of two selectors', () => {
      container.innerHTML = `
        <button id="btn">Button</button>
        <a id="link" href="#">Link</a>
        <div id="other">Other</div>
      `;

      const engine = createOrEngine();
      const results = engine.queryAll(container, 'button&&a');

      expect(results.length).toBe(2);
      expect(results.some((el) => el.id === 'btn')).toBe(true);
      expect(results.some((el) => el.id === 'link')).toBe(true);
    });

    it('should preserve DOM order', () => {
      container.innerHTML = `
        <a id="first" href="#">First</a>
        <button id="second">Second</button>
        <a id="third" href="#">Third</a>
      `;

      const engine = createOrEngine();
      const results = engine.queryAll(container, 'button&&a');

      expect(results.length).toBe(3);
      expect(results[0].id).toBe('first');
      expect(results[1].id).toBe('second');
      expect(results[2].id).toBe('third');
    });

    it('should deduplicate matches', () => {
      container.innerHTML = `
        <button class="primary" id="btn">Button</button>
      `;

      const engine = createOrEngine();
      // Both selectors match the same element
      const results = engine.queryAll(container, 'button&&css=.primary');

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('btn');
    });

    it('should return first in DOM order with query()', () => {
      container.innerHTML = `
        <a id="first" href="#">First</a>
        <button id="second">Second</button>
      `;

      const engine = createOrEngine();
      const result = engine.query(container, 'button&&a');

      expect(result?.id).toBe('first');
    });
  });

  describe('internal:label', () => {
    it('should find input by label with for attribute', () => {
      container.innerHTML = `
        <label for="username">Username</label>
        <input id="username" type="text" />
      `;

      const engine = createLabelEngine();
      const results = engine.queryAll(container, 'Username');

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('username');
    });

    it('should find input by wrapping label', () => {
      container.innerHTML = `
        <label>
          Password
          <input id="password" type="password" />
        </label>
      `;

      const engine = createLabelEngine();
      const results = engine.queryAll(container, 'Password');

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('password');
    });

    it('should find element by aria-labelledby', () => {
      container.innerHTML = `
        <span id="email-label">Email Address</span>
        <input id="email" type="email" aria-labelledby="email-label" />
      `;

      const engine = createLabelEngine();
      const results = engine.queryAll(container, 'Email Address');

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('email');
    });

    it('should support exact matching with quotes', () => {
      container.innerHTML = `
        <label for="exact">Username</label>
        <input id="exact" type="text" />
        <label for="partial">Username Field</label>
        <input id="partial" type="text" />
      `;

      const engine = createLabelEngine();
      const results = engine.queryAll(container, '"Username"');

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('exact');
    });

    it('should be case-insensitive for substring matching', () => {
      container.innerHTML = `
        <label for="user">USERNAME</label>
        <input id="user" type="text" />
      `;

      const engine = createLabelEngine();
      const results = engine.queryAll(container, 'username');

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('user');
    });
  });

  describe('internal:visible', () => {
    it('should filter visible elements', () => {
      const visible = document.createElement('button');
      visible.id = 'visible';
      visible.textContent = 'Visible';
      container.appendChild(visible);
      mockBoundingRect(visible, { width: 100, height: 50 });

      const hidden = document.createElement('button');
      hidden.id = 'hidden';
      hidden.textContent = 'Hidden';
      hidden.style.display = 'none';
      container.appendChild(hidden);

      const engine = createVisibleEngine();
      const results = engine.queryAll(container, '');

      expect(results.some((el) => el.id === 'visible')).toBe(true);
      expect(results.some((el) => el.id === 'hidden')).toBe(false);
    });

    it('should filter out elements with visibility:hidden', () => {
      const visible = document.createElement('div');
      visible.id = 'visible';
      container.appendChild(visible);
      mockBoundingRect(visible, { width: 100, height: 50 });

      const hidden = document.createElement('div');
      hidden.id = 'hidden';
      hidden.style.visibility = 'hidden';
      container.appendChild(hidden);
      mockBoundingRect(hidden, { width: 100, height: 50 });

      const engine = createVisibleEngine();
      const results = engine.queryAll(container, '');

      expect(results.some((el) => el.id === 'visible')).toBe(true);
      expect(results.some((el) => el.id === 'hidden')).toBe(false);
    });

    it('should filter out elements with opacity:0', () => {
      const visible = document.createElement('div');
      visible.id = 'visible';
      container.appendChild(visible);
      mockBoundingRect(visible, { width: 100, height: 50 });

      const hidden = document.createElement('div');
      hidden.id = 'hidden';
      hidden.style.opacity = '0';
      container.appendChild(hidden);
      mockBoundingRect(hidden, { width: 100, height: 50 });

      const engine = createVisibleEngine();
      const results = engine.queryAll(container, '');

      expect(results.some((el) => el.id === 'visible')).toBe(true);
      expect(results.some((el) => el.id === 'hidden')).toBe(false);
    });
  });

  describe('internalEngines map', () => {
    it('should contain all internal engines', () => {
      expect(internalEngines['internal:has']).toBeDefined();
      expect(internalEngines['internal:has-not']).toBeDefined();
      expect(internalEngines['internal:has-text']).toBeDefined();
      expect(internalEngines['internal:has-not-text']).toBeDefined();
      expect(internalEngines['internal:and']).toBeDefined();
      expect(internalEngines['internal:or']).toBeDefined();
      expect(internalEngines['internal:label']).toBeDefined();
      expect(internalEngines['internal:visible']).toBeDefined();
    });

    it('should have correct engine names', () => {
      for (const [name, engine] of Object.entries(internalEngines)) {
        expect(engine.name).toBe(name);
      }
    });
  });

  describe('registerInternalEngines', () => {
    it('should register all engines with the global registry', () => {
      // Already called in setup, verify engines are registered
      expect(selectorEngines.get('internal:has')).toBeDefined();
      expect(selectorEngines.get('internal:has-not')).toBeDefined();
      expect(selectorEngines.get('internal:has-text')).toBeDefined();
      expect(selectorEngines.get('internal:has-not-text')).toBeDefined();
      expect(selectorEngines.get('internal:and')).toBeDefined();
      expect(selectorEngines.get('internal:or')).toBeDefined();
      expect(selectorEngines.get('internal:label')).toBeDefined();
      expect(selectorEngines.get('internal:visible')).toBeDefined();
    });
  });
});
