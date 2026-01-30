/**
 * Hit target interception utilities.
 *
 * These utilities help prevent race conditions in click operations by:
 * 1. Verifying that a click point will hit the expected element
 * 2. Intercepting events at dispatch time to validate the target
 *
 * Based on Playwright's hit target interception pattern.
 */

// ============================================================================
// Types
// ============================================================================

export interface HitTargetResult {
  /** Whether the hit target check succeeded */
  success: boolean;
  /** Whether the click was blocked by another element */
  blocked?: boolean;
  /** Description of the element that blocked the click */
  hitTargetDescription?: string;
}

export type HitTargetAction = 'click' | 'hover' | 'drag' | 'tap';

export interface HitTargetInterceptorOptions {
  /**
   * Block all events regardless of hit target result.
   * Useful for strict safety scenarios.
   */
  blockAllEvents?: boolean;
}

export interface HitTargetInterceptor {
  /** Verify the current state of hit target interception */
  verify: () => HitTargetResult;
  /** Stop the interceptor and clean up event listeners */
  stop: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the parent element, crossing shadow DOM boundaries.
 */
function parentElementOrShadowHost(element: Element): Element | undefined {
  if (element.parentElement) {
    return element.parentElement;
  }
  if (!element.parentNode) {
    return undefined;
  }
  // Check if parent is a shadow root
  if (
    element.parentNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE &&
    (element.parentNode as ShadowRoot).host
  ) {
    return (element.parentNode as ShadowRoot).host;
  }
  return undefined;
}

/**
 * Get the enclosing shadow root or document for an element.
 */
function enclosingShadowRootOrDocument(
  element: Element
): Document | ShadowRoot | undefined {
  let node: Node = element;
  while (node.parentNode) {
    node = node.parentNode;
  }
  if (
    node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ||
    node.nodeType === Node.DOCUMENT_NODE
  ) {
    return node as Document | ShadowRoot;
  }
  return undefined;
}

/**
 * Truncate a string with ellipsis if it exceeds the max length.
 */
function truncateWithEllipsis(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 1) + '\u2026';
}

/**
 * Convert a string to a single line (replace whitespace with single spaces).
 */
