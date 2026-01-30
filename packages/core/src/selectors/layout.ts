/**
 * Layout selector engines for spatial/positional element matching.
 *
 * Provides selectors for finding elements based on their position relative
 * to other elements: left-of, right-of, above, below, near.
 *
 * Based on Playwright's layout selector implementation.
 */

import type { SelectorEngine, SelectorRoot } from './engine.js';
import { parseSelector, selectorEngines } from './engine.js';

/**
 * Layout selector names for spatial positioning.
 */
export type LayoutSelectorName =
  | 'left-of'
  | 'right-of'
  | 'above'
  | 'below'
  | 'near';

/**
 * All layout selector names.
 */
export const kLayoutSelectorNames: LayoutSelectorName[] = [
  'left-of',
  'right-of',
  'above',
  'below',
  'near',
];

/**
 * Options for layout selectors.
 */
export interface LayoutSelectorOptions {
  maxDistance?: number; // Default: Infinity for directional, 50 for near
}

/**
 * Check if box1 is to the right of box2.
 * Returns distance score or undefined if not right-of.
 *
 * Distance calculation:
 * - Primary: horizontal gap between box1.left and box2.right
 * - Penalty: vertical misalignment (how much box1 extends beyond box2's vertical bounds)
 *
 * @param box1 - The element being checked
 * @param box2 - The reference element
 * @param maxDistance - Maximum horizontal distance allowed
 * @returns Distance score (lower is better) or undefined if not right-of
 */
export function boxRightOf(
  box1: DOMRect,
  box2: DOMRect,
  maxDistance: number | undefined
): number | undefined {
  const distance = box1.left - box2.right;
  if (distance < 0 || (maxDistance !== undefined && distance > maxDistance)) {
    return undefined;
  }
  // Add penalty for vertical misalignment
  return (
    distance +
    Math.max(box2.bottom - box1.bottom, 0) +
    Math.max(box1.top - box2.top, 0)
  );
}

/**
 * Check if box1 is to the left of box2.
 * Returns distance score or undefined if not left-of.
 *
 * Distance calculation:
 * - Primary: horizontal gap between box2.left and box1.right
 * - Penalty: vertical misalignment
 *
 * @param box1 - The element being checked
 * @param box2 - The reference element
 * @param maxDistance - Maximum horizontal distance allowed
 * @returns Distance score (lower is better) or undefined if not left-of
 */
export function boxLeftOf(
  box1: DOMRect,
  box2: DOMRect,
  maxDistance: number | undefined
): number | undefined {
  const distance = box2.left - box1.right;
  if (distance < 0 || (maxDistance !== undefined && distance > maxDistance)) {
    return undefined;
  }
  // Add penalty for vertical misalignment
  return (
    distance +
    Math.max(box2.bottom - box1.bottom, 0) +
    Math.max(box1.top - box2.top, 0)
  );
}

/**
 * Check if box1 is above box2.
 * Returns distance score or undefined if not above.
 *
 * Distance calculation:
 * - Primary: vertical gap between box2.top and box1.bottom
 * - Penalty: horizontal misalignment
 *
 * @param box1 - The element being checked
 * @param box2 - The reference element
 * @param maxDistance - Maximum vertical distance allowed
 * @returns Distance score (lower is better) or undefined if not above
 */
export function boxAbove(
  box1: DOMRect,
  box2: DOMRect,
  maxDistance: number | undefined
): number | undefined {
  const distance = box2.top - box1.bottom;
  if (distance < 0 || (maxDistance !== undefined && distance > maxDistance)) {
    return undefined;
  }
  // Add penalty for horizontal misalignment
  return (
    distance +
    Math.max(box1.left - box2.left, 0) +
    Math.max(box2.right - box1.right, 0)
  );
}

/**
 * Check if box1 is below box2.
 * Returns distance score or undefined if not below.
 *
 * Distance calculation:
 * - Primary: vertical gap between box1.top and box2.bottom
 * - Penalty: horizontal misalignment
 *
 * @param box1 - The element being checked
 * @param box2 - The reference element
 * @param maxDistance - Maximum vertical distance allowed
 * @returns Distance score (lower is better) or undefined if not below
 */
export function boxBelow(
  box1: DOMRect,
  box2: DOMRect,
  maxDistance: number | undefined
): number | undefined {
  const distance = box1.top - box2.bottom;
  if (distance < 0 || (maxDistance !== undefined && distance > maxDistance)) {
    return undefined;
  }
  // Add penalty for horizontal misalignment
  return (
    distance +
    Math.max(box1.left - box2.left, 0) +
    Math.max(box2.right - box1.right, 0)
  );
}

/**
 * Check if box1 is near box2.
 * Returns distance score or undefined if not near.
 *
 * Distance calculation:
 * - Sum of all gaps (top, bottom, left, right) between the boxes
 * - Default threshold is 50px
 *
 * @param box1 - The element being checked
 * @param box2 - The reference element
 * @param maxDistance - Maximum total gap allowed (default: 50)
 * @returns Distance score (lower is better) or undefined if not near
 */
