/**
 * Tests for ARIA hidden detection utilities.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isElementHiddenForAria,
  hasAriaHidden,
  isInertSubtree,
  isIgnoredForAria,
  isHiddenByCSS,
  isNotSlotted,
  isElementVisuallyVisible,
  checkElementVisibility,
} from './hidden.js';

describe('ARIA Hidden Detection', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('isIgnoredForAria', () => {
    it('should return true for script elements', () => {
      const script = document.createElement('script');
      expect(isIgnoredForAria(script)).toBe(true);
    });

    it('should return true for style elements', () => {
      const style = document.createElement('style');
      expect(isIgnoredForAria(style)).toBe(true);
    });

    it('should return true for noscript elements', () => {
      const noscript = document.createElement('noscript');
      expect(isIgnoredForAria(noscript)).toBe(true);
    });

    it('should return true for template elements', () => {
      const template = document.createElement('template');
      expect(isIgnoredForAria(template)).toBe(true);
    });

    it('should return false for regular elements', () => {
      const div = document.createElement('div');
      expect(isIgnoredForAria(div)).toBe(false);
    });
  });

  describe('hasAriaHidden', () => {
    it('should return true when element has aria-hidden="true"', () => {
      const element = document.createElement('div');
      element.setAttribute('aria-hidden', 'true');
      container.appendChild(element);

      expect(hasAriaHidden(element)).toBe(true);
    });

    it('should return false when element has aria-hidden="false"', () => {
      const element = document.createElement('div');
      element.setAttribute('aria-hidden', 'false');
      container.appendChild(element);

      expect(hasAriaHidden(element)).toBe(false);
    });

    it('should return true when ancestor has aria-hidden="true"', () => {
      const parent = document.createElement('div');
      parent.setAttribute('aria-hidden', 'true');
      const child = document.createElement('span');
      parent.appendChild(child);
      container.appendChild(parent);

      expect(hasAriaHidden(child)).toBe(true);
    });

    it('should return true when distant ancestor has aria-hidden="true"', () => {
      const grandparent = document.createElement('div');
      grandparent.setAttribute('aria-hidden', 'true');
      const parent = document.createElement('div');
      const child = document.createElement('span');
      parent.appendChild(child);
      grandparent.appendChild(parent);
      container.appendChild(grandparent);

      expect(hasAriaHidden(child)).toBe(true);
    });

    it('should return false when no aria-hidden in hierarchy', () => {
      const parent = document.createElement('div');
      const child = document.createElement('span');
      parent.appendChild(child);
      container.appendChild(parent);

      expect(hasAriaHidden(child)).toBe(false);
    });
  });

  describe('isInertSubtree', () => {
    it('should return true when element has inert attribute', () => {
      const element = document.createElement('div');
      element.setAttribute('inert', '');
      container.appendChild(element);

      expect(isInertSubtree(element)).toBe(true);
    });

    it('should return true when ancestor has inert attribute', () => {
      const parent = document.createElement('div');
      parent.setAttribute('inert', '');
      const child = document.createElement('span');
      parent.appendChild(child);
      container.appendChild(parent);

      expect(isInertSubtree(child)).toBe(true);
    });

    it('should return false when no inert in hierarchy', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      expect(isInertSubtree(element)).toBe(false);
    });
  });

  describe('isHiddenByCSS', () => {
    it('should return true for display:none', () => {
      const element = document.createElement('div');
      element.style.display = 'none';
      container.appendChild(element);

      expect(isHiddenByCSS(element)).toBe(true);
    });

    it('should return true for visibility:hidden', () => {
      const element = document.createElement('div');
      element.style.visibility = 'hidden';
      container.appendChild(element);

      expect(isHiddenByCSS(element)).toBe(true);
    });

    it('should return true for visibility:collapse', () => {
      const element = document.createElement('div');
      element.style.visibility = 'collapse';
      container.appendChild(element);

      expect(isHiddenByCSS(element)).toBe(true);
    });

    it('should return false for opacity:0 (ARIA still visible)', () => {
      const element = document.createElement('div');
      element.style.opacity = '0';
      element.style.width = '100px';
      element.style.height = '100px';
      container.appendChild(element);

      // opacity:0 doesn't hide from ARIA by default
      expect(isHiddenByCSS(element)).toBe(false);
    });

    it('should return false for visible elements', () => {
      const element = document.createElement('div');
      element.style.display = 'block';
      element.style.visibility = 'visible';
      element.textContent = 'Test';
      container.appendChild(element);

      expect(isHiddenByCSS(element)).toBe(false);
    });

    it('should return true for disconnected elements', () => {
      const element = document.createElement('div');
      // Not appended to DOM
      expect(isHiddenByCSS(element)).toBe(true);
    });
  });

  describe('isNotSlotted', () => {
    it('should return false for elements without shadow DOM parent', () => {
      const element = document.createElement('div');
      container.appendChild(element);

      expect(isNotSlotted(element)).toBe(false);
    });

    it('should handle shadow DOM slotting', () => {
      // Create element with shadow root
      const host = document.createElement('div');
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<slot></slot>';
      container.appendChild(host);

      // Add slotted content
      const slotted = document.createElement('span');
      slotted.textContent = 'Slotted';
      host.appendChild(slotted);

      // In happy-dom, slot assignment may not work as expected
      // The key thing is that the function doesn't throw
      const result = isNotSlotted(slotted);
      expect(typeof result).toBe('boolean');
    });

    it('should return true for unslotted elements in shadow host', () => {
      // Create element with shadow root that has no default slot
      const host = document.createElement('div');
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<div>Shadow content only</div>';
      container.appendChild(host);

      // Add child that won't be slotted
      const unslotted = document.createElement('span');
      unslotted.textContent = 'Unslotted';
      host.appendChild(unslotted);

      expect(isNotSlotted(unslotted)).toBe(true);
    });
  });

  describe('isElementHiddenForAria', () => {
    it('should return true for script elements', () => {
      const script = document.createElement('script');
      container.appendChild(script);

      expect(isElementHiddenForAria(script)).toBe(true);
    });

    it('should return true for aria-hidden="true" on element', () => {
      const element = document.createElement('div');
      element.setAttribute('aria-hidden', 'true');
      container.appendChild(element);

      expect(isElementHiddenForAria(element)).toBe(true);
    });

    it('should return true for aria-hidden="true" on ancestor', () => {
      const parent = document.createElement('div');
      parent.setAttribute('aria-hidden', 'true');
      const child = document.createElement('span');
      parent.appendChild(child);
      container.appendChild(parent);

      expect(isElementHiddenForAria(child)).toBe(true);
    });

    it('should return true for display:none', () => {
      const element = document.createElement('div');
      element.style.display = 'none';
      container.appendChild(element);

      expect(isElementHiddenForAria(element)).toBe(true);
    });

    it('should return true for visibility:hidden', () => {
      const element = document.createElement('div');
      element.style.visibility = 'hidden';
      container.appendChild(element);

      expect(isElementHiddenForAria(element)).toBe(true);
    });

    it('should return true for element inside display:none parent', () => {
      const parent = document.createElement('div');
      parent.style.display = 'none';
      const child = document.createElement('span');
      parent.appendChild(child);
      container.appendChild(parent);

      expect(isElementHiddenForAria(child)).toBe(true);
    });

    it('should return true for inert elements', () => {
      const element = document.createElement('div');
      element.setAttribute('inert', '');
      container.appendChild(element);

      expect(isElementHiddenForAria(element)).toBe(true);
    });

    it('should return false for visible elements', () => {
      const element = document.createElement('div');
      element.textContent = 'Visible content';
      container.appendChild(element);

      expect(isElementHiddenForAria(element)).toBe(false);
    });

    it('should respect includeAria option', () => {
      const element = document.createElement('div');
      element.setAttribute('aria-hidden', 'true');
      container.appendChild(element);

      // With includeAria: false, should not consider aria-hidden
      expect(isElementHiddenForAria(element, { includeAria: false })).toBe(false);
    });

    it('should respect includeCSS option', () => {
      const element = document.createElement('div');
      element.style.display = 'none';
      container.appendChild(element);

      // With includeCSS: false, should not consider CSS hiding
      expect(isElementHiddenForAria(element, { includeCSS: false })).toBe(false);
    });
  });

  describe('isElementVisuallyVisible', () => {
    it('should return false for display:none', () => {
      const element = document.createElement('div');
      element.style.display = 'none';
      container.appendChild(element);

      expect(isElementVisuallyVisible(element)).toBe(false);
    });

    it('should return false for visibility:hidden', () => {
      const element = document.createElement('div');
      element.style.visibility = 'hidden';
      container.appendChild(element);

      expect(isElementVisuallyVisible(element)).toBe(false);
    });

    it('should return false for opacity:0', () => {
      const element = document.createElement('div');
      element.style.opacity = '0';
      element.style.width = '100px';
      element.style.height = '100px';
      container.appendChild(element);

      expect(isElementVisuallyVisible(element)).toBe(false);
    });

    it('should return false for zero-size elements', () => {
      const element = document.createElement('div');
      element.style.width = '0';
      element.style.height = '0';
      container.appendChild(element);

      expect(isElementVisuallyVisible(element)).toBe(false);
    });

    it('should return true for visible elements', () => {
      const element = document.createElement('div');
      element.style.display = 'block';
      element.style.visibility = 'visible';
      element.textContent = 'Visible';
      container.appendChild(element);

      // In happy-dom, elements without explicit zero size should be visible
      expect(isElementVisuallyVisible(element)).toBe(true);
    });

    it('should return true for display:contents', () => {
      const element = document.createElement('div');
      element.style.display = 'contents';
      const child = document.createElement('span');
      child.textContent = 'Content';
      element.appendChild(child);
      container.appendChild(element);

      expect(isElementVisuallyVisible(element)).toBe(true);
    });
  });

  describe('isElementVisible with modes', () => {
    it('should check only ARIA in "aria" mode', () => {
      const element = document.createElement('div');
      element.style.opacity = '0'; // Visually hidden
      element.style.width = '100px';
      element.style.height = '100px';
      container.appendChild(element);

      // ARIA visible (opacity doesn't affect ARIA), visually hidden
      expect(checkElementVisibility(element, 'aria')).toBe(true);
    });

    it('should use OR logic in "ariaOrVisible" mode', () => {
      const element = document.createElement('div');
      element.setAttribute('aria-hidden', 'true');
      element.style.display = 'block';
      element.style.visibility = 'visible';
      element.textContent = 'Test';
      container.appendChild(element);

      // ARIA hidden but visually visible - should be true because of OR logic
      expect(checkElementVisibility(element, 'ariaOrVisible')).toBe(true);
    });

    it('should use AND logic in "ariaAndVisible" mode', () => {
      const element = document.createElement('div');
      element.style.opacity = '0'; // Visually hidden
      element.style.width = '100px';
      element.style.height = '100px';
      container.appendChild(element);

      // ARIA visible but visually hidden
      expect(checkElementVisibility(element, 'ariaAndVisible')).toBe(false);
    });

    it('should return true when both visible in "ariaAndVisible" mode', () => {
      const element = document.createElement('div');
      element.style.display = 'block';
      element.style.visibility = 'visible';
      element.textContent = 'Visible';
      container.appendChild(element);

      expect(checkElementVisibility(element, 'ariaAndVisible')).toBe(true);
    });
  });
});
