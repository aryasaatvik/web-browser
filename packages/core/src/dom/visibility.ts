/**
 * Type definition for Element.checkVisibility options.
 * This API is supported in modern browsers.
 */
interface CheckVisibilityOptions {
  checkOpacity?: boolean;
  checkVisibilityCSS?: boolean;
  contentVisibilityAuto?: boolean;
  opacityProperty?: boolean;
  visibilityProperty?: boolean;
}

/**
 * Check if an element is inside a closed <details> element.
 * This is a WebKit workaround since WebKit doesn't properly report
 * visibility for content inside collapsed <details>.
 */
function isInsideClosedDetails(element: Element): boolean {
  const detailsOrSummary = element.closest('details,summary');
  if (detailsOrSummary !== element &&
      detailsOrSummary?.nodeName === 'DETAILS' &&
      !(detailsOrSummary as HTMLDetailsElement).open) {
    return true;
  }
  return false;
}

/**
 * Check if a text node is visible (has a non-zero bounding rect).
 */
export function isVisibleTextNode(node: Text): boolean {
  const range = node.ownerDocument.createRange();
  range.selectNode(node);
  const rect = range.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Check element visibility using modern Element.checkVisibility() API.
 * Falls back to manual checks for older browsers.
 * More comprehensive than basic isElementVisible() as it checks:
 * - visibility CSS property
 * - content-visibility CSS property
 * - Elements in user-agent shadow roots (like <details>)
 */
export function isElementStyleVisible(element: Element, style?: CSSStyleDeclaration): boolean {
  style = style ?? getComputedStyle(element);

  // Use the modern checkVisibility API if available
  // Note: We apply the WebKit workaround for <details> elements
  const checkVisibility = (element as unknown as { checkVisibility?: (options?: CheckVisibilityOptions) => boolean }).checkVisibility;
  if (typeof checkVisibility === 'function') {
    // checkVisibility handles content-visibility and user-agent shadow roots
    if (!checkVisibility.call(element, { checkVisibilityCSS: true, checkOpacity: false })) {
      return false;
    }
  } else {
    // Manual fallback for browsers without checkVisibility
    // Check if inside a closed <details> element (WebKit workaround)
    if (isInsideClosedDetails(element)) {
      return false;
    }

    // Check content-visibility property manually
    const contentVisibility = style.getPropertyValue('content-visibility');
    if (contentVisibility === 'hidden') {
      return false;
    }
  }

  // Check visibility CSS property
  // Note: empty string is treated as 'visible' (default value)
  const visibility = style.visibility;
  if (visibility !== 'visible' && visibility !== '' && visibility !== 'inherit') {
    return false;
  }

  return true;
}

/**
 * Check if an element is visible.
 * An element is considered visible if it has a bounding box,
 * is not hidden via CSS, and is within the viewport.
 */
export function isElementVisible(element: Element): boolean {
  // Check if element exists and is connected to the DOM
  if (!element.isConnected) return false;

  // Get computed style
  const style = getComputedStyle(element);

  // Check display - but display:contents is special (element not rendered but children are)
  if (style.display === 'none') {
    return false;
  }

  // Elements with display:contents have no box but their children may be visible
  if (style.display === 'contents') {
    // Check if any child element or text node is visible
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.ELEMENT_NODE && isElementVisible(child as Element)) {
        return true;
      }
      if (child.nodeType === Node.TEXT_NODE && isVisibleTextNode(child as Text)) {
        return true;
      }
    }
    return false;
  }

  // Use the comprehensive style visibility check
  if (!isElementStyleVisible(element, style)) {
    return false;
  }

  // Check opacity
  if (parseFloat(style.opacity) === 0) {
    return false;
  }

  // Check bounding box
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }

  return true;
}

/**
 * Check if an element is at least threshold% visible in the viewport.
 * @param element The element to check
 * @param threshold The minimum ratio (0-1) of the element that must be visible. Default is 0 (any part visible).
 */
export function isInViewport(element: Element, threshold: number = 0): boolean {
  const rect = element.getBoundingClientRect();

  // If element has no size, it's not in viewport
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Calculate visible portion
  const visibleLeft = Math.max(0, rect.left);
  const visibleTop = Math.max(0, rect.top);
  const visibleRight = Math.min(viewportWidth, rect.right);
  const visibleBottom = Math.min(viewportHeight, rect.bottom);

  const visibleWidth = Math.max(0, visibleRight - visibleLeft);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);

  const visibleArea = visibleWidth * visibleHeight;
  const totalArea = rect.width * rect.height;

  const ratio = visibleArea / totalArea;

  return ratio > threshold;
}

/**
 * Get the ratio of element visible in viewport (0-1).
 * Uses IntersectionObserver for accurate calculation.
 * Returns 0 for hidden elements, 1 for fully visible.
 */