export function boxNear(
  box1: DOMRect,
  box2: DOMRect,
  maxDistance: number | undefined
): number | undefined {
  const threshold = maxDistance === undefined ? 50 : maxDistance;
  let score = 0;

  // Calculate gap on each side (only add positive gaps)
  if (box1.left - box2.right >= 0) {
    score += box1.left - box2.right; // box1 is to the right
  }
  if (box2.left - box1.right >= 0) {
    score += box2.left - box1.right; // box1 is to the left
  }
  if (box2.top - box1.bottom >= 0) {
    score += box2.top - box1.bottom; // box1 is above
  }
  if (box1.top - box2.bottom >= 0) {
    score += box1.top - box2.bottom; // box1 is below
  }

  return score > threshold ? undefined : score;
}

/**
 * Map of layout selector names to their scoring functions.
 */
const layoutScorers: Record<
  LayoutSelectorName,
  (
    box1: DOMRect,
    box2: DOMRect,
    maxDistance: number | undefined
  ) => number | undefined
> = {
  'left-of': boxLeftOf,
  'right-of': boxRightOf,
  above: boxAbove,
  below: boxBelow,
  near: boxNear,
};

/**
 * Calculate the score for an element's position relative to inner elements.
 * Lower score = better match. Returns undefined if not matching.
 *
 * @param name - The layout selector name
 * @param element - The element being scored
 * @param innerElements - Reference elements to compare against
 * @param maxDistance - Optional maximum distance constraint
 * @returns Best score across all inner elements, or undefined if none match
 */
export function layoutSelectorScore(
  name: LayoutSelectorName,
  element: Element,
  innerElements: Element[],
  maxDistance: number | undefined
): number | undefined {
  const box = element.getBoundingClientRect();
  const scorer = layoutScorers[name];

  let bestScore: number | undefined;
  for (const innerElement of innerElements) {
    if (innerElement === element) {
      continue;
    }
    const score = scorer(box, innerElement.getBoundingClientRect(), maxDistance);
    if (score === undefined) {
      continue;
    }
    if (bestScore === undefined || score < bestScore) {
      bestScore = score;
    }
  }
  return bestScore;
}

/**
 * Parse layout selector body into inner selector and optional maxDistance.
 * Format: "innerSelector" or "innerSelector, maxDistance"
 *
 * @param body - The selector body
 * @returns Parsed inner selector and maxDistance
 */
function parseLayoutSelectorBody(body: string): {
  innerSelector: string;
  maxDistance: number | undefined;
} {
  // Look for a comma followed by a number at the end
  // Handle nested parentheses in the inner selector
  let depth = 0;
  let lastCommaIndex = -1;

  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char === '(' || char === '[') {
      depth++;
    } else if (char === ')' || char === ']') {
      depth--;
    } else if (char === ',' && depth === 0) {
      lastCommaIndex = i;
    }
  }

  if (lastCommaIndex !== -1) {
    const potentialDistance = body.slice(lastCommaIndex + 1).trim();
    const distanceNum = parseInt(potentialDistance, 10);
    if (!isNaN(distanceNum) && String(distanceNum) === potentialDistance) {
      return {
        innerSelector: body.slice(0, lastCommaIndex).trim(),
        maxDistance: distanceNum,
      };
    }
  }

  return {
    innerSelector: body.trim(),
    maxDistance: undefined,
  };
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
 * Create a layout selector engine for the given name.
 *
 * @param name - The layout selector name
 * @returns A selector engine for the layout selector
 */
export function createLayoutEngine(name: LayoutSelectorName): SelectorEngine {
  return {
    name: `internal:${name}`,
    query(root: SelectorRoot, body: string): Element | null {
      const results = this.queryAll(root, body);
      return results[0] || null;
    },
    queryAll(root: SelectorRoot, body: string): Element[] {
      const { innerSelector, maxDistance } = parseLayoutSelectorBody(body);

      // Get reference elements from the inner selector
      const innerElements = queryWithSelector(root, innerSelector);
      if (innerElements.length === 0) {
        return [];
      }

      // Get all elements to check
      const allElements =
        root instanceof Element
          ? Array.from(root.querySelectorAll('*'))
          : Array.from(root.querySelectorAll('*'));

      // Score each element and filter/sort by score
      const scored: Array<{ element: Element; score: number }> = [];
      for (const element of allElements) {
        const score = layoutSelectorScore(
          name,
          element,
          innerElements,
          maxDistance
        );
        if (score !== undefined) {
          scored.push({ element, score });
        }
      }

      // Sort by score (lower is better)
      scored.sort((a, b) => a.score - b.score);

      return scored.map((s) => s.element);
    },
  };
}

/**
 * All layout engines for registration.
 */
export const layoutEngines: Record<string, SelectorEngine> = {
  'internal:left-of': createLayoutEngine('left-of'),
  'internal:right-of': createLayoutEngine('right-of'),
  'internal:above': createLayoutEngine('above'),
  'internal:below': createLayoutEngine('below'),
  'internal:near': createLayoutEngine('near'),
};

/**
 * Register all layout engines with the global registry.
 */
export function registerLayoutEngines(): void {
  for (const engine of Object.values(layoutEngines)) {
    selectorEngines.register(engine);
  }
}
