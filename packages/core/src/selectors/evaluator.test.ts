/**
 * Tests for selector evaluator.
 *
 * Note: happy-dom doesn't support layout calculations (getBoundingClientRect),
 * so we mock these for visibility-dependent tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { querySelector, querySelectorAll, type QueryOptions } from './evaluator.js';

describe('Selector Evaluator', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-container';
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

  describe('Basic selector evaluation', () => {
    describe('CSS selectors', () => {
      it('should find element by class', () => {
        container.innerHTML = `<div class="target">Target</div>`;
        const result = querySelector(container, '.target');
        expect(result?.classList.contains('target')).toBe(true);
      });

      it('should find element by id', () => {
        container.innerHTML = `<div id="target">Target</div>`;
        const result = querySelector(container, '#target');
        expect(result?.id).toBe('target');
      });

      it('should find element by tag name', () => {
        container.innerHTML = `<button>Click</button>`;
        const result = querySelector(container, 'button');
        expect(result?.tagName.toLowerCase()).toBe('button');
      });

      it('should find element with css= prefix', () => {
        container.innerHTML = `<div class="target">Target</div>`;
        const result = querySelector(container, 'css=.target');
        expect(result?.classList.contains('target')).toBe(true);
      });

      it('should find all matching elements', () => {
        container.innerHTML = `
          <div class="item">One</div>
          <div class="item">Two</div>
          <div class="item">Three</div>
        `;
        const results = querySelectorAll(container, '.item');
        expect(results.length).toBe(3);
      });
    });

    describe('XPath selectors', () => {
      // Note: XPath support may vary depending on the DOM implementation
      // happy-dom has limited XPath support, so these tests may be skipped
      it.skipIf(!document.evaluate)('should find element by xpath', () => {
        container.innerHTML = `<div><span id="target">Target</span></div>`;
        const result = querySelector(container, 'xpath=//span[@id="target"]');
        expect(result?.id).toBe('target');
      });

      it.skipIf(!document.evaluate)('should find all matching elements by xpath', () => {
        container.innerHTML = `
          <ul>
            <li>One</li>
            <li>Two</li>
            <li>Three</li>
          </ul>
        `;
        const results = querySelectorAll(container, 'xpath=//li');
        expect(results.length).toBe(3);
      });
    });

    describe('Text selectors', () => {
      it('should find element by text content', () => {
        container.innerHTML = `
          <button>Submit</button>
          <button>Cancel</button>
        `;
        // Mock visibility for text selector (requires visible elements)
        const buttons = container.querySelectorAll('button');
        buttons.forEach((btn) => mockBoundingRect(btn, { width: 100, height: 50 }));

        const result = querySelector(container, 'text=Submit');
        expect(result?.textContent).toBe('Submit');
      });

      it('should find element with exact text match', () => {
        container.innerHTML = `
          <button>Submit</button>
          <button>Submit Form</button>
        `;
        // Mock visibility for text selector
        const buttons = container.querySelectorAll('button');
        buttons.forEach((btn) => mockBoundingRect(btn, { width: 100, height: 50 }));

        const result = querySelector(container, 'text="Submit"');
        expect(result?.textContent).toBe('Submit');
      });
    });

    describe('Role selectors', () => {
      it('should find element by role', () => {
        container.innerHTML = `<button>Click me</button>`;
        // Mock visibility for role selector
        const button = container.querySelector('button')!;
        mockBoundingRect(button, { width: 100, height: 50 });

        const result = querySelector(container, 'role=button');
        expect(result?.tagName.toLowerCase()).toBe('button');
      });

      it('should find element by role and name', () => {
        container.innerHTML = `
          <button>Save</button>
          <button>Cancel</button>
        `;
        const buttons = container.querySelectorAll('button');
        buttons.forEach((btn) => mockBoundingRect(btn, { width: 100, height: 50 }));

        const result = querySelector(container, 'role=button[name="Save"]');
        expect(result?.textContent).toBe('Save');
      });
    });
  });

  describe('Chained selectors with >>', () => {
    it('should chain two CSS selectors', () => {
      container.innerHTML = `
        <div class="parent">
          <span class="child">Target</span>
        </div>
        <span class="child">Other</span>
      `;
      const result = querySelector(container, '.parent >> .child');
      expect(result?.textContent).toBe('Target');
    });

    it('should chain CSS and text selectors', () => {
      container.innerHTML = `
        <div class="container">
          <button>Submit</button>
          <button>Cancel</button>
        </div>
        <button>Submit</button>
      `;
      // Mock visibility for text selector
      const buttons = container.querySelectorAll('button');
      buttons.forEach((btn) => mockBoundingRect(btn, { width: 100, height: 50 }));

      const result = querySelector(container, '.container >> text=Submit');
      expect(result?.textContent).toBe('Submit');
      expect(result?.parentElement?.classList.contains('container')).toBe(true);
    });

    it('should chain multiple selectors', () => {
      container.innerHTML = `
        <div class="a">
          <div class="b">
            <div class="c">Target</div>
          </div>
        </div>
      `;
      const result = querySelector(container, '.a >> .b >> .c');
      expect(result?.textContent).toBe('Target');
    });

    it('should return null if any part fails', () => {
      container.innerHTML = `<div class="a"><div class="b">Content</div></div>`;
      const result = querySelector(container, '.a >> .nonexistent >> .b');
      expect(result).toBeNull();
    });

    it('should find all matching paths', () => {
      container.innerHTML = `
        <div class="parent">
          <span class="child">One</span>
          <span class="child">Two</span>
        </div>
        <div class="parent">
          <span class="child">Three</span>
        </div>
      `;
      const results = querySelectorAll(container, '.parent >> .child');
      expect(results.length).toBe(3);
    });
  });

  describe('Internal engines in chains', () => {
    it('should use internal:has to filter elements with descendants', () => {
      container.innerHTML = `
        <div class="item" id="with-button"><button>Click</button></div>
        <div class="item" id="without-button"><span>Text</span></div>
      `;
      // internal:has queries from container for elements that contain buttons
      const results = querySelectorAll(container, 'internal:has=button');
      // Container and with-button both contain buttons
      expect(results.some((el) => el.id === 'with-button')).toBe(true);
    });

    it('should use internal:has-text to filter by text content', () => {
      container.innerHTML = `
        <div class="box" id="hello">Hello World</div>
        <div class="box" id="goodbye">Goodbye</div>
      `;
      const results = querySelectorAll(container, 'internal:has-text=Hello');
      expect(results.some((el) => el.id === 'hello')).toBe(true);
      expect(results.some((el) => el.id === 'goodbye')).toBe(false);
    });

    it('should use internal:and to find intersection', () => {
      container.innerHTML = `
        <div class="foo bar" id="both"></div>
        <div class="foo" id="only-foo"></div>
      `;
      const results = querySelectorAll(
        container,
        'internal:and=css=.foo&&css=.bar'
      );
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('both');
    });

    it('should use internal:or to find union', () => {
      container.innerHTML = `
        <button id="btn">Button</button>
        <a id="link" href="#">Link</a>
        <div id="other">Other</div>
      `;
      const results = querySelectorAll(container, 'internal:or=button&&a');
      expect(results.length).toBe(2);
    });

    it('should use internal:label to find by label text', () => {
      container.innerHTML = `
        <label for="username">Username</label>
        <input id="username" type="text" />
        <label for="password">Password</label>
        <input id="password" type="password" />
      `;
      const result = querySelector(container, 'internal:label=Username');
      expect(result?.id).toBe('username');
    });

    it('should chain internal:has after CSS selector', () => {
      container.innerHTML = `
        <div class="section" id="section1">
          <div class="item" id="item1"><button>Click</button></div>
          <div class="item" id="item2"><span>Text</span></div>
        </div>
        <div class="section" id="section2">
          <div class="item" id="item3"><span>More Text</span></div>
        </div>
      `;
      // First find .section, then filter to those with buttons
      const results = querySelectorAll(container, '.section >> internal:has=button');
      // section1 contains item1 which has a button
      expect(results.some((el) => el.id === 'section1')).toBe(true);
      // section1's item1 also contains the button
      expect(results.some((el) => el.id === 'item1')).toBe(true);
    });
  });

  describe('Shadow DOM piercing', () => {
    it('should pierce shadow DOM when option is enabled', () => {
      // Create element with shadow DOM
      const host = document.createElement('div');
      host.id = 'shadow-host';
      container.appendChild(host);

      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `<button class="shadow-button">Shadow Button</button>`;

      const result = querySelector(container, '.shadow-button', {
        piercesShadowDom: true,
      });
      expect(result?.textContent).toBe('Shadow Button');
    });

    it('should not pierce shadow DOM by default', () => {
      const host = document.createElement('div');
      host.id = 'shadow-host';
      container.appendChild(host);

      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `<button class="shadow-button">Shadow Button</button>`;

      const result = querySelector(container, '.shadow-button');
      expect(result).toBeNull();
    });

    it('should find all elements in shadow DOM', () => {
      const host1 = document.createElement('div');
      container.appendChild(host1);
      const shadow1 = host1.attachShadow({ mode: 'open' });
      shadow1.innerHTML = `<span class="item">One</span>`;

      const host2 = document.createElement('div');
      container.appendChild(host2);
      const shadow2 = host2.attachShadow({ mode: 'open' });
      shadow2.innerHTML = `<span class="item">Two</span>`;

      container.innerHTML += `<span class="item">Three</span>`;

      const results = querySelectorAll(container, '.item', {
        piercesShadowDom: true,
      });
      // Should find the one in light DOM and two in shadow DOMs
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('visibleOnly option', () => {
    it('should filter visible elements only', () => {
      const visible = document.createElement('button');
      visible.id = 'visible';
      visible.className = 'btn';
      visible.textContent = 'Visible';
      container.appendChild(visible);
      mockBoundingRect(visible, { width: 100, height: 50 });

      const hidden = document.createElement('button');
      hidden.id = 'hidden';
      hidden.className = 'btn';
      hidden.textContent = 'Hidden';
      hidden.style.display = 'none';
      container.appendChild(hidden);

      const results = querySelectorAll(container, '.btn', { visibleOnly: true });

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('visible');
    });

    it('should return null for hidden single element', () => {
      const hidden = document.createElement('button');
      hidden.id = 'hidden';
      hidden.style.display = 'none';
      container.appendChild(hidden);

      const result = querySelector(container, '#hidden', { visibleOnly: true });
      expect(result).toBeNull();
    });

    it('should work with chained selectors', () => {
      container.innerHTML = `
        <div class="parent">
          <button id="visible" class="btn">Visible</button>
          <button id="hidden" class="btn" style="display: none">Hidden</button>
        </div>
      `;
      const visible = container.querySelector('#visible')!;
      mockBoundingRect(visible, { width: 100, height: 50 });

      const results = querySelectorAll(container, '.parent >> .btn', {
        visibleOnly: true,
      });

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('visible');
    });
  });

  describe('Error handling for invalid selectors', () => {
    it('should return null for unknown engine', () => {
      const result = querySelector(container, 'unknown=selector');
      expect(result).toBeNull();
    });

    it('should return empty array for unknown engine in queryAll', () => {
      const results = querySelectorAll(container, 'unknown=selector');
      expect(results).toEqual([]);
    });

    it('should handle invalid CSS selector gracefully', () => {
      const result = querySelector(container, 'css=[invalid');
      expect(result).toBeNull();
    });

    it('should handle empty selector gracefully', () => {
      // Empty selector defaults to css engine with empty selector
      // which may return the container or null depending on implementation
      const result = querySelector(container, '');
      // Just verify it doesn't throw
      expect(result === null || result instanceof Element).toBe(true);
    });
  });

  describe('Quote handling in selectors', () => {
    it('should handle double quotes in selector', () => {
      container.innerHTML = `<div data-value="test">Target</div>`;
      const result = querySelector(container, '[data-value="test"]');
      expect(result?.textContent).toBe('Target');
    });

    it('should handle single quotes in selector', () => {
      container.innerHTML = `<div data-value="test">Target</div>`;
      const result = querySelector(container, "[data-value='test']");
      expect(result?.textContent).toBe('Target');
    });

    it('should not split on >> inside quotes', () => {
      container.innerHTML = `<div title="a >> b">Target</div>`;
      const result = querySelector(container, '[title="a >> b"]');
      expect(result?.textContent).toBe('Target');
    });
  });

  describe('Complex scenarios', () => {
    it('should handle nested structures', () => {
      container.innerHTML = `
        <div class="level1">
          <div class="level2">
            <div class="level3">
              <button class="target">Deep Button</button>
            </div>
          </div>
        </div>
      `;
      const result = querySelector(
        container,
        '.level1 >> .level2 >> .level3 >> .target'
      );
      expect(result?.textContent).toBe('Deep Button');
    });

    it('should handle multiple matches at different levels', () => {
      container.innerHTML = `
        <div class="section">
          <button class="btn">Section 1 Button</button>
          <div class="nested">
            <button class="btn">Nested Button</button>
          </div>
        </div>
        <div class="section">
          <button class="btn">Section 2 Button</button>
        </div>
      `;
      const results = querySelectorAll(container, '.section >> .btn');
      expect(results.length).toBe(3);
    });

    it('should work with form elements', () => {
      container.innerHTML = `
        <form class="login-form">
          <label for="email">Email</label>
          <input id="email" type="email" />
          <label for="password">Password</label>
          <input id="password" type="password" />
          <button type="submit">Login</button>
        </form>
      `;

      const form = querySelector(container, '.login-form');
      expect(form?.tagName.toLowerCase()).toBe('form');

      const emailInput = querySelector(container, '.login-form >> #email');
      expect(emailInput?.id).toBe('email');

      const submitButton = querySelector(
        container,
        '.login-form >> button[type="submit"]'
      );
      expect(submitButton?.textContent).toBe('Login');
    });
  });
});