export async function getViewportRatio(element: Element): Promise<number> {
  return new Promise((resolve) => {
    // If element is not connected, return 0
    if (!element.isConnected) {
      resolve(0);
      return;
    }

    // If IntersectionObserver is not available, fall back to manual calculation
    if (typeof IntersectionObserver === 'undefined') {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        resolve(0);
        return;
      }

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const visibleLeft = Math.max(0, rect.left);
      const visibleTop = Math.max(0, rect.top);
      const visibleRight = Math.min(viewportWidth, rect.right);
      const visibleBottom = Math.min(viewportHeight, rect.bottom);

      const visibleWidth = Math.max(0, visibleRight - visibleLeft);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);

      const ratio = (visibleWidth * visibleHeight) / (rect.width * rect.height);
      resolve(ratio);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      observer.disconnect();
      resolve(entries[0]?.intersectionRatio ?? 0);
    });
    observer.observe(element);
  });
}

/**
 * Check if an element is interactable (visible, not covered by pointer-events:none).
 * This is separate from actionable - an element might be visible but not clickable.
 */
export function isElementInteractable(element: Element): boolean {
  if (!isElementVisible(element)) return false;

  const style = getComputedStyle(element);
  if (style.pointerEvents === 'none') {
    return false;
  }

  return true;
}

/**
 * Check if an element is actionable (visible, enabled, not covered).
 */
export function isElementActionable(element: Element): boolean {
  if (!isElementInteractable(element)) return false;

  // Check if element is disabled
  if (element instanceof HTMLInputElement ||
      element instanceof HTMLButtonElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement) {
    if (element.disabled) return false;
  }

  // Check aria-disabled
  if (element.getAttribute('aria-disabled') === 'true') {
    return false;
  }

  return true;
}

/**
 * Get the center point of an element's bounding box.
 */
export function getElementCenter(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/**
 * Get a clickable point on an element.
 * Tries the center first, then looks for an uncovered point.
 */
export function getClickablePoint(element: Element): { x: number; y: number } | null {
  if (!isElementVisible(element)) return null;

  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  // Check if center is clickable
  const elementAtCenter = document.elementFromPoint(centerX, centerY);
  if (elementAtCenter && (elementAtCenter === element || element.contains(elementAtCenter))) {
    return { x: centerX, y: centerY };
  }

  // Try other points in a grid pattern
  const points = [
    { x: rect.left + rect.width * 0.25, y: rect.top + rect.height * 0.25 },
    { x: rect.left + rect.width * 0.75, y: rect.top + rect.height * 0.25 },
    { x: rect.left + rect.width * 0.25, y: rect.top + rect.height * 0.75 },
    { x: rect.left + rect.width * 0.75, y: rect.top + rect.height * 0.75 },
    { x: rect.left + 1, y: rect.top + rect.height / 2 },
    { x: rect.right - 1, y: rect.top + rect.height / 2 },
  ];

  for (const point of points) {
    const elementAtPoint = document.elementFromPoint(point.x, point.y);
    if (elementAtPoint && (elementAtPoint === element || element.contains(elementAtPoint))) {
      return point;
    }
  }

  // Fall back to center even if covered
  return { x: centerX, y: centerY };
}

/**
 * Return type for computeElementBox function.
 */
export interface ElementBoxInfo {
  /** Whether the element is visible */
  visible: boolean;
  /** Whether the element is inline (as opposed to block) */
  inline: boolean;
  /** The cursor style for this element */
  cursor?: string;
}

/**
 * Compute box information similar to Playwright's computeBox.
 * Returns visibility, inline vs block, and cursor style.
 * Returns null for disconnected elements.
 */
export function computeElementBox(element: Element): ElementBoxInfo | null {
  // Check if element is connected to the DOM
  if (!element.isConnected) {
    return null;
  }

  const style = getComputedStyle(element);
  const cursor = style.cursor;

  // Handle display:contents - element not rendered but children may be
  if (style.display === 'contents') {
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.ELEMENT_NODE && isElementVisible(child as Element)) {
        return { visible: true, inline: false, cursor };
      }
      if (child.nodeType === Node.TEXT_NODE && isVisibleTextNode(child as Text)) {
        return { visible: true, inline: true, cursor };
      }
    }
    return { visible: false, inline: false, cursor };
  }

  // Check style visibility
  if (!isElementStyleVisible(element, style)) {
    return { visible: false, inline: false, cursor };
  }

  // Check bounding box
  const rect = element.getBoundingClientRect();
  const visible = rect.width > 0 && rect.height > 0;
  const inline = style.display === 'inline';

  return { visible, inline, cursor };
}

/**
 * Check if element receives pointer events.
 * Considers pointer-events CSS property and element visibility.
 * Returns false for hidden elements or elements with pointer-events: none.
 */
export function receivesPointerEvents(element: Element): boolean {
  // Element must be connected to the DOM
  if (!element.isConnected) {
    return false;
  }

  // Element must be visible to receive pointer events
  if (!isElementVisible(element)) {
    return false;
  }

  // Check pointer-events CSS property
  const style = getComputedStyle(element);
  if (style.pointerEvents === 'none') {
    return false;
  }

  return true;
}
