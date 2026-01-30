import type { SelectorEngine, SelectorRoot } from './engine.js';
import { parseSelector, selectorEngines } from './engine.js';
import { isElementVisible } from '../dom/visibility.js';
import { layoutEngines } from './layout.js';

/**
 * Internal selector engines for advanced filtering and composition.
 * These are used within selector chains, not as standalone selectors.
 *
 * Supported engines:
 * - internal:has - Filter elements that contain matching descendants
 * - internal:has-not - Filter elements that DON'T contain matching descendants
 * - internal:has-text - Filter elements by text content
 * - internal:has-not-text - Filter elements that don't match text
 * - internal:and - Intersection of multiple selectors
 * - internal:or - Union of multiple selectors
 * - internal:label - Find form controls by associated label text
 * - internal:visible - Filter only visible elements
 * - internal:left-of - Find elements to the left of reference
 * - internal:right-of - Find elements to the right of reference
 * - internal:above - Find elements above reference
 * - internal:below - Find elements below reference
 * - internal:near - Find elements near reference (within 50px by default)
 */

/**
 * Parse text selector body into text content and matching options.
 * Supports three formats:
 * - Substring match (default): text
 * - Exact match: "text" or 'text'
 * - Regex match: /pattern/ or /pattern/flags
 */
export function parseTextSelectorBody(body: string): {
  text: string;
  exact: boolean;
  regex: RegExp | null;
} {
  // Check for regex match with /pattern/ or /pattern/flags
  const regexMatch = body.match(/^\/(.+)\/([gimsuy]*)$/);
  if (regexMatch) {
    try {
      return {
        text: regexMatch[1],
        exact: false,
        regex: new RegExp(regexMatch[1], regexMatch[2]),
      };
    } catch {
      // Invalid regex pattern - fall through to treat as literal string
    }
  }

  // Check for exact match with quotes
  if (
    (body.startsWith('"') && body.endsWith('"')) ||
    (body.startsWith("'") && body.endsWith("'"))
  ) {
    return {
      text: body.slice(1, -1),
      exact: true,
      regex: null,
    };
  }

  // Default: substring match (case-insensitive)
  return {
    text: body,
    exact: false,
    regex: null,
  };
}

/**
 * Parse the body of internal:and or internal:or selectors.
 * Uses && as separator between selectors.
 */
export function parseCompoundSelectorBody(body: string): string[] {
  const selectors: string[] = [];
  let current = '';
  let depth = 0;
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < body.length; i++) {
    const char = body[i];

    // Handle quotes
    if (!inQuote && (char === '"' || char === "'")) {
      inQuote = true;
      quoteChar = char;
      current += char;
    } else if (inQuote && char === quoteChar) {
      inQuote = false;
      quoteChar = '';
      current += char;
    } else if (!inQuote) {
      // Track parentheses/brackets depth
      if (char === '(' || char === '[') {
        depth++;
        current += char;
      } else if (char === ')' || char === ']') {
        depth--;
        current += char;
      } else if (depth === 0 && body.slice(i, i + 2) === '&&') {
        // Split on && only at top level
        if (current.trim()) {
          selectors.push(current.trim());
        }
        current = '';
        i++; // Skip the second &
      } else {
        current += char;
      }
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    selectors.push(current.trim());
  }

  return selectors;
}

/**
 * Get all text content from an element, normalized.
 */
function getElementTextContent(element: Element): string {
  return (element.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * Check if text matches using the parsed selector options.
 */
function textMatches(
  content: string,
  selector: { text: string; exact: boolean; regex: RegExp | null }
): boolean {
  if (selector.regex) {
    return selector.regex.test(content);
  }
  if (selector.exact) {
    return content.trim() === selector.text;
  }
  // Case-insensitive substring match
  return content.toLowerCase().includes(selector.text.toLowerCase());
}

/**
 * Sort elements in DOM order.
 */
function sortInDOMOrder(elements: Element[]): Element[] {
  return elements.slice().sort((a, b) => {
    const position = a.compareDocumentPosition(b);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }
    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }
    return 0;
  });
}

