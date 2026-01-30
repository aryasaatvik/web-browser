/**
 * ARIA hidden detection utilities.
 * Determines if elements are hidden from the accessibility tree.
 *
 * Based on W3C WAI-ARIA spec and Playwright's implementation patterns.
 * https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion
 */

import { ariaCache } from './cache.js';

/**
 * Options for hidden element checks.
 */
export interface HiddenCheckOptions {
  /** Check aria-hidden attribute (default: true) */
  includeAria?: boolean;
  /** Check CSS visibility/display (default: true) */
  includeCSS?: boolean;
  /** Check slot assignment for shadow DOM (default: true) */
  includeSlot?: boolean;
}

const defaultHiddenOptions: Required<HiddenCheckOptions> = {
  includeAria: true,
  includeCSS: true,
  includeSlot: true,
};

/**
 * Tags that are always ignored for ARIA purposes.
 * These elements have no accessible semantics.
 */
const IGNORED_TAGS = new Set(['STYLE', 'SCRIPT', 'NOSCRIPT', 'TEMPLATE']);

/**
 * Check if an element is one of the always-ignored tags.
 */
export function isIgnoredForAria(element: Element): boolean {
  return IGNORED_TAGS.has(element.tagName);
}

/**
 * Check if element or any ancestor has aria-hidden="true".
 * Once aria-hidden is set, all descendants are hidden from the accessibility tree.
 */
