import type { SelectorEngine, SelectorRoot } from './engine.js';
import { isElementVisible } from '../dom/visibility.js';

export interface TextSelectorOptions {
  exact?: boolean;
  regex?: boolean;
}

/**
 * Create a text matcher function based on options.
 */
export function createTextMatcher(text: string, options: TextSelectorOptions = {}): (content: string) => boolean {
  if (options.regex) {
    const regex = new RegExp(text);
    return (content: string) => regex.test(content);
  }
  if (options.exact) {
    return (content: string) => content.trim() === text;
  }
  const lower = text.toLowerCase();
  return (content: string) => content.toLowerCase().includes(lower);
}

/**
 * Text content selector engine.
 * Matches elements containing the specified text.
 * Supports exact match with quotes: text="exact text"
 * Supports regex match with /pattern/: text=/pattern/
 */
export class TextSelectorEngine implements SelectorEngine {
  readonly name = 'text';

  query(root: SelectorRoot, selector: string): Element | null {
    const { text, exact, regex } = parseTextSelector(selector);
    const matcher = createTextMatcher(text, { exact, regex });
    return this.findTextElement(root, matcher, true);
  }

  queryAll(root: SelectorRoot, selector: string): Element[] {
    const { text, exact, regex } = parseTextSelector(selector);
    const matcher = createTextMatcher(text, { exact, regex });
    const results: Element[] = [];
    this.findTextElements(root, matcher, results);
    return results;
  }

  private findTextElement(
    root: SelectorRoot,
    matcher: (content: string) => boolean,
    first: boolean
  ): Element | null {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (!(node instanceof Element)) return NodeFilter.FILTER_REJECT;
          if (!isElementVisible(node)) return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    let node: Element | null;
    while ((node = walker.nextNode() as Element | null)) {
      const directText = this.getDirectTextContent(node);
      if (matcher(directText)) {
        return node;
      }
    }
    return null;
  }

  private findTextElements(
    root: SelectorRoot,
    matcher: (content: string) => boolean,
    results: Element[]
  ): void {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (!(node instanceof Element)) return NodeFilter.FILTER_REJECT;
          if (!isElementVisible(node)) return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    let node: Element | null;
    while ((node = walker.nextNode() as Element | null)) {
      const directText = this.getDirectTextContent(node);
      if (matcher(directText)) {
        results.push(node);
      }
    }
  }

  private getDirectTextContent(element: Element): string {
    let text = '';
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent || '';
      }
    }
    return text;
  }
}

function parseTextSelector(selector: string): { text: string; exact: boolean; regex: boolean } {
  // Check for regex match with /pattern/
  if (selector.startsWith('/') && selector.endsWith('/')) {
    return {
      text: selector.slice(1, -1),
      exact: false,
      regex: true,
    };
  }
  // Check for exact match quotes
  if ((selector.startsWith('"') && selector.endsWith('"')) ||
      (selector.startsWith("'") && selector.endsWith("'"))) {
    return {
      text: selector.slice(1, -1),
      exact: true,
      regex: false,
    };
  }
  return { text: selector, exact: false, regex: false };
}

export const textEngine = new TextSelectorEngine();