/**
 * Deduplicate elements while preserving order.
 */
function deduplicateElements(elements: Element[]): Element[] {
  const seen = new Set<Element>();
  return elements.filter((el) => {
    if (seen.has(el)) return false;
    seen.add(el);
    return true;
  });
}

/**
 * Query elements using a selector string, resolving the engine.
 */
function queryWithSelector(
  root: SelectorRoot,
  selectorString: string
): Element[] {
  const { engine: engineName, body } = parseSelector(selectorString.trim());
  const engine = selectorEngines.get(engineName);
  if (!engine) {
    console.warn(`Unknown selector engine: ${engineName}`);
    return [];
  }
  return engine.queryAll(root, body);
}

/**
 * Query a single element using a selector string, resolving the engine.
 */
function querySingleWithSelector(
  root: SelectorRoot,
  selectorString: string
): Element | null {
  const { engine: engineName, body } = parseSelector(selectorString.trim());
  const engine = selectorEngines.get(engineName);
  if (!engine) {
    console.warn(`Unknown selector engine: ${engineName}`);
    return null;
  }
  return engine.query(root, body);
}

/**
 * internal:has - Filter elements that contain matching descendants
 * Example: "div >> internal:has=button" - divs that contain a button
 */
export function createHasEngine(): SelectorEngine {
  return {
    name: 'internal:has',
    query(root: SelectorRoot, body: string): Element | null {
      // Get all elements from root
      const elements =
        root instanceof Element
          ? [root, ...Array.from(root.querySelectorAll('*'))]
          : Array.from(root.querySelectorAll('*'));

      for (const element of elements) {
        // Check if this element has descendants matching the body selector
        const matches = queryWithSelector(element, body);
        if (matches.length > 0) {
          return element;
        }
      }
      return null;
    },
    queryAll(root: SelectorRoot, body: string): Element[] {
      const results: Element[] = [];

      // Get all elements from root
      const elements =
        root instanceof Element
          ? [root, ...Array.from(root.querySelectorAll('*'))]
          : Array.from(root.querySelectorAll('*'));

      for (const element of elements) {
        const matches = queryWithSelector(element, body);
        if (matches.length > 0) {
          results.push(element);
        }
      }
      return results;
    },
  };
}

/**
 * internal:has-not - Filter elements that DON'T contain matching descendants
 * Example: "div >> internal:has-not=button" - divs without buttons
 */
export function createHasNotEngine(): SelectorEngine {
  return {
    name: 'internal:has-not',
    query(root: SelectorRoot, body: string): Element | null {
      const elements =
        root instanceof Element
          ? [root, ...Array.from(root.querySelectorAll('*'))]
          : Array.from(root.querySelectorAll('*'));

      for (const element of elements) {
        const matches = queryWithSelector(element, body);
        if (matches.length === 0) {
          return element;
        }
      }
      return null;
    },
    queryAll(root: SelectorRoot, body: string): Element[] {
      const results: Element[] = [];

      const elements =
        root instanceof Element
          ? [root, ...Array.from(root.querySelectorAll('*'))]
          : Array.from(root.querySelectorAll('*'));

      for (const element of elements) {
        const matches = queryWithSelector(element, body);
        if (matches.length === 0) {
          results.push(element);
        }
      }
      return results;
    },
  };
}

/**
 * internal:has-text - Filter elements by text content
 * Supports: exact ("text"), substring (text), regex (/pattern/)
 * Example: "button >> internal:has-text=Submit"
 */
export function createHasTextEngine(): SelectorEngine {
  return {
    name: 'internal:has-text',
    query(root: SelectorRoot, body: string): Element | null {
      const selector = parseTextSelectorBody(body);

      const elements =
        root instanceof Element
          ? [root, ...Array.from(root.querySelectorAll('*'))]
          : Array.from(root.querySelectorAll('*'));

      for (const element of elements) {
        const content = getElementTextContent(element);
        if (textMatches(content, selector)) {
          return element;
        }
      }
      return null;
    },
    queryAll(root: SelectorRoot, body: string): Element[] {
      const selector = parseTextSelectorBody(body);
      const results: Element[] = [];

      const elements =
        root instanceof Element
          ? [root, ...Array.from(root.querySelectorAll('*'))]
          : Array.from(root.querySelectorAll('*'));

      for (const element of elements) {
        const content = getElementTextContent(element);
        if (textMatches(content, selector)) {
          results.push(element);
        }
      }
      return results;
    },
  };
}