export function hasAriaHidden(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (current.getAttribute('aria-hidden') === 'true') {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * Check if element is in an inert subtree.
 * Elements inside an inert element or its descendants are not focusable
 * and are hidden from the accessibility tree.
 */
export function isInertSubtree(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (current.hasAttribute('inert')) {
      return true;
    }
    // Also check for dialog-related inertness
    // When a modal dialog is open, content outside is inert
    if (current instanceof HTMLDialogElement && current.open) {
      // Check if there's an open modal dialog that doesn't contain this element
      const openModals = document.querySelectorAll('dialog[open]');
      for (const modal of openModals) {
        if (modal !== current && modal.hasAttribute('open')) {
          const isModal = modal.getAttribute('open') !== null;
          if (isModal && !modal.contains(element)) {
            return true;
          }
        }
      }
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * Check if element is hidden via CSS.
 * Considers display, visibility, and opacity.
 */
export function isHiddenByCSS(element: Element): boolean {
  // First check for elements without styles (disconnected)
  if (!element.isConnected) {
    return true;
  }

  const style = getComputedStyle(element);

  // display:none hides the element and all descendants
  if (style.display === 'none') {
    return true;
  }

  // visibility:hidden hides the element (but children can override)
  if (style.visibility === 'hidden' || style.visibility === 'collapse') {
    return true;
  }

  // opacity:0 - technically visible for layout but not perceivable
  // Note: We don't consider opacity:0 as hidden for ARIA because
  // screen readers often still announce these elements
  // Uncomment if you want stricter visual hiding:
  // if (parseFloat(style.opacity) === 0) return true;

  // content-visibility:hidden similar to display:none for content
  if (style.contentVisibility === 'hidden') {
    return true;
  }

  return false;
}

/**
 * Check if element is hidden due to display:contents.
 * Elements with display:contents don't generate a box but their children do.
 * For ARIA, we need to check if any children are visible.
 */
export function isDisplayContentsWithNoVisibleChildren(element: Element): boolean {
  const style = getComputedStyle(element);
  if (style.display !== 'contents') {
    return false;
  }

  // Check if slot - slots with display:contents are handled specially
  if (element.tagName === 'SLOT') {
    return false;
  }

  // Check if any child is visible
  for (let child = element.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      if (!isElementHiddenForAria(child as Element)) {
        return false;
      }
    } else if (child.nodeType === Node.TEXT_NODE) {
      // Check if text node has visible content
      const text = child.textContent?.trim();
      if (text) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Check if element is hidden due to not being slotted in shadow DOM.
 * When a parent has a shadow root, children must be slotted to be rendered.
 */
export function isNotSlotted(element: Element): boolean {
  const parent = element.parentElement;
  if (!parent) {
    return false;
  }

  // If parent has shadow root and element isn't assigned to a slot
  if (parent.shadowRoot && !(element as HTMLElement).assignedSlot) {
    return true;
  }

  return false;
}

/**
 * Check if element is hidden for ARIA/accessibility purposes.
 * This is the main entry point for hidden detection.
 *
 * An element is hidden for ARIA if:
 * - It's an ignored tag (script, style, etc.)
 * - It or an ancestor has aria-hidden="true"
 * - It's hidden via CSS (display:none, visibility:hidden)
 * - It's in an inert subtree
 * - It's not slotted when parent has shadow DOM
 * - It has display:contents with no visible children
 *
 * @param element The element to check
 * @param options Optional configuration for which checks to perform
 */
export function isElementHiddenForAria(
  element: Element,
  options: HiddenCheckOptions = {}
): boolean {
  // Only cache when using default options (most common case)
  const usingDefaults =
    options.includeAria === undefined &&
    options.includeCSS === undefined &&
    options.includeSlot === undefined;

  if (ariaCache.isActive() && usingDefaults) {
    return ariaCache.getIsHidden(element, () => {
      return isElementHiddenForAriaCore(element, options);
    });
  }

  return isElementHiddenForAriaCore(element, options);
}

/**
 * Core implementation of hidden detection.
 */
function isElementHiddenForAriaCore(
  element: Element,
  options: HiddenCheckOptions = {}
): boolean {
  const opts = { ...defaultHiddenOptions, ...options };

  // Always check ignored tags
  if (isIgnoredForAria(element)) {
    return true;
  }

  // Check aria-hidden attribute
  if (opts.includeAria && hasAriaHidden(element)) {
    return true;
  }

  // Check CSS hiding
  if (opts.includeCSS) {
    if (isHiddenByCSS(element)) {
      return true;
    }

    // Check for display:contents with no visible children
    if (isDisplayContentsWithNoVisibleChildren(element)) {
      return true;
    }
  }

  // Check slot assignment
  if (opts.includeSlot && isNotSlotted(element)) {
    return true;
  }

  // Check if in inert subtree
  if (isInertSubtree(element)) {
    return true;
  }

  // Check ancestors for display:none (which hides all descendants)
  if (opts.includeCSS) {
    let parent = element.parentElement;
    while (parent) {
      const style = getComputedStyle(parent);
      if (style.display === 'none') {
        return true;
      }
      parent = parent.parentElement;
    }
  }

  return false;
}

/**
 * Check if element is visually visible (has perceivable rendering).
 * This is different from isElementHiddenForAria - an element can be
 * ARIA-visible but not visually visible (e.g., for screen reader only content).
 */
export function isElementVisuallyVisible(element: Element): boolean {
  if (!element.isConnected) {
    return false;
  }

  const style = getComputedStyle(element);

  // Check display
  if (style.display === 'none') {
    return false;
  }

  // display:contents is special - element has no box but children might
  if (style.display === 'contents') {
    return true; // Consider visible for children's sake
  }

  // Check visibility
  if (style.visibility === 'hidden' || style.visibility === 'collapse') {
    return false;
  }

  // Check opacity
  if (parseFloat(style.opacity) === 0) {
    return false;
  }

  // Check content-visibility (may not be supported in all environments)
  if ((style as CSSStyleDeclaration & { contentVisibility?: string }).contentVisibility === 'hidden') {
    return false;
  }

  // Check dimensions - zero size usually means not visible
  // In happy-dom and test environments, getBoundingClientRect may return zeros
  // So we only check if we can actually get a rect
  try {
    const rect = element.getBoundingClientRect();
    // Only fail on zero size if we're sure the element has explicit zero dimensions
    const hasExplicitZeroSize =
      (style.width === '0' || style.width === '0px') &&
      (style.height === '0' || style.height === '0px');
    if (hasExplicitZeroSize && rect.width === 0 && rect.height === 0) {
      return false;
    }
  } catch {
    // getBoundingClientRect not available, assume visible
  }

  return true;
}

/**
 * Determine element visibility based on mode.
 *
 * @param element The element to check
 * @param mode The visibility mode:
 *   - 'aria': Only check ARIA visibility (aria-hidden, etc.)
 *   - 'ariaOrVisible': Include if ARIA-visible OR visually visible
 *   - 'ariaAndVisible': Must be both ARIA-visible AND visually visible
 */
export function checkElementVisibility(
  element: Element,
  mode: 'aria' | 'ariaOrVisible' | 'ariaAndVisible' = 'ariaAndVisible'
): boolean {
  const ariaVisible = !isElementHiddenForAria(element);
  const visuallyVisible = isElementVisuallyVisible(element);

  switch (mode) {
    case 'aria':
      return ariaVisible;
    case 'ariaOrVisible':
      return ariaVisible || visuallyVisible;
    case 'ariaAndVisible':
      return ariaVisible && visuallyVisible;
    default:
      return ariaVisible && visuallyVisible;
  }
}
