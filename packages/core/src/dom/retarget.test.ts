/**
 * Tests for element retargeting utilities.
 *
 * These tests verify that interactions with elements are properly
 * retargeted to their logical targets (e.g., clicking a label
 * should target its associated input).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  retarget,
  getLabelTarget,
  getInteractiveAncestor,
  getInteractiveAncestorWithCheckbox,
  isFormControl,
  isLabelElement,
  isInteractiveElement,
  isInputLike,
  isActionTarget,
  type RetargetBehavior,
} from './retarget.js';

describe('Element Retargeting', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('isFormControl', () => {
    it('should return true for input element', () => {
      const input = document.createElement('input');
      expect(isFormControl(input)).toBe(true);
    });

    it('should return true for textarea element', () => {
      const textarea = document.createElement('textarea');
      expect(isFormControl(textarea)).toBe(true);
    });

    it('should return true for select element', () => {
      const select = document.createElement('select');
      expect(isFormControl(select)).toBe(true);
    });

    it('should return true for button element', () => {
      const button = document.createElement('button');
      expect(isFormControl(button)).toBe(true);
    });

    it('should return false for div element', () => {
      const div = document.createElement('div');
      expect(isFormControl(div)).toBe(false);
    });

    it('should return false for span element', () => {
      const span = document.createElement('span');
      expect(isFormControl(span)).toBe(false);
    });

    it('should return false for anchor element', () => {
      const anchor = document.createElement('a');
      expect(isFormControl(anchor)).toBe(false);
    });
  });

  describe('isLabelElement', () => {
    it('should return true for label element', () => {
      const label = document.createElement('label');
      expect(isLabelElement(label)).toBe(true);
    });

    it('should return false for div element', () => {
      const div = document.createElement('div');
      expect(isLabelElement(div)).toBe(false);
    });

    it('should return false for span element', () => {
      const span = document.createElement('span');
      expect(isLabelElement(span)).toBe(false);
    });
  });

  describe('isInteractiveElement', () => {
    it('should return true for button element', () => {
      const button = document.createElement('button');
      expect(isInteractiveElement(button)).toBe(true);
    });

    it('should return true for anchor with href', () => {
      const anchor = document.createElement('a');
      anchor.href = '/home';
      expect(isInteractiveElement(anchor)).toBe(true);
    });

    it('should return false for anchor without href', () => {
      const anchor = document.createElement('a');
      expect(isInteractiveElement(anchor)).toBe(false);
    });

    it('should return true for element with role="button"', () => {
      const div = document.createElement('div');
      div.setAttribute('role', 'button');
      expect(isInteractiveElement(div)).toBe(true);
    });

    it('should return true for element with role="link"', () => {
      const div = document.createElement('div');
      div.setAttribute('role', 'link');
      expect(isInteractiveElement(div)).toBe(true);
    });

    it('should return true for element with role="checkbox"', () => {
      const div = document.createElement('div');
      div.setAttribute('role', 'checkbox');
      expect(isInteractiveElement(div)).toBe(true);
    });

    it('should return true for element with role="radio"', () => {
      const div = document.createElement('div');
      div.setAttribute('role', 'radio');
      expect(isInteractiveElement(div)).toBe(true);
    });

    it('should return false for div element', () => {
      const div = document.createElement('div');
      expect(isInteractiveElement(div)).toBe(false);
    });

    it('should return false for input element', () => {
      const input = document.createElement('input');
      expect(isInteractiveElement(input)).toBe(false);
    });
  });

  describe('isInputLike', () => {
    it('should return true for input element', () => {
      const input = document.createElement('input');
      expect(isInputLike(input)).toBe(true);
    });

    it('should return true for textarea element', () => {
      const textarea = document.createElement('textarea');
      expect(isInputLike(textarea)).toBe(true);
    });

    it('should return true for select element', () => {
      const select = document.createElement('select');
      expect(isInputLike(select)).toBe(true);
    });

    it('should return true for contenteditable element', () => {
      const div = document.createElement('div');
      div.contentEditable = 'true';
      expect(isInputLike(div)).toBe(true);
    });

    it('should return false for button element', () => {
      const button = document.createElement('button');
      expect(isInputLike(button)).toBe(false);
    });

    it('should return false for div element', () => {
      const div = document.createElement('div');
      expect(isInputLike(div)).toBe(false);
    });
  });

  describe('isActionTarget', () => {
    it('should return true for anchor element', () => {
      const anchor = document.createElement('a');
      expect(isActionTarget(anchor)).toBe(true);
    });

    it('should return true for button element', () => {
      const button = document.createElement('button');
      expect(isActionTarget(button)).toBe(true);
    });

    it('should return true for input element', () => {
      const input = document.createElement('input');
      expect(isActionTarget(input)).toBe(true);
    });

    it('should return true for textarea element', () => {
      const textarea = document.createElement('textarea');
      expect(isActionTarget(textarea)).toBe(true);
    });

    it('should return true for select element', () => {
      const select = document.createElement('select');
      expect(isActionTarget(select)).toBe(true);
    });

    it('should return true for contenteditable element', () => {
      const div = document.createElement('div');
      div.contentEditable = 'true';
      expect(isActionTarget(div)).toBe(true);
    });

    it('should return true for element with role="button"', () => {
      const div = document.createElement('div');
      div.setAttribute('role', 'button');
      expect(isActionTarget(div)).toBe(true);
    });

    it('should return true for element with role="link"', () => {
      const div = document.createElement('div');
      div.setAttribute('role', 'link');
      expect(isActionTarget(div)).toBe(true);
    });

    it('should return true for element with role="checkbox"', () => {
      const div = document.createElement('div');
      div.setAttribute('role', 'checkbox');
      expect(isActionTarget(div)).toBe(true);
    });

    it('should return true for element with role="radio"', () => {
      const div = document.createElement('div');
      div.setAttribute('role', 'radio');
      expect(isActionTarget(div)).toBe(true);
    });

    it('should return false for div element', () => {
      const div = document.createElement('div');
      expect(isActionTarget(div)).toBe(false);
    });
  });

  describe('getLabelTarget', () => {
    it('should return target for label with for attribute', () => {
      container.innerHTML = `
        <label for="email">Email:</label>
        <input id="email" type="email">
      `;
      const label = container.querySelector('label') as HTMLLabelElement;
      const input = container.querySelector('input') as HTMLInputElement;

      expect(getLabelTarget(label)).toBe(input);
    });

    it('should return input wrapped inside label', () => {
      container.innerHTML = `
        <label>Username: <input type="text"></label>
      `;
      const label = container.querySelector('label') as HTMLLabelElement;
      const input = container.querySelector('input') as HTMLInputElement;

      expect(getLabelTarget(label)).toBe(input);
    });

    it('should return textarea wrapped inside label', () => {
      container.innerHTML = `
        <label>Description: <textarea></textarea></label>
      `;
      const label = container.querySelector('label') as HTMLLabelElement;
      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;

      expect(getLabelTarget(label)).toBe(textarea);
    });

    it('should return select wrapped inside label', () => {
      container.innerHTML = `
        <label>Country: <select><option>USA</option></select></label>
      `;
      const label = container.querySelector('label') as HTMLLabelElement;
      const select = container.querySelector('select') as HTMLSelectElement;

      expect(getLabelTarget(label)).toBe(select);
    });

    it('should return button wrapped inside label', () => {
      container.innerHTML = `
        <label>Action: <button>Click</button></label>
      `;
      const label = container.querySelector('label') as HTMLLabelElement;
      const button = container.querySelector('button') as HTMLButtonElement;

      expect(getLabelTarget(label)).toBe(button);
    });

    it('should return null for label with for pointing to non-existent element', () => {
      container.innerHTML = `
        <label for="nonexistent">Label:</label>
      `;
      const label = container.querySelector('label') as HTMLLabelElement;

      expect(getLabelTarget(label)).toBe(null);
    });

    it('should return null for label with for pointing to non-control element', () => {
      container.innerHTML = `
        <label for="mydiv">Label:</label>
        <div id="mydiv">Not a control</div>
      `;
      const label = container.querySelector('label') as HTMLLabelElement;

      expect(getLabelTarget(label)).toBe(null);
    });

    it('should return null for empty label', () => {
      container.innerHTML = `
        <label>Empty label</label>
      `;
      const label = container.querySelector('label') as HTMLLabelElement;

      expect(getLabelTarget(label)).toBe(null);
    });

    it('should prefer for attribute over nested control', () => {
      container.innerHTML = `
        <label for="target">
          <input type="text" id="nested">
        </label>
        <input type="email" id="target">
      `;
      const label = container.querySelector('label') as HTMLLabelElement;
      const target = container.querySelector('#target') as HTMLInputElement;

      expect(getLabelTarget(label)).toBe(target);
    });
  });

  describe('getInteractiveAncestor', () => {
    it('should return button ancestor', () => {
      container.innerHTML = `
        <button><span>Click me</span></button>
      `;
      const span = container.querySelector('span') as HTMLSpanElement;
      const button = container.querySelector('button') as HTMLButtonElement;

      expect(getInteractiveAncestor(span)).toBe(button);
    });

    it('should return link ancestor', () => {
      container.innerHTML = `
        <a href="/home"><span>Go Home</span></a>
      `;
      const span = container.querySelector('span') as HTMLSpanElement;
      const link = container.querySelector('a') as HTMLAnchorElement;

      expect(getInteractiveAncestor(span)).toBe(link);
    });

    it('should return element with role="button"', () => {
      container.innerHTML = `
        <div role="button"><span>Click</span></div>
      `;
      const span = container.querySelector('span') as HTMLSpanElement;
      const roleButton = container.querySelector('[role="button"]') as HTMLDivElement;

      expect(getInteractiveAncestor(span)).toBe(roleButton);
    });

    it('should return element with role="link"', () => {
      container.innerHTML = `
        <div role="link"><span>Navigate</span></div>
      `;
      const span = container.querySelector('span') as HTMLSpanElement;
      const roleLink = container.querySelector('[role="link"]') as HTMLDivElement;

      expect(getInteractiveAncestor(span)).toBe(roleLink);
    });

    it('should return null if no interactive ancestor', () => {
      container.innerHTML = `
        <div><span>Text</span></div>
      `;
      const span = container.querySelector('span') as HTMLSpanElement;

      expect(getInteractiveAncestor(span)).toBe(null);
    });

    it('should return closest interactive ancestor when nested', () => {
      container.innerHTML = `
        <a href="/outer">
          <button><span>Click</span></button>
        </a>
      `;
      const span = container.querySelector('span') as HTMLSpanElement;
      const button = container.querySelector('button') as HTMLButtonElement;

      expect(getInteractiveAncestor(span)).toBe(button);
    });

    it('should return self if element is a button', () => {
      const button = document.createElement('button');
      button.textContent = 'Click';
      container.appendChild(button);

      expect(getInteractiveAncestor(button)).toBe(button);
    });
  });

  describe('getInteractiveAncestorWithCheckbox', () => {
    it('should return element with role="checkbox"', () => {
      container.innerHTML = `
        <div role="checkbox"><span>Check</span></div>
      `;
      const span = container.querySelector('span') as HTMLSpanElement;
      const roleCheckbox = container.querySelector('[role="checkbox"]') as HTMLDivElement;

      expect(getInteractiveAncestorWithCheckbox(span)).toBe(roleCheckbox);
    });

    it('should return element with role="radio"', () => {
      container.innerHTML = `
        <div role="radio"><span>Option</span></div>
      `;
      const span = container.querySelector('span') as HTMLSpanElement;
      const roleRadio = container.querySelector('[role="radio"]') as HTMLDivElement;

      expect(getInteractiveAncestorWithCheckbox(span)).toBe(roleRadio);
    });

    it('should also return button ancestor', () => {
      container.innerHTML = `
        <button><span>Click</span></button>
      `;
      const span = container.querySelector('span') as HTMLSpanElement;
      const button = container.querySelector('button') as HTMLButtonElement;

      expect(getInteractiveAncestorWithCheckbox(span)).toBe(button);
    });
  });

  describe('retarget', () => {
    describe("behavior: 'none'", () => {
      it('should return element unchanged', () => {
        const div = document.createElement('div');
        container.appendChild(div);

        expect(retarget(div, 'none')).toBe(div);
      });

      it('should return null for null input', () => {
        expect(retarget(null, 'none')).toBe(null);
      });

      it('should convert text node to parent element', () => {
        container.innerHTML = '<div>Hello</div>';
        const textNode = container.querySelector('div')!.firstChild!;

        expect(retarget(textNode, 'none')).toBe(container.querySelector('div'));
      });
    });

    describe("behavior: 'follow-label'", () => {
      it('should follow label with for attribute to input', () => {
        container.innerHTML = `
          <label for="email">Email:</label>
          <input id="email" type="email">
        `;
        const label = container.querySelector('label') as HTMLLabelElement;
        const input = container.querySelector('input') as HTMLInputElement;

        expect(retarget(label, 'follow-label')).toBe(input);
      });

      it('should follow label wrapping input to input', () => {
        container.innerHTML = `
          <label>Username: <input type="text"></label>
        `;
        const label = container.querySelector('label') as HTMLLabelElement;
        const input = container.querySelector('input') as HTMLInputElement;

        expect(retarget(label, 'follow-label')).toBe(input);
      });

      it('should stay on form control (input)', () => {
        const input = document.createElement('input');
        input.type = 'text';
        container.appendChild(input);

        expect(retarget(input, 'follow-label')).toBe(input);
      });

      it('should stay on form control (textarea)', () => {
        const textarea = document.createElement('textarea');
        container.appendChild(textarea);

        expect(retarget(textarea, 'follow-label')).toBe(textarea);
      });

      it('should stay on form control (select)', () => {
        const select = document.createElement('select');
        container.appendChild(select);

        expect(retarget(select, 'follow-label')).toBe(select);
      });

      it('should find button ancestor for text in button', () => {
        container.innerHTML = `<button><span>Submit</span></button>`;
        const span = container.querySelector('span') as HTMLSpanElement;
        const button = container.querySelector('button') as HTMLButtonElement;

        expect(retarget(span, 'follow-label')).toBe(button);
      });

      it('should find checkbox role ancestor', () => {
        container.innerHTML = `
          <div role="checkbox"><span>Check me</span></div>
        `;
        const span = container.querySelector('span') as HTMLSpanElement;
        const checkbox = container.querySelector('[role="checkbox"]') as HTMLDivElement;

        expect(retarget(span, 'follow-label')).toBe(checkbox);
      });

      it('should find radio role ancestor', () => {
        container.innerHTML = `
          <div role="radio"><span>Option A</span></div>
        `;
        const span = container.querySelector('span') as HTMLSpanElement;
        const radio = container.querySelector('[role="radio"]') as HTMLDivElement;

        expect(retarget(span, 'follow-label')).toBe(radio);
      });

      it('should return label when no control is associated', () => {
        container.innerHTML = `<label>Orphan label</label>`;
        const label = container.querySelector('label') as HTMLLabelElement;

        expect(retarget(label, 'follow-label')).toBe(label);
      });

      it('should handle nested structure with label inside button', () => {
        container.innerHTML = `
          <button>
            <label for="toggle">Toggle</label>
          </button>
          <input type="checkbox" id="toggle">
        `;
        const label = container.querySelector('label') as HTMLLabelElement;
        const button = container.querySelector('button') as HTMLButtonElement;

        // Label is inside button, so button takes precedence
        expect(retarget(label, 'follow-label')).toBe(button);
      });
    });

    describe("behavior: 'button-link'", () => {
      it('should find button ancestor', () => {
        container.innerHTML = `<button><span>Click</span></button>`;
        const span = container.querySelector('span') as HTMLSpanElement;
        const button = container.querySelector('button') as HTMLButtonElement;

        expect(retarget(span, 'button-link')).toBe(button);
      });

      it('should find link ancestor', () => {
        container.innerHTML = `<a href="/home"><span>Go Home</span></a>`;
        const span = container.querySelector('span') as HTMLSpanElement;
        const link = container.querySelector('a') as HTMLAnchorElement;

        expect(retarget(span, 'button-link')).toBe(link);
      });

      it('should find role="button" ancestor', () => {
        container.innerHTML = `
          <div role="button"><span>Action</span></div>
        `;
        const span = container.querySelector('span') as HTMLSpanElement;
        const roleButton = container.querySelector('[role="button"]') as HTMLDivElement;

        expect(retarget(span, 'button-link')).toBe(roleButton);
      });

      it('should find role="link" ancestor', () => {
        container.innerHTML = `
          <div role="link"><span>Navigate</span></div>
        `;
        const span = container.querySelector('span') as HTMLSpanElement;
        const roleLink = container.querySelector('[role="link"]') as HTMLDivElement;

        expect(retarget(span, 'button-link')).toBe(roleLink);
      });

      it('should not find role="checkbox" ancestor', () => {
        container.innerHTML = `
          <div role="checkbox"><span>Check</span></div>
        `;
        const span = container.querySelector('span') as HTMLSpanElement;

        // button-link doesn't look for checkbox/radio
        expect(retarget(span, 'button-link')).toBe(span);
      });

      it('should return element if no interactive ancestor', () => {
        container.innerHTML = `<div><span>Text</span></div>`;
        const span = container.querySelector('span') as HTMLSpanElement;

        expect(retarget(span, 'button-link')).toBe(span);
      });

      it('should stay on input element', () => {
        const input = document.createElement('input');
        container.appendChild(input);

        expect(retarget(input, 'button-link')).toBe(input);
      });

      it('should stay on contenteditable element', () => {
        const div = document.createElement('div');
        div.contentEditable = 'true';
        container.appendChild(div);

        expect(retarget(div, 'button-link')).toBe(div);
      });
    });

    describe("behavior: 'no-follow-label'", () => {
      it('should find button ancestor', () => {
        container.innerHTML = `<button><span>Click</span></button>`;
        const span = container.querySelector('span') as HTMLSpanElement;
        const button = container.querySelector('button') as HTMLButtonElement;

        expect(retarget(span, 'no-follow-label')).toBe(button);
      });

      it('should find checkbox role ancestor', () => {
        container.innerHTML = `
          <div role="checkbox"><span>Check</span></div>
        `;
        const span = container.querySelector('span') as HTMLSpanElement;
        const checkbox = container.querySelector('[role="checkbox"]') as HTMLDivElement;

        expect(retarget(span, 'no-follow-label')).toBe(checkbox);
      });

      it('should not follow label to control', () => {
        container.innerHTML = `
          <label for="email">Email:</label>
          <input id="email" type="email">
        `;
        const label = container.querySelector('label') as HTMLLabelElement;

        // no-follow-label should not follow to input
        expect(retarget(label, 'no-follow-label')).toBe(label);
      });

      it('should stay on form control (input)', () => {
        const input = document.createElement('input');
        container.appendChild(input);

        expect(retarget(input, 'no-follow-label')).toBe(input);
      });

      it('should stay on form control (select)', () => {
        const select = document.createElement('select');
        container.appendChild(select);

        expect(retarget(select, 'no-follow-label')).toBe(select);
      });

      it('should find role="button" ancestor from non-input element', () => {
        container.innerHTML = `
          <div role="button"><span>Action</span></div>
        `;
        const span = container.querySelector('span') as HTMLSpanElement;
        const roleButton = container.querySelector('[role="button"]') as HTMLDivElement;

        expect(retarget(span, 'no-follow-label')).toBe(roleButton);
      });
    });

    describe('text node handling', () => {
      it('should handle text node inside button', () => {
        container.innerHTML = `<button>Click me</button>`;
        const button = container.querySelector('button') as HTMLButtonElement;
        const textNode = button.firstChild!;

        expect(retarget(textNode, 'button-link')).toBe(button);
      });

      it('should handle text node inside link', () => {
        container.innerHTML = `<a href="/home">Go Home</a>`;
        const link = container.querySelector('a') as HTMLAnchorElement;
        const textNode = link.firstChild!;

        expect(retarget(textNode, 'button-link')).toBe(link);
      });

      it('should handle text node inside div', () => {
        container.innerHTML = `<div>Plain text</div>`;
        const div = container.querySelector('div') as HTMLDivElement;
        const textNode = div.firstChild!;

        expect(retarget(textNode, 'none')).toBe(div);
      });
    });

    describe('complex nested structures', () => {
      it('should handle deeply nested element in button', () => {
        container.innerHTML = `
          <button>
            <span>
              <strong>
                <em>Click</em>
              </strong>
            </span>
          </button>
        `;
        const em = container.querySelector('em') as HTMLElement;
        const button = container.querySelector('button') as HTMLButtonElement;

        expect(retarget(em, 'button-link')).toBe(button);
      });

      it('should handle SVG icon inside button', () => {
        container.innerHTML = `
          <button>
            <svg class="icon"><path d="M0 0"></path></svg>
            Submit
          </button>
        `;
        const svg = container.querySelector('svg') as SVGElement;
        const button = container.querySelector('button') as HTMLButtonElement;

        expect(retarget(svg, 'button-link')).toBe(button);
      });

      it('should handle image inside link', () => {
        container.innerHTML = `
          <a href="/profile">
            <img src="avatar.png" alt="Profile">
          </a>
        `;
        const img = container.querySelector('img') as HTMLImageElement;
        const link = container.querySelector('a') as HTMLAnchorElement;

        expect(retarget(img, 'button-link')).toBe(link);
      });

      it('should handle label with multiple inputs (first one wins)', () => {
        container.innerHTML = `
          <label>
            <input type="text" id="first">
            <input type="text" id="second">
          </label>
        `;
        const label = container.querySelector('label') as HTMLLabelElement;
        const firstInput = container.querySelector('#first') as HTMLInputElement;

        expect(retarget(label, 'follow-label')).toBe(firstInput);
      });
    });

    describe('edge cases', () => {
      it('should handle orphan text node', () => {
        const textNode = document.createTextNode('orphan');
        expect(retarget(textNode, 'none')).toBe(null);
      });

      it('should handle element not in document', () => {
        const button = document.createElement('button');
        const span = document.createElement('span');
        button.appendChild(span);

        expect(retarget(span, 'button-link')).toBe(button);
      });

      it('should handle anchor without href (still targets anchor)', () => {
        container.innerHTML = `<a><span>Not a link</span></a>`;
        const span = container.querySelector('span') as HTMLSpanElement;
        const anchor = container.querySelector('a') as HTMLAnchorElement;

        // CSS selector 'a' matches all anchors, not just those with href
        // This matches Playwright's behavior
        expect(retarget(span, 'button-link')).toBe(anchor);
      });

      it('should handle disabled button', () => {
        container.innerHTML = `<button disabled><span>Disabled</span></button>`;
        const span = container.querySelector('span') as HTMLSpanElement;
        const button = container.querySelector('button') as HTMLButtonElement;

        // Still targets the button even if disabled
        expect(retarget(span, 'button-link')).toBe(button);
      });

      it('should handle hidden element', () => {
        container.innerHTML = `<button style="display:none"><span>Hidden</span></button>`;
        const span = container.querySelector('span') as HTMLSpanElement;
        const button = container.querySelector('button') as HTMLButtonElement;

        // Still targets the button even if hidden
        expect(retarget(span, 'button-link')).toBe(button);
      });
    });
  });
});
