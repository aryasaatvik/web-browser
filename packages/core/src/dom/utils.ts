/**
 * General DOM utilities.
 */

/**
 * Get the owner document of an element or document.
 */
export function getOwnerDocument(node: Element | Document): Document {
  return node instanceof Document ? node : node.ownerDocument!;
}

/**
 * Get the owner window of an element or document.
 */
export function getOwnerWindow(node: Element | Document): Window {
  return getOwnerDocument(node).defaultView!;
}

/**
 * Check if an element is a form control.
 */
export function isFormControl(element: Element): element is
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement
  | HTMLButtonElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLButtonElement
  );
}

/**
 * Check if an element is editable (can receive text input).
 */
export function isEditable(element: Element): boolean {
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    const editableTypes = [
      'text', 'password', 'email', 'number', 'search',
      'tel', 'url', 'date', 'datetime-local', 'month',
      'time', 'week', 'color'
    ];
    return editableTypes.includes(type) && !element.readOnly && !element.disabled;
  }

  if (element instanceof HTMLTextAreaElement) {
    return !element.readOnly && !element.disabled;
  }

  // Check contenteditable
  if (element.getAttribute('contenteditable') === 'true') {
    return true;
  }

  return false;
}

/**
 * Check if an element can be focused.
 */
export function isFocusable(element: Element): boolean {
  // Check tabindex
  const tabIndex = element.getAttribute('tabindex');
  if (tabIndex !== null && parseInt(tabIndex, 10) >= 0) {
    return true;
  }

  // Naturally focusable elements
  if (element instanceof HTMLAnchorElement && element.href) return true;
  if (element instanceof HTMLButtonElement && !element.disabled) return true;
  if (element instanceof HTMLInputElement && !element.disabled) return true;
  if (element instanceof HTMLTextAreaElement && !element.disabled) return true;
  if (element instanceof HTMLSelectElement && !element.disabled) return true;

  // Contenteditable
  if (element.getAttribute('contenteditable') === 'true') return true;

  return false;
}

/**
 * Get the input type of an element.
 */
export function getInputType(element: Element): string | null {
  if (element instanceof HTMLInputElement) {
    return element.type.toLowerCase();
  }
  if (element instanceof HTMLTextAreaElement) {
    return 'textarea';
  }
  if (element instanceof HTMLSelectElement) {
    return 'select';
  }
  return null;
}

/**
 * Scroll an element into view if needed.
 */
export function scrollIntoViewIfNeeded(element: Element, options?: ScrollIntoViewOptions): void {
  const rect = element.getBoundingClientRect();
  const isInViewport =
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth;

  if (!isInViewport) {
    element.scrollIntoView(options ?? { block: 'center', inline: 'center', behavior: 'instant' });
  }
}

/**
 * Get the text content of an element, normalized.
 */
export function getNormalizedText(element: Element): string {
  return (element.textContent || '').replace(/\s+/g, ' ').trim();
}
