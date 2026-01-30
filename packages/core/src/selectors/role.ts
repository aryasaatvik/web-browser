import type { SelectorEngine, SelectorRoot } from './engine.js';
import { isElementVisible } from '../dom/visibility.js';
import { getAriaRole, getAccessibleName } from '../a11y/roles.js';

export interface RoleSelectorOptions {
  name?: string;
  exact?: boolean;
}

/**
 * ARIA role selector engine.
 * Matches elements by their ARIA role and accessible name.
 * Syntax: role=button[name="Submit"]
 */
export class RoleSelectorEngine implements SelectorEngine {
  readonly name = 'role';

  query(root: SelectorRoot, selector: string): Element | null {
    const { role, options } = parseRoleSelector(selector);
    return this.findRoleElement(root, role, options);
  }

  queryAll(root: SelectorRoot, selector: string): Element[] {
    const { role, options } = parseRoleSelector(selector);
    const results: Element[] = [];
    this.findRoleElements(root, role, options, results);
    return results;
  }

  private findRoleElement(
    root: SelectorRoot,
    role: string,
    options: RoleSelectorOptions
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
      if (this.matchesRole(node, role, options)) {
        return node;
      }
    }
    return null;
  }

  private findRoleElements(
    root: SelectorRoot,
    role: string,
    options: RoleSelectorOptions,
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
      if (this.matchesRole(node, role, options)) {
        results.push(node);
      }
    }
  }

  private matchesRole(element: Element, role: string, options: RoleSelectorOptions): boolean {
    const elementRole = getAriaRole(element);
    if (elementRole !== role) return false;

    if (options.name !== undefined) {
      const accessibleName = getAccessibleName(element);
      if (options.exact) {
        return accessibleName === options.name;
      }
      return accessibleName.toLowerCase().includes(options.name.toLowerCase());
    }

    return true;
  }
}

function parseRoleSelector(selector: string): { role: string; options: RoleSelectorOptions } {
  // Parse syntax like: button[name="Submit"]
  const bracketMatch = selector.match(/^([a-z]+)\[(.+)\]$/i);
  if (bracketMatch) {
    const role = bracketMatch[1].toLowerCase();
    const attrsStr = bracketMatch[2];
    const options: RoleSelectorOptions = {};

    // Parse name attribute
    const nameMatch = attrsStr.match(/name\s*=\s*["'](.+?)["']/i);
    if (nameMatch) {
      options.name = nameMatch[1];
    }

    // Parse exact attribute
    const exactMatch = attrsStr.match(/exact\s*=\s*(true|false)/i);
    if (exactMatch) {
      options.exact = exactMatch[1].toLowerCase() === 'true';
    }

    return { role, options };
  }

  return { role: selector.toLowerCase(), options: {} };
}

export const roleEngine = new RoleSelectorEngine();