/**
 * internal:has-not-text - Filter elements that don't match text
 */
export function createHasNotTextEngine(): SelectorEngine {
  return {
    name: 'internal:has-not-text',
    query(root: SelectorRoot, body: string): Element | null {
      const selector = parseTextSelectorBody(body);

      const elements =
        root instanceof Element
          ? [root, ...Array.from(root.querySelectorAll('*'))]
          : Array.from(root.querySelectorAll('*'));

      for (const element of elements) {
        const content = getElementTextContent(element);
        if (!textMatches(content, selector)) {
          return element;
        }
      }
      return null;
    },
    queryAll(root: SelectorRoot, body: string): Element[] {
      const selector = parseTextSelectorBody(body);
      const results: Element[] = [];

      const elements =
        root instanceof Element
          ? [root, ...Array.from(root.querySelectorAll('*'))]
          : Array.from(root.querySelectorAll('*'));

      for (const element of elements) {
        const content = getElementTextContent(element);
        if (!textMatches(content, selector)) {
          results.push(element);
        }
      }
      return results;
    },
  };
}

/**
 * internal:and - Intersection of multiple selectors
 * All selectors must match the same element
 * Example: "internal:and=css=.foo&&css=.bar" - elements with both classes
 */
export function createAndEngine(): SelectorEngine {
  return {
    name: 'internal:and',
    query(root: SelectorRoot, body: string): Element | null {
      const selectors = parseCompoundSelectorBody(body);
      if (selectors.length === 0) return null;

      // Get initial set from first selector
      const initial = queryWithSelector(root, selectors[0]);
      if (initial.length === 0) return null;

      // Filter by remaining selectors
      for (const element of initial) {
        let matchesAll = true;
        for (let i = 1; i < selectors.length; i++) {
          const matches = queryWithSelector(root, selectors[i]);
          if (!matches.includes(element)) {
            matchesAll = false;
            break;
          }
        }
        if (matchesAll) {
          return element;
        }
      }
      return null;
    },
    queryAll(root: SelectorRoot, body: string): Element[] {
      const selectors = parseCompoundSelectorBody(body);
      if (selectors.length === 0) return [];

      // Get results from all selectors
      const allResults = selectors.map((sel) => queryWithSelector(root, sel));

      // Find intersection - elements that appear in all result sets
      if (allResults.length === 0 || allResults[0].length === 0) return [];

      const intersection = allResults[0].filter((element) =>
        allResults.every((results) => results.includes(element))
      );

      return intersection;
    },
  };
}

/**
 * internal:or - Union of multiple selectors
 * Returns elements matching any selector, in DOM order
 * Example: "internal:or=button&&a" - all buttons and links
 */
export function createOrEngine(): SelectorEngine {
  return {
    name: 'internal:or',
    query(root: SelectorRoot, body: string): Element | null {
      const selectors = parseCompoundSelectorBody(body);

      // Get all matches and return first in DOM order
      const allMatches: Element[] = [];
      for (const selectorString of selectors) {
        const matches = queryWithSelector(root, selectorString);
        allMatches.push(...matches);
      }

      if (allMatches.length === 0) return null;

      // Deduplicate and sort in DOM order
      const unique = deduplicateElements(allMatches);
      const sorted = sortInDOMOrder(unique);
      return sorted[0] || null;
    },
    queryAll(root: SelectorRoot, body: string): Element[] {
      const selectors = parseCompoundSelectorBody(body);

      // Get all matches
      const allMatches: Element[] = [];
      for (const selectorString of selectors) {
        const matches = queryWithSelector(root, selectorString);
        allMatches.push(...matches);
      }

      // Deduplicate and sort in DOM order
      const unique = deduplicateElements(allMatches);
      return sortInDOMOrder(unique);
    },
  };
}

