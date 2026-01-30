/**
 * Element reference system using WeakRef.
 * Allows referencing elements by stable IDs across tool calls.
 */

export interface ElementRef {
  id: string;
  element: WeakRef<Element>;
}

/**
 * Map of reference IDs to element WeakRefs.
 */
const elementMap = new Map<string, WeakRef<Element>>();

/**
 * Counter for generating unique reference IDs.
 */
let nextRefId = 1;

/**
 * Prefix for reference IDs.
 */
const REF_PREFIX = 'ref_';

/**
 * Get or create a reference ID for an element.
 */
export function getElementRef(element: Element): string {
  // Check if element already has a ref
  for (const [id, ref] of elementMap) {
    const el = ref.deref();
    if (el === element) {
      return id;
    }
  }

  // Create a new ref
  const id = `${REF_PREFIX}${nextRefId++}`;
  elementMap.set(id, new WeakRef(element));
  return id;
}

/**
 * Get an element by its reference ID.
 */
export function getElementByRef(refId: string): Element | null {
  const ref = elementMap.get(refId);
  if (!ref) return null;

  const element = ref.deref();
  if (!element) {
    // Element was garbage collected
    elementMap.delete(refId);
    return null;
  }

  // Check if element is still connected to the DOM
  if (!element.isConnected) {
    elementMap.delete(refId);
    return null;
  }

  return element;
}

/**
 * Check if a reference ID is valid.
 */
export function isValidRef(refId: string): boolean {
  return getElementByRef(refId) !== null;
}

/**
 * Clear all element references.
 */
export function clearElementRefs(): void {
  elementMap.clear();
  nextRefId = 1;
}

/**
 * Clean up stale references (elements that were garbage collected or disconnected).
 */
export function cleanupStaleRefs(): number {
  let cleaned = 0;
  for (const [id, ref] of elementMap) {
    const element = ref.deref();
    if (!element || !element.isConnected) {
      elementMap.delete(id);
      cleaned++;
    }
  }
  return cleaned;
}

/**
 * Get the number of active references.
 */
export function getRefCount(): number {
  cleanupStaleRefs();
  return elementMap.size;
}

/**
 * Create a batch of element references.
 */
export function createElementRefs(elements: Element[]): string[] {
  return elements.map(getElementRef);
}

/**
 * Resolve multiple references to elements.
 */
export function resolveElementRefs(refIds: string[]): (Element | null)[] {
  return refIds.map(getElementByRef);
}
