import type { SelectorEngine, SelectorRoot } from './engine.js';

/**
 * CSS selector engine.
 * Uses native querySelector/querySelectorAll.
 */
export class CssSelectorEngine implements SelectorEngine {
  readonly name = 'css';

  query(root: SelectorRoot, selector: string): Element | null {
    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }

  queryAll(root: SelectorRoot, selector: string): Element[] {
    try {
      return [...root.querySelectorAll(selector)];
    } catch {
      return [];
    }
  }
}

export const cssEngine = new CssSelectorEngine();
