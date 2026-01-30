/**
 * Element retargeting utilities.
 *
 * Handles cases where the logical interaction target differs from the DOM element
 * under the cursor. For example:
 * - Clicking a label should target the associated input
 * - Clicking text inside a button should target the button
 * - Clicking an icon inside a link should target the link
 *
 * Based on Playwright's retarget() implementation.
 */

import { isFormControl } from './utils.js';

/**
 * Retargeting behavior options.
 */
export type RetargetBehavior =
  | 'none' // Return element as-is
  | 'follow-label' // Follow label to associated form control
  | 'button-link' // Find nearest button or link ancestor
  | 'no-follow-label'; // Find interactive parent without following labels

/**
 * Check if an element is a label.
 */
export function isLabelElement(element: Element): element is HTMLLabelElement {
  return element instanceof HTMLLabelElement;
}

/**
 * Check if an element is interactive (button, link, or has interactive role).
 */
export function isInteractiveElement(element: Element): boolean {
  // Native interactive elements
  if (element instanceof HTMLButtonElement) return true;
  if (element instanceof HTMLAnchorElement && element.hasAttribute('href')) return true;

  // Check interactive roles
  const role = element.getAttribute('role');
  if (role === 'button' || role === 'link' || role === 'checkbox' || role === 'radio') {
    return true;
  }

  return false;
}

/**
 * Check if an element is an input-like element (can receive input).
 */
export function isInputLike(element: Element): boolean {
  if (element instanceof HTMLInputElement) return true;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLSelectElement) return true;
  if ((element as HTMLElement).isContentEditable) return true;
  return false;
}

/**
 * Check if an element is an action target (button, link, checkbox, radio, etc.).
 */
export function isActionTarget(element: Element): boolean {
  // Native elements
  if (element instanceof HTMLAnchorElement) return true;
  if (element instanceof HTMLButtonElement) return true;
  if (element instanceof HTMLInputElement) return true;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLSelectElement) return true;
  if ((element as HTMLElement).isContentEditable) return true;

  // Check interactive roles
  const role = element.getAttribute('role');
  if (
    role === 'button' ||
    role === 'link' ||
    role === 'checkbox' ||
    role === 'radio'
  ) {
    return true;
  }

  return false;
}

/**
 * Find the form control associated with a label element.
 * Handles both `for` attribute and nested controls.
 */
export function getLabelTarget(label: HTMLLabelElement): Element | null {
  // First, check the 'for' attribute
  const forAttr = label.getAttribute('for');
  if (forAttr) {
    const target = label.ownerDocument.getElementById(forAttr);
    if (target && isFormControl(target)) {
      return target;
    }
  }

  // Check the label's control property (handles nested controls automatically)
  if (label.control) {
    return label.control;
  }

  // Fallback: manually check for nested control
  const nested = label.querySelector('input, textarea, select, button');
  return nested;
}

/**
 * Find the nearest interactive ancestor (button or link).
 * Used for 'button-link' behavior.
 */
export function getInteractiveAncestor(element: Element): Element | null {
  return element.closest('button, [role="button"], a, [role="link"]');
}

/**
 * Find the nearest interactive ancestor including checkbox/radio roles.
 * Used for 'follow-label' and 'no-follow-label' behaviors.
 */
export function getInteractiveAncestorWithCheckbox(element: Element): Element | null {
  return element.closest('button, [role="button"], [role="checkbox"], [role="radio"]');
}

/**
 * Retarget an element based on the specified behavior.
 *
 * This handles cases where the logical interaction target differs
 * from the DOM element under the cursor. For example:
 * - Clicking a label should target the associated input
 * - Clicking text inside a button should target the button
 * - Clicking an icon inside a link should target the link
 *
 * @param node - The node to retarget (can be Element or Text node)
 * @param behavior - The retargeting behavior to apply
 * @returns The retargeted element, or null if the node has no element
 */
export function retarget(
  node: Node | null,
  behavior: RetargetBehavior
): Element | null {
  if (!node) return null;

  // Convert to element (handle text nodes)
  let element: Element | null =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;

  if (!element) return null;

  // 'none' - return as-is
  if (behavior === 'none') return element;

  // Check if element is an input-like element (input, textarea, select, contenteditable)
  const inputLike = isInputLike(element);

  if (!inputLike) {
    if (behavior === 'button-link') {
      // For button-link, look for button or link ancestor
      element = getInteractiveAncestor(element) || element;
    } else {
      // For follow-label and no-follow-label, include checkbox/radio
      element = getInteractiveAncestorWithCheckbox(element) || element;
    }
  }

  // For 'follow-label', also check if we should follow label to its control
  if (behavior === 'follow-label') {
    // Only follow label if element is not already an action target
    if (!isActionTarget(element)) {
      // Look for enclosing label and follow to its control
      const enclosingLabel = element.closest('label') as HTMLLabelElement | null;
      if (enclosingLabel && enclosingLabel.control) {
        element = enclosingLabel.control;
      }
    }
  }

  return element;
}

// Re-export isFormControl for convenience
export { isFormControl } from './utils.js';
