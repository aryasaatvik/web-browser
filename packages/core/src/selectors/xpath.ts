import type { SelectorEngine, SelectorRoot } from './engine.js';

/**
 * Get the owner document of a selector root.
 */
function getOwnerDoc(root: SelectorRoot): Document | null {
  if (root instanceof Document) return root;
  if (root instanceof ShadowRoot) return root.ownerDocument;
  return root.ownerDocument;
}

/**
 * XPath selector engine.
 * Uses document.evaluate for XPath queries.
 */
export class XPathSelectorEngine implements SelectorEngine {
  readonly name = 'xpath';

  query(root: SelectorRoot, selector: string): Element | null {
    const doc = getOwnerDoc(root);
    if (!doc) return null;

    try {
      const result = doc.evaluate(
        selector,
        root,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const node = result.singleNodeValue;
      return node instanceof Element ? node : null;
    } catch {
      return null;
    }
  }

  queryAll(root: SelectorRoot, selector: string): Element[] {
    const doc = getOwnerDoc(root);
    if (!doc) return [];

    try {
      const result = doc.evaluate(
        selector,
        root,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      const elements: Element[] = [];
      for (let i = 0; i < result.snapshotLength; i++) {
        const node = result.snapshotItem(i);
        if (node instanceof Element) {
          elements.push(node);
        }
      }
      return elements;
    } catch {
      return [];
    }
  }
}

export const xpathEngine = new XPathSelectorEngine();