/**
 * Get form controls associated with a label by text.
 */
function getControlsForLabelText(
  root: SelectorRoot,
  text: string,
  exact: boolean
): Element[] {
  const results: Element[] = [];
  const normalizedText = text.toLowerCase();

  // Find all labels in the root
  const labels = root.querySelectorAll('label');

  for (const label of labels) {
    const labelText = getElementTextContent(label);
    const matches = exact
      ? labelText === text
      : labelText.toLowerCase().includes(normalizedText);

    if (!matches) continue;

    // Check for 'for' attribute
    const forAttr = label.getAttribute('for');
    if (forAttr) {
      // Need to search in document context
      const doc =
        root instanceof Document ? root : root.ownerDocument || document;
      const control = doc.getElementById(forAttr);
      if (control && isFormControl(control)) {
        results.push(control);
        continue;
      }
    }

    // Check for nested control
    const nestedControl = label.querySelector(
      'input, select, textarea, button'
    );
    if (nestedControl) {
      results.push(nestedControl);
    }
  }

  // Also check aria-labelledby
  const allElements = root.querySelectorAll('[aria-labelledby]');
  for (const element of allElements) {
    const labelIds = element.getAttribute('aria-labelledby')?.split(/\s+/) || [];
    for (const id of labelIds) {
      const doc =
        root instanceof Document ? root : root.ownerDocument || document;
      const labelElement = doc.getElementById(id);
      if (labelElement) {
        const labelText = getElementTextContent(labelElement);
        const matches = exact
          ? labelText === text
          : labelText.toLowerCase().includes(normalizedText);
        if (matches && !results.includes(element)) {
          results.push(element);
        }
      }
    }
  }

  return results;
}

/**
 * Check if an element is a form control.
 */
function isFormControl(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  return ['input', 'select', 'textarea', 'button'].includes(tagName);
}

/**
 * internal:label - Find form controls by associated label text
 * Example: "internal:label=Username" - input with label "Username"
 */
export function createLabelEngine(): SelectorEngine {
  return {
    name: 'internal:label',
    query(root: SelectorRoot, body: string): Element | null {
      const selector = parseTextSelectorBody(body);
      const controls = getControlsForLabelText(root, selector.text, selector.exact);
      return controls[0] || null;
    },
    queryAll(root: SelectorRoot, body: string): Element[] {
      const selector = parseTextSelectorBody(body);
      return getControlsForLabelText(root, selector.text, selector.exact);
    },
  };
}

/**
 * internal:visible - Filter only visible elements
 * Example: "button >> internal:visible"
 */
export function createVisibleEngine(): SelectorEngine {
  return {
    name: 'internal:visible',
    query(root: SelectorRoot, _body: string): Element | null {
      const elements =
        root instanceof Element
          ? [root, ...Array.from(root.querySelectorAll('*'))]
          : Array.from(root.querySelectorAll('*'));

      for (const element of elements) {
        if (isElementVisible(element)) {
          return element;
        }
      }
      return null;
    },
    queryAll(root: SelectorRoot, _body: string): Element[] {
      const elements =
        root instanceof Element
          ? [root, ...Array.from(root.querySelectorAll('*'))]
          : Array.from(root.querySelectorAll('*'));

      return elements.filter(isElementVisible);
    },
  };
}

/**
 * Export all internal engines as a map
 */
export const internalEngines: Record<string, SelectorEngine> = {
  'internal:has': createHasEngine(),
  'internal:has-not': createHasNotEngine(),
  'internal:has-text': createHasTextEngine(),
  'internal:has-not-text': createHasNotTextEngine(),
  'internal:and': createAndEngine(),
  'internal:or': createOrEngine(),
  'internal:label': createLabelEngine(),
  'internal:visible': createVisibleEngine(),
  // Layout engines
  ...layoutEngines,
};

/**
 * Register all internal engines with the global registry.
 * This includes both filtering engines and layout engines.
 */
export function registerInternalEngines(): void {
  for (const engine of Object.values(internalEngines)) {
    selectorEngines.register(engine);
  }
}