function toSingleLine(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

// ============================================================================
// Element Description
// ============================================================================

/** HTML elements that are self-closing (void elements) */
const SELF_CLOSING_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** HTML boolean attributes */
const BOOLEAN_ATTRIBUTES = new Set([
  'async',
  'autofocus',
  'autoplay',
  'checked',
  'controls',
  'default',
  'defer',
  'disabled',
  'formnovalidate',
  'hidden',
  'inert',
  'ismap',
  'itemscope',
  'loop',
  'multiple',
  'muted',
  'nomodule',
  'novalidate',
  'open',
  'playsinline',
  'readonly',
  'required',
  'reversed',
  'selected',
]);

/**
 * Get a human-readable description of an element for error messages.
 *
 * @example
 * describeElement(document.querySelector('button'))
 * // => '<button class="primary">Click me</button>'
 */
export function describeElement(element: Element): string {
  if (!element) {
    return '<unknown>';
  }

  const tagName = element.tagName.toLowerCase();

  // Collect attributes, sorted by length for readability
  const attrs: string[] = [];
  for (let i = 0; i < element.attributes.length; i++) {
    const { name, value } = element.attributes[i];
    // Skip style attribute as it's usually too verbose
    if (name === 'style') {
      continue;
    }
    if (!value && BOOLEAN_ATTRIBUTES.has(name)) {
      attrs.push(` ${name}`);
    } else {
      attrs.push(` ${name}="${value}"`);
    }
  }
  attrs.sort((a, b) => a.length - b.length);
  const attrText = truncateWithEllipsis(attrs.join(''), 500);

  // Self-closing tags
  if (SELF_CLOSING_TAGS.has(tagName)) {
    return toSingleLine(`<${tagName}${attrText}/>`);
  }

  // Check if the element only contains text nodes
  const children = element.childNodes;
  let onlyText = false;
  if (children.length <= 5) {
    onlyText = true;
    for (let i = 0; i < children.length; i++) {
      onlyText = onlyText && children[i].nodeType === Node.TEXT_NODE;
    }
  }

  const text = onlyText
    ? element.textContent || ''
    : children.length
      ? '\u2026'
      : '';

  return toSingleLine(
    `<${tagName}${attrText}>${truncateWithEllipsis(text, 50)}</${tagName}>`
  );
}

// ============================================================================
// Hit Target Checking
// ============================================================================

/**
 * Check if the hit point lands on the target element or its descendants.
 *
 * This function performs a thorough check that:
 * 1. Traverses all shadow DOM boundaries correctly
 * 2. Handles display:contents elements
 * 3. Follows the composed tree (slots and shadow DOM)
 *
 * @param hitPoint - The point to check (client coordinates)
 * @param targetElement - The element we expect to hit
 * @returns HitTargetResult indicating success or failure with description
 */
export function expectHitTarget(
  hitPoint: { x: number; y: number },
  targetElement: Element
): HitTargetResult {
  // Handle disconnected elements
  if (!targetElement.isConnected) {
    return {
      success: false,
      blocked: true,
      hitTargetDescription: 'Element is not connected to the DOM',
    };
  }

  // Get all component roots leading to the target element.
  // Go from the bottom to the top to make it work with closed shadow roots.
  const roots: (Document | ShadowRoot)[] = [];
  let parentElement: Element | undefined = targetElement;
  while (parentElement) {
    const root = enclosingShadowRootOrDocument(parentElement);
    if (!root) {
      break;
    }
    roots.push(root);
    if (root.nodeType === Node.DOCUMENT_NODE) {
      break;
    }
    parentElement = (root as ShadowRoot).host;
  }

  // Hit target in each component root should point to the next component root.
  // Hit target in the last component root should point to the target or its descendant.
  let hitElement: Element | undefined;
  for (let index = roots.length - 1; index >= 0; index--) {
    const root = roots[index];
    const ownerWindow = root.ownerDocument?.defaultView || window;

    // All browsers have different behavior around elementFromPoint and elementsFromPoint.
    // https://github.com/w3c/csswg-drafts/issues/556
    // http://crbug.com/1188919
    const elements: Element[] = root.elementsFromPoint(hitPoint.x, hitPoint.y);
    const singleElement = root.elementFromPoint(hitPoint.x, hitPoint.y);

    if (
      singleElement &&
      elements[0] &&
      parentElementOrShadowHost(singleElement) === elements[0]
    ) {
      const style = ownerWindow.getComputedStyle(singleElement);
      if (style?.display === 'contents') {
        // Workaround a case where elementsFromPoint misses the inner-most element with display:contents.
        // https://bugs.chromium.org/p/chromium/issues/detail?id=1342092
        elements.unshift(singleElement);
      }
    }

    if (
      elements[0] &&
      elements[0].shadowRoot === root &&
      elements[1] === singleElement
    ) {
      // Workaround webkit bug where first two elements are swapped:
      // <host>
      //   #shadow root
      //     <target>
      // elementsFromPoint produces [<host>, <target>], while it should be [<target>, <host>]
      // In this case, just ignore <host>.
      elements.shift();
    }

    const innerElement = elements[0] as Element | undefined;
    if (!innerElement) {
      break;
    }
    hitElement = innerElement;
    if (index && innerElement !== (roots[index - 1] as ShadowRoot).host) {
      break;
    }
  }

  // Check whether hit target is the target or its descendant.
  const hitParents: Element[] = [];
  while (hitElement && hitElement !== targetElement) {
    hitParents.push(hitElement);
    // Prefer the composed tree over the light-dom tree, as browser performs hit testing on the composed tree.
    // Note that we will still eventually climb to the light-dom parent, as any element distributed to a slot
    // is a direct child of the shadow host that contains the slot.
    hitElement =
      hitElement.assignedSlot ?? parentElementOrShadowHost(hitElement);
  }

  if (hitElement === targetElement) {
    return { success: true };
  }

  // Build the description of what blocked the click
  const hitTargetDescription = describeElement(
    hitParents[0] || document.documentElement
  );

  // Root is the topmost element in the hitTarget's chain that is not in the
  // element's chain. For example, it might be a dialog element that overlays
  // the target.
  let rootHitTargetDescription: string | undefined;
  let element: Element | undefined = targetElement;
  while (element) {
    const index = hitParents.indexOf(element);
    if (index !== -1) {
      if (index > 1) {
        rootHitTargetDescription = describeElement(hitParents[index - 1]);
      }
      break;
    }
    element = parentElementOrShadowHost(element);
  }

  if (rootHitTargetDescription) {
    return {
      success: false,
      blocked: true,
      hitTargetDescription: `${hitTargetDescription} from ${rootHitTargetDescription} subtree`,
    };
  }

  return {
    success: false,
    blocked: true,
    hitTargetDescription,
  };
}

// ============================================================================
// Hit Target Interceptor
// ============================================================================

/** Events to intercept for hover actions */
const HOVER_EVENTS = new Set(['mousemove']);

/** Events to intercept for click actions */
const CLICK_EVENTS = new Set([
  'mousedown',
  'mouseup',
  'pointerdown',
  'pointerup',
  'click',
  'auxclick',
  'dblclick',
  'contextmenu',
]);

/** Events to intercept for drag actions (empty - drag doesn't use interception) */
const DRAG_EVENTS = new Set<string>();

/** Events to intercept for tap actions (touch-based interactions) */
const TAP_EVENTS = new Set([
  'pointerdown',
  'pointerup',
  'touchstart',
  'touchend',
  'touchcancel',
]);

/**
 * Check if an event is a TouchEvent.
 * Handles both modern and legacy touch event detection.
 */
export function isTouchEvent(event: Event): event is TouchEvent {
  // Handle modern browsers with TouchEvent constructor
  if (typeof TouchEvent !== 'undefined') {
    return event instanceof TouchEvent;
  }
  // Fallback for environments without TouchEvent constructor
  return event.type.startsWith('touch');
}

/**
 * Create a Touch object, handling WebKit's deprecated API.
 * This provides compatibility across different browser implementations.
 */
export function createTouchObject(
  target: EventTarget,
  identifier: number,
  x: number,
  y: number
): Touch {
  // Modern browsers: use Touch constructor
  if (typeof Touch === 'function') {
    try {
      return new Touch({
        identifier,
        target,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        pageX: x,
        pageY: y,
      });
    } catch {
      // Fall through to deprecated API
    }
  }

  // WebKit fallback: use deprecated createTouch
  const doc =
    target instanceof Node ? target.ownerDocument || document : document;
  if ('createTouch' in doc) {
    return (doc as any).createTouch(
      doc.defaultView,
      target,
      identifier,
      x,
      y, // pageX, pageY
      x,
      y, // screenX, screenY
      x,
      y // clientX, clientY
    );
  }

  // Last resort: create a touch-like object
  return {
    identifier,
    target,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    pageX: x,
    pageY: y,
    radiusX: 1,
    radiusY: 1,
    rotationAngle: 0,
    force: 1,
  } as Touch;
}

/**
 * Set up event interceptors to validate clicks at event time.
 *
 * This prevents race conditions where overlays appear between
 * finding an element and dispatching the click. The interceptor
 * listens for mouse/pointer events at the capture phase and
 * validates that the event point hits the target element.
 *
 * @param element - The target element we expect to be clicking
 * @param hitPoint - The expected point of interaction
 * @param action - The type of action ('click', 'hover', 'drag', or 'tap')
 * @param options - Optional configuration for the interceptor
 * @returns HitTargetInterceptor for verifying and stopping interception
 *
 * @example
 * const interceptor = setupHitTargetInterceptor(button, { x: 100, y: 50 }, 'click');
 * // ... perform click ...
 * const result = interceptor.verify();
 * interceptor.stop();
 * if (!result.success) {
 *   console.error('Click was blocked by:', result.hitTargetDescription);
 * }
 *
 * @example
 * // Block all events regardless of hit target result
 * const interceptor = setupHitTargetInterceptor(button, { x: 100, y: 50 }, 'tap', { blockAllEvents: true });
 */
export function setupHitTargetInterceptor(
  element: Element,
  hitPoint: { x: number; y: number },
  action: HitTargetAction,
  options?: HitTargetInterceptorOptions
): HitTargetInterceptor {
  const blockAllEvents = options?.blockAllEvents ?? false;

  // Handle disconnected elements
  if (!element.isConnected) {
    return {
      verify: () => ({
        success: false,
        blocked: true,
        hitTargetDescription: 'Element is not connected to the DOM',
      }),
      stop: () => {},
    };
  }

  // First do a preliminary check, to reduce the possibility of some element
  // intercepting the action.
  const preliminaryResult = expectHitTarget(hitPoint, element);
  if (!preliminaryResult.success) {
    return {
      verify: () => preliminaryResult,
      stop: () => {},
    };
  }

  // When dropping during drag, the "element that is being dragged" often stays
  // under the cursor, so hit target check at the moment we receive mousedown
  // does not work - it finds the "element that is being dragged" instead of
  // the "element that we drop onto".
  if (action === 'drag') {
    return {
      verify: () => ({ success: true }),
      stop: () => {},
    };
  }

  // Select the appropriate events to intercept based on action type
  const events =
    action === 'tap'
      ? TAP_EVENTS
      : action === 'hover'
        ? HOVER_EVENTS
        : CLICK_EVENTS;

  // Track the result of interception
  let result: HitTargetResult | undefined;
  let stopped = false;

  // Create the event listener
  const listener = (event: PointerEvent | MouseEvent | TouchEvent) => {
    // Ignore events that we do not expect to intercept
    if (!events.has(event.type)) {
      return;
    }

    // Only intercept trusted events (from the browser)
    // Allow custom events originating from the page or content scripts
    if (!event.isTrusted) {
      return;
    }

    // Handle touch events - get coordinates from touch point
    let point: { clientX: number; clientY: number } | undefined;

    if (isTouchEvent(event)) {
      // For touch events, use the first touch point
      // Use touches[0] for touchstart/touchmove, changedTouches[0] for touchend/touchcancel
      const touchEvent = event as TouchEvent;
      const touch = touchEvent.touches[0] || touchEvent.changedTouches[0];
      if (touch) {
        point = { clientX: touch.clientX, clientY: touch.clientY };
      }
    } else {
      point = event as MouseEvent | PointerEvent;
    }

    // Check that we hit the right element at the first event, and assume all
    // subsequent events will be fine.
    if (result === undefined && point) {
      result = expectHitTarget({ x: point.clientX, y: point.clientY }, element);
    }

    // Block events if hit target check fails OR if blockAllEvents is true
    if (blockAllEvents || (result && !result.success)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  };

  // Get the owner window for the element
  const ownerWindow = element.ownerDocument?.defaultView || window;

  // Add event listeners at capture phase
  for (const eventType of events) {
    ownerWindow.addEventListener(eventType, listener as EventListener, {
      capture: true,
      passive: false,
    });
  }

  return {
    verify: () => {
      // If we did not get any events, consider things working. Possible causes:
      // - JavaScript is disabled (webkit-only).
      // - Some <iframe> overlays the element from another frame.
      // - Hovering a disabled control prevents any events from firing.
      return result ?? { success: true };
    },
    stop: () => {
      if (stopped) {
        return;
      }
      stopped = true;
      for (const eventType of events) {
        ownerWindow.removeEventListener(eventType, listener as EventListener, {
          capture: true,
        });
      }
    },
  };
}
