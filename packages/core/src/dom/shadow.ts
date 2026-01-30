/**
 * Shadow DOM traversal utilities.
 */

/**
 * Get all shadow roots within an element, including nested ones.
 */
export function getShadowRoots(root: Element | Document): ShadowRoot[] {
  const shadows: ShadowRoot[] = [];
  collectShadowRoots(root, shadows);
  return shadows;
}

function collectShadowRoots(root: Element | Document | ShadowRoot, shadows: ShadowRoot[]): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);

  let node: Element | null;
  while ((node = walker.nextNode() as Element | null)) {
    if (node.shadowRoot) {
      shadows.push(node.shadowRoot);
      collectShadowRoots(node.shadowRoot, shadows);
    }
  }
}

/**
 * Find an element by traversing through shadow DOMs.
 */
export function deepQuery(
  root: Element | Document,
  selector: string
): Element | null {
  // First try in the light DOM
  const lightResult = root.querySelector(selector);
  if (lightResult) return lightResult;

  // Then try in shadow DOMs
  const shadows = getShadowRoots(root);
  for (const shadow of shadows) {
    const result = shadow.querySelector(selector);
    if (result) return result;
  }

  return null;
}

/**
 * Find all elements matching a selector, including in shadow DOMs.
 */
export function deepQueryAll(
  root: Element | Document,
  selector: string
): Element[] {
  const results: Element[] = [];

  // Collect from light DOM
  results.push(...root.querySelectorAll(selector));

  // Collect from shadow DOMs
  const shadows = getShadowRoots(root);
  for (const shadow of shadows) {
    results.push(...shadow.querySelectorAll(selector));
  }

  return results;
}

/**
 * Get the composed path from an element to the document root,
 * including shadow boundaries.
 */
export function getComposedPath(element: Element): (Element | ShadowRoot | Document)[] {
  const path: (Element | ShadowRoot | Document)[] = [];
  let current: Node | null = element;

  while (current) {
    if (current instanceof Element || current instanceof ShadowRoot || current instanceof Document) {
      path.push(current);
    }

    if (current instanceof ShadowRoot) {
      current = current.host;
    } else {
      current = current.parentNode;
    }
  }

  return path;
}

/**
 * Find the deepest element at a point, crossing shadow boundaries.
 */
export function deepElementFromPoint(x: number, y: number): Element | null {
  let element = document.elementFromPoint(x, y);
  if (!element) return null;

  // Keep drilling into shadow roots
  while (element.shadowRoot) {
    const inner = element.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === element) break;
    element = inner;
  }

  return element;
}
