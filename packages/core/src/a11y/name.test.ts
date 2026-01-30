/**
 * Tests for accessible name and description computation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeAccessibleName, computeAccessibleDescription } from './name.js';

describe('Accessible Name Computation', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('aria-labelledby', () => {
    it('should use aria-labelledby for single reference', () => {
      container.innerHTML = `
        <span id="label1">Hello World</span>
        <button aria-labelledby="label1">Ignored</button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleName(button)).toBe('Hello World');
    });

    it('should use aria-labelledby for multiple references', () => {
      container.innerHTML = `
        <span id="label1">Hello</span>
        <span id="label2">World</span>
        <button aria-labelledby="label1 label2">Ignored</button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleName(button)).toBe('Hello World');
    });

    it('should handle non-existent ID refs gracefully', () => {
      container.innerHTML = `
        <span id="label1">Hello</span>
        <button aria-labelledby="label1 nonexistent">Ignored</button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleName(button)).toBe('Hello');
    });

    it('should prevent infinite loops with self-reference', () => {
      container.innerHTML = `
        <button id="btn" aria-labelledby="btn">Button Text</button>
      `;
      const button = container.querySelector('button')!;
      // Should not infinite loop, should get content
      const name = computeAccessibleName(button);
      expect(typeof name).toBe('string');
    });

    it('should prevent cycles with mutual references', () => {
      container.innerHTML = `
        <span id="label1" aria-labelledby="label2">Label 1</span>
        <span id="label2" aria-labelledby="label1">Label 2</span>
        <button aria-labelledby="label1">Button</button>
      `;
      const button = container.querySelector('button')!;
      // Should not infinite loop
      const name = computeAccessibleName(button);
      expect(typeof name).toBe('string');
    });

    it('should include hidden content when referenced by aria-labelledby', () => {
      container.innerHTML = `
        <span id="label1" style="display: none;">Hidden Label</span>
        <button aria-labelledby="label1">Button</button>
      `;
      const button = container.querySelector('button')!;
      // aria-labelledby should still work with hidden content
      expect(computeAccessibleName(button)).toBe('Hidden Label');
    });
  });

  describe('aria-label', () => {
    it('should use aria-label when present', () => {
      container.innerHTML = `
        <button aria-label="Click me">Ignored content</button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleName(button)).toBe('Click me');
    });

    it('should prefer aria-labelledby over aria-label', () => {
      container.innerHTML = `
        <span id="label1">From labelledby</span>
        <button aria-labelledby="label1" aria-label="From aria-label">Content</button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleName(button)).toBe('From labelledby');
    });

    it('should fall back to aria-label when aria-labelledby refs invalid', () => {
      container.innerHTML = `
        <button aria-labelledby="nonexistent" aria-label="Fallback">Content</button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleName(button)).toBe('Fallback');
    });

    it('should trim whitespace from aria-label', () => {
      container.innerHTML = `
        <button aria-label="  Spaced Label  ">Content</button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleName(button)).toBe('Spaced Label');
    });
  });

  describe('associated label element', () => {
    it('should use label element for input', () => {
      container.innerHTML = `
        <label for="input1">Input Label</label>
        <input id="input1" type="text">
      `;
      const input = container.querySelector('input')!;
      expect(computeAccessibleName(input)).toBe('Input Label');
    });

    it('should use wrapping label element', () => {
      container.innerHTML = `
        <label>
          Wrapped Label
          <input type="text">
        </label>
      `;
      const input = container.querySelector('input')!;
      expect(computeAccessibleName(input)).toBe('Wrapped Label');
    });

    it('should concatenate multiple labels', () => {
      container.innerHTML = `
        <label for="input1">First</label>
        <label for="input1">Second</label>
        <input id="input1" type="text">
      `;
      const input = container.querySelector('input')!;
      expect(computeAccessibleName(input)).toBe('First Second');
    });

    it('should prefer aria-labelledby over native label', () => {
      container.innerHTML = `
        <span id="aria-label">ARIA Label</span>
        <label for="input1">Native Label</label>
        <input id="input1" type="text" aria-labelledby="aria-label">
      `;
      const input = container.querySelector('input')!;
      expect(computeAccessibleName(input)).toBe('ARIA Label');
    });
  });

  describe('title attribute', () => {
    it('should use title attribute as fallback', () => {
      container.innerHTML = `
        <button title="Title Label"></button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleName(button)).toBe('Title Label');
    });

    it('should prefer aria-label over title', () => {
      container.innerHTML = `
        <button aria-label="ARIA Label" title="Title Label"></button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleName(button)).toBe('ARIA Label');
    });

    it('should prefer text content over title for buttons', () => {
      container.innerHTML = `
        <button title="Title Label">Button Text</button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleName(button)).toBe('Button Text');
    });
  });

  describe('alt attribute', () => {
    it('should use alt attribute for images', () => {
      container.innerHTML = `
        <img alt="Image Description" src="test.png">
      `;
      const img = container.querySelector('img')!;
      expect(computeAccessibleName(img)).toBe('Image Description');
    });

    it('should use alt for input type=image', () => {
      container.innerHTML = `
        <input type="image" alt="Submit Image" src="test.png">
      `;
      const input = container.querySelector('input')!;
      expect(computeAccessibleName(input)).toBe('Submit Image');
    });

    it('should fall back to title for images without alt', () => {
      container.innerHTML = `
        <img title="Image Title" src="test.png">
      `;
      const img = container.querySelector('img')!;
      expect(computeAccessibleName(img)).toBe('Image Title');
    });
  });

  describe('placeholder attribute', () => {
    it('should use placeholder as fallback for text inputs', () => {
      container.innerHTML = `
        <input type="text" placeholder="Enter text">
      `;
      const input = container.querySelector('input')!;
      expect(computeAccessibleName(input)).toBe('Enter text');
    });

    it('should use placeholder as fallback for textarea', () => {
      container.innerHTML = `
        <textarea placeholder="Enter message"></textarea>
      `;
      const textarea = container.querySelector('textarea')!;
      expect(computeAccessibleName(textarea)).toBe('Enter message');
    });

    it('should prefer title over placeholder', () => {
      container.innerHTML = `
        <input type="text" placeholder="Placeholder" title="Title">
      `;
      const input = container.querySelector('input')!;
      expect(computeAccessibleName(input)).toBe('Title');
    });

    it('should prefer label over placeholder', () => {
      container.innerHTML = `
        <label for="input1">Label</label>
        <input id="input1" type="text" placeholder="Placeholder">
      `;
      const input = container.querySelector('input')!;
      expect(computeAccessibleName(input)).toBe('Label');
    });
  });

  describe('text content', () => {
    it('should use text content for buttons', () => {
      container.innerHTML = `
        <button>Click Me</button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleName(button)).toBe('Click Me');
    });

    it('should use text content for links', () => {
      container.innerHTML = `
        <a href="#">Link Text</a>
      `;
      const link = container.querySelector('a')!;
      expect(computeAccessibleName(link)).toBe('Link Text');
    });

    it('should normalize whitespace in text content', () => {
      container.innerHTML = `
        <button>
          Multiple    spaces
          and newlines
        </button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleName(button)).toBe('Multiple spaces and newlines');
    });

    it('should include nested element text', () => {
      container.innerHTML = `
        <button>
          <span>First</span>
          <span>Second</span>
        </button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleName(button)).toBe('First Second');
    });
  });

  describe('input buttons', () => {
    it('should use value for input type=button', () => {
      container.innerHTML = `
        <input type="button" value="Click Me">
      `;
      const input = container.querySelector('input')!;
      expect(computeAccessibleName(input)).toBe('Click Me');
    });

    it('should use value for input type=submit', () => {
      container.innerHTML = `
        <input type="submit" value="Send">
      `;
      const input = container.querySelector('input')!;
      expect(computeAccessibleName(input)).toBe('Send');
    });

    it('should default to "Submit" for empty submit button', () => {
      container.innerHTML = `
        <input type="submit">
      `;
      const input = container.querySelector('input')!;
      expect(computeAccessibleName(input)).toBe('Submit');
    });

    it('should default to "Reset" for empty reset button', () => {
      container.innerHTML = `
        <input type="reset">
      `;
      const input = container.querySelector('input')!;
      expect(computeAccessibleName(input)).toBe('Reset');
    });

    it('should default to "Choose File" for file input', () => {
      container.innerHTML = `
        <input type="file">
      `;
      const input = container.querySelector('input')!;
      expect(computeAccessibleName(input)).toBe('Choose File');
    });
  });

  describe('fieldset and legend', () => {
    it('should use legend for fieldset name', () => {
      container.innerHTML = `
        <fieldset>
          <legend>Personal Info</legend>
          <input type="text">
        </fieldset>
      `;
      const fieldset = container.querySelector('fieldset')!;
      expect(computeAccessibleName(fieldset)).toBe('Personal Info');
    });
  });

  describe('figure and figcaption', () => {
    it('should use figcaption for figure name', () => {
      container.innerHTML = `
        <figure>
          <img src="test.png" alt="Test">
          <figcaption>Figure Caption</figcaption>
        </figure>
      `;
      const figure = container.querySelector('figure')!;
      expect(computeAccessibleName(figure)).toBe('Figure Caption');
    });
  });

  describe('table and caption', () => {
    it('should use caption for table name', () => {
      container.innerHTML = `
        <table>
          <caption>Table Caption</caption>
          <tr><td>Data</td></tr>
        </table>
      `;
      const table = container.querySelector('table')!;
      expect(computeAccessibleName(table)).toBe('Table Caption');
    });

    it('should use summary for table name', () => {
      container.innerHTML = `
        <table summary="Table Summary">
          <tr><td>Data</td></tr>
        </table>
      `;
      const table = container.querySelector('table')!;
      expect(computeAccessibleName(table)).toBe('Table Summary');
    });
  });

  describe('embedded controls', () => {
    it('should use textbox value when embedded in label', () => {
      container.innerHTML = `
        <span id="amount-label">Amount: </span>
        <input type="text" id="amount" value="100">
        <button aria-labelledby="amount">Use Amount</button>
      `;
      // When aria-labelledby references a textbox, the value should be used
      const button = container.querySelector('button')!;
      expect(computeAccessibleName(button)).toBe('100');
    });

    it('should use select value when embedded', () => {
      container.innerHTML = `
        <span id="select-label">
          <select>
            <option value="1">First</option>
            <option value="2" selected>Second</option>
          </select>
        </span>
        <button aria-labelledby="select-label">Submit</button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleName(button)).toContain('Second');
    });
  });

  describe('name prohibited roles', () => {
    it('should return empty for generic role', () => {
      container.innerHTML = `
        <div role="generic" aria-label="Should be ignored">Content</div>
      `;
      const div = container.querySelector('div')!;
      expect(computeAccessibleName(div)).toBe('');
    });

    it('should return empty for presentation role', () => {
      container.innerHTML = `
        <div role="presentation" aria-label="Should be ignored">Content</div>
      `;
      const div = container.querySelector('div')!;
      expect(computeAccessibleName(div)).toBe('');
    });
  });

  describe('priority order', () => {
    it('should follow correct priority: aria-labelledby > aria-label > native > content', () => {
      container.innerHTML = `
        <span id="lb">LabelledBy</span>
        <button
          aria-labelledby="lb"
          aria-label="AriaLabel"
          title="Title"
        >Content</button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleName(button)).toBe('LabelledBy');
    });
  });
});

describe('Accessible Description Computation', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('aria-describedby', () => {
    it('should use aria-describedby for description', () => {
      container.innerHTML = `
        <span id="desc1">This is a description</span>
        <button aria-describedby="desc1">Click me</button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleDescription(button)).toBe('This is a description');
    });

    it('should handle multiple aria-describedby references', () => {
      container.innerHTML = `
        <span id="desc1">First description.</span>
        <span id="desc2">Second description.</span>
        <button aria-describedby="desc1 desc2">Click me</button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleDescription(button)).toBe('First description. Second description.');
    });
  });

  describe('aria-description', () => {
    it('should use aria-description when no aria-describedby', () => {
      container.innerHTML = `
        <button aria-description="Direct description">Click me</button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleDescription(button)).toBe('Direct description');
    });

    it('should prefer aria-describedby over aria-description', () => {
      container.innerHTML = `
        <span id="desc1">From describedby</span>
        <button
          aria-describedby="desc1"
          aria-description="From aria-description"
        >Click me</button>
      `;
      const button = container.querySelector('button')!;
      expect(computeAccessibleDescription(button)).toBe('From describedby');
    });
  });

  describe('title fallback', () => {
    it('should use title as description when not used for name', () => {
      container.innerHTML = `
        <button title="Tooltip description">Button Text</button>
      `;
      const button = container.querySelector('button')!;
      // Button has name from content, so title becomes description
      expect(computeAccessibleDescription(button)).toBe('Tooltip description');
    });

    it('should not use title as description when used for name', () => {
      container.innerHTML = `
        <button title="Title as name"></button>
      `;
      const button = container.querySelector('button')!;
      // Button has no content, so title is used for name, not description
      expect(computeAccessibleDescription(button)).toBe('');
    });
  });
});
