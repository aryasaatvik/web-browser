/**
 * Accessibility tree generation.
 * Produces a lightweight tree representation of the page for AI agents.
 *
 * Enhanced with AI mode, better hidden detection, and richer node properties.
 * Based on Playwright's ariaSnapshot implementation patterns.
 */

import { isElementVisible as isDomVisible } from '../dom/visibility.js';
import { getAriaRole, getAccessibleName, getHeadingLevel } from './roles.js';
import { getElementRef } from './refs.js';
import {
  isElementHiddenForAria,
  checkElementVisibility,
  isElementVisuallyVisible,
} from './hidden.js';
import { computeAccessibleDescription } from './name.js';

/**
 * Enhanced AriaNode with support for mixed children (elements and text).
 */
export interface AriaNode {
  /**
   * Reference ID for the element (can be used with getElementByRef).
   * Optional in AI mode when refs='interactable' and element is not interactable.
   */
  ref?: string;

  /**
   * ARIA role of the element.
   */
  role: string | null;

  /**
   * Accessible name of the element.
   */
  name: string;

  /**
   * Tag name of the element (lowercase).
   */
  tag: string;

  /**
   * Child nodes - can be AriaNode or string (for text content in AI mode).
   */
  children?: (AriaNode | string)[];

  /**
   * Bounding box information.
   */
  box?: {
    visible: boolean;
    inline: boolean;
    cursor?: string;
  };

  /**
   * Whether the element receives pointer events (not blocked by pointer-events:none).
   */
  receivesPointerEvents?: boolean;

  /**
   * Whether the element is focused (document.activeElement).
   */
  focused?: boolean;

  /**
   * Whether the element is disabled.
   */
  disabled?: boolean;

  /**
   * Whether the element is selected (for options, tabs, etc.).
   */
  selected?: boolean;

  /**
   * Checkbox/radio/switch checked state.
   */
  checked?: boolean | 'mixed';

  /**
   * Whether the element is expanded (aria-expanded).
   */
  expanded?: boolean;

  /**
   * Toggle button pressed state (aria-pressed).
   */
  pressed?: boolean | 'mixed';

  /**
   * Heading level (1-6).
   */
  level?: number;

  /**
   * Current value (for inputs, textareas, etc.).
   */
  value?: string;

  /**
   * Description from aria-describedby.
   */
  description?: string;

  /**
   * Whether the element has invalid input.
   */
  invalid?: boolean;

  /**
   * Whether the element is required.
   */
  required?: boolean;

  /**
   * Whether the element is busy.
   */
  busy?: boolean;

  /**
   * Current state (aria-current value).
   */
  current?: string;

  /**
   * URL for links.
   */
  url?: string;

  /**
   * Placeholder for text inputs.
   */
  placeholder?: string;

  /**
   * Internal: reference to the DOM element (not serialized).
   */
  _element?: Element;
}

/**
 * Legacy flat node for backward compatibility.
 */
export interface A11yNode {
  ref: string;
  role: string | null;
  name: string;
  tag: string;
  focused?: boolean;
  disabled?: boolean;
  selected?: boolean;
  value?: string;
  level?: number;
  bbox?: { x: number; y: number; width: number; height: number };
  expanded?: boolean;
  pressed?: boolean | 'mixed';
  checked?: boolean | 'mixed';
  invalid?: boolean;
  required?: boolean;
  busy?: boolean;
  current?: string;
  description?: string;
  children?: A11yNode[];
}

/**
 * Enhanced options for accessibility tree generation.
 */
export interface A11yTreeOptions {
  /**
   * Tree generation mode:
   * - 'default': Standard flat list (backward compatible)
   * - 'ai': Optimized for AI/LLM consumption with text nodes and compact output
   * - 'strict': Full tree with all elements and no filtering
   */
  mode?: 'default' | 'ai' | 'strict';

  /**
   * Visibility mode:
   * - 'aria': Only check ARIA visibility (aria-hidden, etc.)
   * - 'ariaOrVisible': Include if ARIA-visible OR visually visible
   * - 'ariaAndVisible': Must be both ARIA-visible AND visually visible (default)
   */
  visibility?: 'aria' | 'ariaOrVisible' | 'ariaAndVisible';

  /**
   * Reference ID generation mode:
   * - 'all': Generate refs for all elements
   * - 'interactable': Only generate refs for interactable elements (default for AI mode)
   * - 'none': Don't generate refs
   */
  refs?: 'all' | 'interactable' | 'none';

  /**
   * Maximum depth to traverse.
   */
  maxDepth?: number;

  /**
   * Whether to include bounding box information.
   */
  includeBbox?: boolean;

  /**
   * Whether to include cursor style for clickable elements.
   */
  includeCursor?: boolean;

  /**
   * Whether to include pointer-events capability.
   */
  includePointerEvents?: boolean;

  /**
   * Whether to only include interactive elements (legacy option).
   */
  interactiveOnly?: boolean;

  /**
   * CSS selector to scope the tree to.
   */
  selector?: string;

  /**
   * Whether to traverse shadow DOM.
   */
  pierceShadowDom?: boolean;

  /**
   * Whether to include the 'generic' role for elements without explicit roles.
   * Default: true for AI mode, false otherwise.
   */
  includeGenericRole?: boolean;
}

/**
 * Internal options resolved from public options.
 */
interface InternalOptions {
  mode: 'default' | 'ai' | 'strict';
  visibility: 'aria' | 'ariaOrVisible' | 'ariaAndVisible';
  refs: 'all' | 'interactable' | 'none';
  maxDepth: number;
  includeBbox: boolean;
  includeCursor: boolean;
  includePointerEvents: boolean;
  interactiveOnly: boolean;
  pierceShadowDom: boolean;
  includeGenericRole: boolean;
}

/**
 * Roles that are considered interactive.
 */
const INTERACTIVE_ROLES = new Set([
  'button',
  'checkbox',
  'combobox',
  'link',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
  'treeitem',
]);

/**
 * Tags that are inherently interactive.
 */
const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea']);

/**
 * Roles that support checked state.
 */
const CHECKED_ROLES = new Set([
  'checkbox',
  'menuitemcheckbox',
  'option',
  'radio',
  'switch',
  'menuitemradio',
  'treeitem',
]);

/**
 * Roles that support disabled state.
 */
const DISABLED_ROLES = new Set([
  'button',
  'checkbox',
  'combobox',
  'gridcell',
  'link',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
  'treeitem',
]);

/**
 * Roles that support expanded state.
 */
const EXPANDED_ROLES = new Set([
  'button',
  'checkbox',
  'combobox',
  'gridcell',
  'link',
  'listbox',
  'menuitem',
  'row',
  'rowheader',
  'tab',
  'treeitem',
]);

/**
 * Roles that support pressed state.
 */
const PRESSED_ROLES = new Set(['button']);

/**
 * Roles that support selected state.
 */
const SELECTED_ROLES = new Set(['gridcell', 'option', 'row', 'tab', 'rowheader', 'columnheader', 'treeitem']);

/**
 * Roles that support level.
 */
const LEVEL_ROLES = new Set(['heading', 'listitem', 'row', 'treeitem']);

/**
 * Resolve public options to internal options with defaults.
 */
function resolveOptions(options: A11yTreeOptions): InternalOptions {
  const mode = options.mode ?? 'default';

  // AI mode defaults
  const isAiMode = mode === 'ai';

  return {
    mode,
    visibility: options.visibility ?? 'ariaAndVisible',
    refs: options.refs ?? (isAiMode ? 'interactable' : 'all'),
    maxDepth: options.maxDepth ?? Infinity,
    includeBbox: options.includeBbox ?? false,
    includeCursor: options.includeCursor ?? isAiMode,
    includePointerEvents: options.includePointerEvents ?? isAiMode,
    interactiveOnly: options.interactiveOnly ?? false,
    pierceShadowDom: options.pierceShadowDom ?? true,
    includeGenericRole: options.includeGenericRole ?? isAiMode,
  };
}

/**
 * Check if element is visible based on visibility mode.
 */
function isVisible(element: Element, visibility: InternalOptions['visibility']): boolean {
  switch (visibility) {
    case 'aria':
      return !isElementHiddenForAria(element);
    case 'ariaOrVisible':
      return !isElementHiddenForAria(element) || isElementVisuallyVisible(element);
    case 'ariaAndVisible':
      return !isElementHiddenForAria(element) && isElementVisuallyVisible(element);
    default:
      return !isElementHiddenForAria(element) && isElementVisuallyVisible(element);
  }
}

/**
 * Check if element receives pointer events.
 */
function receivesPointerEvents(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    const style = getComputedStyle(current);
    if (style.pointerEvents === 'none') {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

/**
 * Check if an element is interactable.
 */
function isElementInteractable(element: Element, role: string | null): boolean {
  // Check role
  if (role && INTERACTIVE_ROLES.has(role)) {
    return true;
  }

  // Check tag
  if (INTERACTIVE_TAGS.has(element.tagName.toLowerCase())) {
    return true;
  }

  // Check for click handlers (tabindex, onclick, etc.)
  if (element.hasAttribute('tabindex')) {
    const tabindex = element.getAttribute('tabindex');
    if (tabindex !== '-1') {
      return true;
    }
  }

  // Check for contenteditable
  if ((element as HTMLElement).isContentEditable) {
    return true;
  }

  return false;
}

/**
 * Compute bounding box info for an element.
 */
function computeBox(element: Element): NonNullable<AriaNode['box']> {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);

  const visible = rect.width > 0 && rect.height > 0;
  const inline = style.display === 'inline' || style.display === 'inline-block';

  return {
    visible,
    inline,
  };
}

/**
 * Get cursor style for an element.
 */
function getCursor(element: Element): string | undefined {
  const style = getComputedStyle(element);
  const cursor = style.cursor;
  if (cursor && cursor !== 'auto' && cursor !== 'default') {
    return cursor;
  }
  return undefined;
}

/**
 * Normalize whitespace in text.
 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Generate an enhanced accessibility tree with AI mode support.
 */
export function generateAriaTree(
  rootElement: Element,
  options: A11yTreeOptions = {}
): { root: AriaNode; elements: Map<string, Element>; refs: Map<Element, string> } {
  const opts = resolveOptions(options);
  const visited = new Set<Node>();
  const elements = new Map<string, Element>();
  const refs = new Map<Element, string>();

  const root: AriaNode = {
    role: 'fragment',
    name: '',
    tag: 'fragment',
    children: [],
  };

  /**
   * Visit a node and its children.
   */
  function visit(ariaNode: AriaNode, node: Node, parentVisible: boolean): void {
    if (visited.has(node)) return;
    visited.add(node);

    // Handle text nodes
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
      if (!parentVisible) return;

      const text = node.nodeValue;
      // Don't add text content as child of textbox (value is shown instead)
      if (ariaNode.role !== 'textbox' && text.trim()) {
        ariaNode.children = ariaNode.children || [];
        ariaNode.children.push(text);
      }
      return;
    }

    // Only process element nodes
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as Element;

    // Check visibility
    const elementVisible = isVisible(element, opts.visibility);
    let visible = elementVisible;

    // In aria-only mode, skip subtree if not visible
    if (opts.visibility === 'aria' && !visible) return;

    // Handle aria-owns
    const ariaOwnsChildren: Element[] = [];
    if (element.hasAttribute('aria-owns')) {
      const ids = element.getAttribute('aria-owns')!.split(/\s+/);
      for (const id of ids) {
        const owned = document.getElementById(id);
        if (owned) {
          ariaOwnsChildren.push(owned);
        }
      }
    }

    // Create aria node for visible elements
    const childAriaNode = visible ? createAriaNode(element, opts) : null;

    if (childAriaNode) {
      // Store element reference
      if (childAriaNode.ref) {
        elements.set(childAriaNode.ref, element);
        refs.set(element, childAriaNode.ref);
      }

      ariaNode.children = ariaNode.children || [];
      ariaNode.children.push(childAriaNode);
    }

    // Process children
    processElement(childAriaNode || ariaNode, element, ariaOwnsChildren, visible);
  }

  /**
   * Process an element's children.
   */
  function processElement(
    ariaNode: AriaNode,
    element: Element,
    ariaOwnsChildren: Element[],
    parentVisible: boolean
  ): void {
    // Add spacing for block elements
    const style = getComputedStyle(element);
    const display = style?.display || 'inline';
    const isBlock = display !== 'inline' || element.tagName === 'BR';

    if (isBlock && ariaNode.children?.length) {
      ariaNode.children.push(' ');
    }

    // Handle slots
    const assignedNodes = element.tagName === 'SLOT' ? (element as HTMLSlotElement).assignedNodes() : [];
    if (assignedNodes.length) {
      for (const child of assignedNodes) {
        visit(ariaNode, child, parentVisible);
      }
    } else {
      // Process regular children
      for (let child = element.firstChild; child; child = child.nextSibling) {
        if (!(child as Element).assignedSlot) {
          visit(ariaNode, child, parentVisible);
        }
      }

      // Process shadow DOM
      if (opts.pierceShadowDom && element.shadowRoot) {
        for (let child = element.shadowRoot.firstChild; child; child = child.nextSibling) {
          visit(ariaNode, child, parentVisible);
        }
      }
    }

    // Process aria-owns children
    for (const child of ariaOwnsChildren) {
      visit(ariaNode, child, parentVisible);
    }

    if (isBlock && ariaNode.children?.length) {
      ariaNode.children.push(' ');
    }

    // Remove duplicate name as single text child
    if (ariaNode.children?.length === 1 && ariaNode.name === ariaNode.children[0]) {
      ariaNode.children = [];
    }
  }

  // Start traversal
  visit(root, rootElement, true);

  // Normalize string children
  normalizeStringChildren(root);

  // Optionally remove generic roles that wrap single elements
  if (!opts.includeGenericRole) {
    normalizeGenericRoles(root);
  }

  return { root, elements, refs };
}

/**
 * Create an AriaNode for an element.
 */
function createAriaNode(element: Element, opts: InternalOptions): AriaNode | null {
  const defaultRole = opts.includeGenericRole ? 'generic' : null;
  const role = getAriaRole(element) ?? defaultRole;

  // Skip presentation/none roles
  if (role === 'presentation' || role === 'none') {
    return null;
  }

  const name = normalizeWhitespace(getAccessibleName(element));
  const tag = element.tagName.toLowerCase();

  // In AI mode, skip generic inline elements with single text child
  if (opts.mode === 'ai' && role === 'generic') {
    const box = computeBox(element);
    if (box.inline && element.childNodes.length === 1 && element.childNodes[0].nodeType === Node.TEXT_NODE) {
      return null;
    }
  }

  const node: AriaNode = {
    role,
    name,
    tag,
    children: [],
    _element: element,
  };

  // Compute ref based on refs mode
  if (opts.refs !== 'none') {
    const isInteractable = isElementInteractable(element, role);
    if (opts.refs === 'all' || isInteractable) {
      node.ref = getElementRef(element);
    }
  }

  // Include box info
  if (opts.includeBbox || opts.mode === 'ai') {
    const box = computeBox(element);
    node.box = box;

    if (opts.includeCursor) {
      const cursor = getCursor(element);
      if (cursor) {
        node.box!.cursor = cursor;
      }
    }
  }

  // Include pointer events
  if (opts.includePointerEvents) {
    node.receivesPointerEvents = receivesPointerEvents(element);
  }

  // Check focused state
  if (document.activeElement === element) {
    node.focused = true;
  }

  // Extract ARIA states based on role

  // Checked state
  if (role && CHECKED_ROLES.has(role)) {
    const checked = getCheckedState(element);
    if (checked !== undefined) {
      node.checked = checked;
    }
  }

  // Disabled state
  if (role && DISABLED_ROLES.has(role)) {
    if (isDisabled(element)) {
      node.disabled = true;
    }
  }

  // Expanded state
  if (role && EXPANDED_ROLES.has(role)) {
    const expanded = getExpandedState(element);
    if (expanded !== undefined) {
      node.expanded = expanded;
    }
  }

  // Level
  if (role && LEVEL_ROLES.has(role)) {
    const level = getHeadingLevel(element);
    if (level !== null) {
      node.level = level;
    }
  }

  // Pressed state
  if (role && PRESSED_ROLES.has(role)) {
    const pressed = getPressedState(element);
    if (pressed !== undefined) {
      node.pressed = pressed;
    }
  }

  // Selected state
  if (role && SELECTED_ROLES.has(role)) {
    const selected = getSelectedState(element);
    if (selected !== undefined) {
      node.selected = selected;
    }
  }

  // Value for form controls
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.type !== 'checkbox' && element.type !== 'radio' && element.type !== 'file' && element.type !== 'password') {
      if (element.value) {
        node.value = element.value;
      }
    }
  }

  // Description
  const description = computeAccessibleDescription(element);
  if (description) {
    node.description = description;
  }

  // Invalid state
  const invalid = element.getAttribute('aria-invalid');
  if (invalid === 'true' || invalid === 'spelling' || invalid === 'grammar') {
    node.invalid = true;
  }

  // Required state
  if (element.getAttribute('aria-required') === 'true' || (element as HTMLInputElement).required) {
    node.required = true;
  }

  // Busy state
  if (element.getAttribute('aria-busy') === 'true') {
    node.busy = true;
  }

  // Current state
  const current = element.getAttribute('aria-current');
  if (current && current !== 'false') {
    node.current = current;
  }

  // URL for links
  if (role === 'link' && element.hasAttribute('href')) {
    node.url = element.getAttribute('href') || undefined;
  }

  // Placeholder for textboxes
  if (role === 'textbox' && element.hasAttribute('placeholder')) {
    const placeholder = element.getAttribute('placeholder');
    if (placeholder && placeholder !== name) {
      node.placeholder = placeholder;
    }
  }

  return node;
}

/**
 * Get checked state for an element.
 */
function getCheckedState(element: Element): boolean | 'mixed' | undefined {
  // HTML input checkbox/radio
  if (element instanceof HTMLInputElement) {
    if (element.indeterminate) return 'mixed';
    if (element.type === 'checkbox' || element.type === 'radio') {
      return element.checked;
    }
  }

  // ARIA checked
  const ariaChecked = element.getAttribute('aria-checked');
  if (ariaChecked === 'true') return true;
  if (ariaChecked === 'false') return false;
  if (ariaChecked === 'mixed') return 'mixed';

  return undefined;
}

/**
 * Check if element is disabled.
 */
function isDisabled(element: Element): boolean {
  // HTML disabled attribute
  if ('disabled' in element && (element as HTMLInputElement).disabled) {
    return true;
  }

  // ARIA disabled
  if (element.getAttribute('aria-disabled') === 'true') {
    return true;
  }

  return false;
}

/**
 * Get expanded state for an element.
 */
function getExpandedState(element: Element): boolean | undefined {
  // Details element
  if (element instanceof HTMLDetailsElement) {
    return element.open;
  }

  // ARIA expanded
  const ariaExpanded = element.getAttribute('aria-expanded');
  if (ariaExpanded === 'true') return true;
  if (ariaExpanded === 'false') return false;

  return undefined;
}

/**
 * Get pressed state for an element.
 */
function getPressedState(element: Element): boolean | 'mixed' | undefined {
  const ariaPressed = element.getAttribute('aria-pressed');
  if (ariaPressed === 'true') return true;
  if (ariaPressed === 'false') return false;
  if (ariaPressed === 'mixed') return 'mixed';

  return undefined;
}

/**
 * Get selected state for an element.
 */
function getSelectedState(element: Element): boolean | undefined {
  // HTML option
  if (element instanceof HTMLOptionElement) {
    return element.selected;
  }

  // ARIA selected
  const ariaSelected = element.getAttribute('aria-selected');
  if (ariaSelected === 'true') return true;
  if (ariaSelected === 'false') return false;

  return undefined;
}

/**
 * Normalize consecutive string children.
 */
function normalizeStringChildren(node: AriaNode): void {
  if (!node.children?.length) return;

  const normalized: (AriaNode | string)[] = [];
  const buffer: string[] = [];

  const flush = () => {
    if (buffer.length) {
      const text = normalizeWhitespace(buffer.join(''));
      if (text) {
        normalized.push(text);
      }
      buffer.length = 0;
    }
  };

  for (const child of node.children) {
    if (typeof child === 'string') {
      buffer.push(child);
    } else {
      flush();
      normalizeStringChildren(child);
      normalized.push(child);
    }
  }
  flush();

  node.children = normalized.length ? normalized : undefined;

  // Remove duplicate name/content
  if (node.children?.length === 1 && node.children[0] === node.name) {
    node.children = undefined;
  }
}

/**
 * Remove generic roles that wrap single elements.
 */
function normalizeGenericRoles(node: AriaNode): void {
  const normalizeChildren = (n: AriaNode): (AriaNode | string)[] => {
    const result: (AriaNode | string)[] = [];

    for (const child of n.children || []) {
      if (typeof child === 'string') {
        result.push(child);
        continue;
      }

      const normalized = normalizeChildren(child);
      result.push(...normalized);
    }

    // Remove generic wrappers with single ref-able child
    const shouldRemove =
      n.role === 'generic' &&
      !n.name &&
      result.length <= 1 &&
      result.every((c) => typeof c !== 'string' && c.ref);

    if (shouldRemove) {
      return result;
    }

    n.children = result.length ? result : undefined;
    return [n];
  };

  normalizeChildren(node);
}

/**
 * Generate an accessibility tree for the document or a subtree.
 * Legacy function for backward compatibility.
 */
export function generateA11yTree(
  root: Element | Document = document,
  options: A11yTreeOptions = {}
): A11yNode[] {
  const {
    maxDepth = Infinity,
    includeBbox = false,
    interactiveOnly = false,
    selector,
    pierceShadowDom = true,
  } = options;

  let startElement: Element;
  if (root instanceof Document) {
    startElement = selector ? root.querySelector(selector) || root.documentElement : root.documentElement;
  } else {
    startElement = root;
  }

  if (!startElement) return [];

  const nodes: A11yNode[] = [];
  collectNodesFlat(startElement, nodes, 0, maxDepth, includeBbox, interactiveOnly, pierceShadowDom);
  return nodes;
}

/**
 * Collect nodes in flat list format (legacy).
 */
function collectNodesFlat(
  root: Element | ShadowRoot,
  nodes: A11yNode[],
  depth: number,
  maxDepth: number,
  includeBbox: boolean,
  interactiveOnly: boolean,
  pierceShadowDom: boolean
): void {
  if (depth > maxDepth) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => {
      if (!(node instanceof Element)) return NodeFilter.FILTER_SKIP;
      // Only use ARIA-based hidden check for consistent behavior in test environments
      if (isElementHiddenForAria(node, { includeCSS: false })) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const processElement = (element: Element): A11yNode | null => {
    const node = createLegacyNode(element, includeBbox);

    if (interactiveOnly && !isLegacyInteractive(node)) {
      return null;
    }

    return node;
  };

  // Process root if element
  if (root instanceof Element) {
    const node = processElement(root);
    if (node) {
      nodes.push(node);
    }
  }

  let element: Element | null;
  while ((element = walker.nextNode() as Element | null)) {
    const node = processElement(element);
    if (node) {
      nodes.push(node);
    }

    if (pierceShadowDom && element.shadowRoot) {
      collectNodesFlat(element.shadowRoot, nodes, depth + 1, maxDepth, includeBbox, interactiveOnly, pierceShadowDom);
    }
  }
}

/**
 * Create legacy A11yNode.
 */
function createLegacyNode(element: Element, includeBbox: boolean): A11yNode {
  const role = getAriaRole(element);
  const name = getAccessibleName(element);
  const ref = getElementRef(element);
  const tag = element.tagName.toLowerCase();

  const node: A11yNode = {
    ref,
    role,
    name,
    tag,
  };

  // Focused
  if (document.activeElement === element) {
    node.focused = true;
  }

  // Disabled
  if ('disabled' in element && (element as HTMLInputElement).disabled) {
    node.disabled = true;
  }
  if (element.getAttribute('aria-disabled') === 'true') {
    node.disabled = true;
  }

  // Selected/Checked
  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox' || element.type === 'radio') {
      node.selected = element.checked;
    }
  }
  if (element instanceof HTMLOptionElement) {
    node.selected = element.selected;
  }
  if (element.getAttribute('aria-selected') === 'true') {
    node.selected = true;
  }

  // Value
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.type !== 'password') {
      node.value = element.value;
    }
  }
  if (element instanceof HTMLSelectElement) {
    node.value = element.value;
  }

  // Level
  const level = getHeadingLevel(element);
  if (level !== null) {
    node.level = level;
  }

  // Expanded
  const ariaExpanded = element.getAttribute('aria-expanded');
  if (ariaExpanded !== null) {
    node.expanded = ariaExpanded === 'true';
  }

  // Pressed
  const ariaPressed = element.getAttribute('aria-pressed');
  if (ariaPressed !== null) {
    node.pressed = ariaPressed === 'mixed' ? 'mixed' : ariaPressed === 'true';
  }

  // Checked
  const ariaChecked = element.getAttribute('aria-checked');
  if (ariaChecked !== null) {
    node.checked = ariaChecked === 'mixed' ? 'mixed' : ariaChecked === 'true';
  }

  // Invalid
  const ariaInvalid = element.getAttribute('aria-invalid');
  if (ariaInvalid === 'true' || ariaInvalid === 'spelling' || ariaInvalid === 'grammar') {
    node.invalid = true;
  }

  // Required
  if (element.getAttribute('aria-required') === 'true' || (element as HTMLInputElement).required) {
    node.required = true;
  }

  // Busy
  if (element.getAttribute('aria-busy') === 'true') {
    node.busy = true;
  }

  // Current
  const ariaCurrent = element.getAttribute('aria-current');
  if (ariaCurrent && ariaCurrent !== 'false') {
    node.current = ariaCurrent;
  }

  // Description
  const describedBy = element.getAttribute('aria-describedby');
  if (describedBy) {
    const descriptions: string[] = [];
    for (const id of describedBy.split(/\s+/)) {
      const descElement = document.getElementById(id);
      if (descElement) {
        const text = normalizeWhitespace(descElement.textContent || '');
        if (text) descriptions.push(text);
      }
    }
    if (descriptions.length > 0) {
      node.description = descriptions.join(' ');
    }
  }

  // Bbox
  if (includeBbox) {
    const rect = element.getBoundingClientRect();
    node.bbox = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  return node;
}

/**
 * Check if legacy node is interactive.
 */
function isLegacyInteractive(node: A11yNode): boolean {
  if (node.role && INTERACTIVE_ROLES.has(node.role)) {
    return true;
  }
  if (INTERACTIVE_TAGS.has(node.tag)) {
    return true;
  }
  return false;
}

/**
 * Format the accessibility tree as a compact string representation.
 */
export function formatA11yTree(nodes: A11yNode[], compact = true): string {
  const lines: string[] = [];

  for (const node of nodes) {
    let line = `[${node.ref}]`;

    if (node.role) {
      line += ` ${node.role}`;
    } else {
      line += ` ${node.tag}`;
    }

    if (node.name) {
      line += ` "${node.name}"`;
    }

    if (node.focused) {
      line += ' (focused)';
    }

    if (node.disabled) {
      line += ' (disabled)';
    }

    if (node.selected !== undefined) {
      line += node.selected ? ' (selected)' : ' (not selected)';
    }

    if (node.checked !== undefined) {
      if (node.checked === 'mixed') {
        line += ' (mixed)';
      } else {
        line += node.checked ? ' (checked)' : ' (unchecked)';
      }
    }

    if (node.expanded !== undefined) {
      line += node.expanded ? ' (expanded)' : ' (collapsed)';
    }

    if (node.pressed !== undefined) {
      if (node.pressed === 'mixed') {
        line += ' (pressed=mixed)';
      } else {
        line += node.pressed ? ' (pressed)' : ' (not pressed)';
      }
    }

    if (node.invalid) {
      line += ' (invalid)';
    }

    if (node.required) {
      line += ' (required)';
    }

    if (node.busy) {
      line += ' (busy)';
    }

    if (node.current) {
      line += ` (current=${node.current})`;
    }

    if (node.value !== undefined && node.value !== '') {
      line += ` value="${node.value}"`;
    }

    if (node.level !== undefined) {
      line += ` level=${node.level}`;
    }

    if (!compact && node.description) {
      line += ` desc="${node.description}"`;
    }

    if (!compact && node.bbox) {
      line += ` @${node.bbox.x},${node.bbox.y} ${node.bbox.width}x${node.bbox.height}`;
    }

    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Format AriaNode tree as YAML-like string (for AI consumption).
 */
export function formatAriaTree(root: AriaNode, options: { indent?: number } = {}): string {
  const indent = options.indent ?? 0;
  const lines: string[] = [];

  function formatNode(node: AriaNode | string, level: number): void {
    const prefix = '  '.repeat(level) + '- ';

    if (typeof node === 'string') {
      lines.push(prefix + `text: "${node}"`);
      return;
    }

    let line = node.role || node.tag;
    if (node.name) {
      line += ` "${node.name}"`;
    }

    // Add attributes
    const attrs: string[] = [];
    if (node.ref) attrs.push(`ref=${node.ref}`);
    if (node.checked !== undefined) attrs.push(node.checked === 'mixed' ? 'checked=mixed' : node.checked ? 'checked' : '');
    if (node.disabled) attrs.push('disabled');
    if (node.expanded !== undefined) attrs.push(node.expanded ? 'expanded' : '');
    if (node.focused) attrs.push('active');
    if (node.level) attrs.push(`level=${node.level}`);
    if (node.pressed !== undefined) attrs.push(node.pressed === 'mixed' ? 'pressed=mixed' : node.pressed ? 'pressed' : '');
    if (node.selected) attrs.push('selected');
    if (node.box?.cursor === 'pointer' && node.ref) attrs.push('cursor=pointer');

    const filteredAttrs = attrs.filter(Boolean);
    if (filteredAttrs.length) {
      line += ` [${filteredAttrs.join('] [')}]`;
    }

    if (node.children?.length) {
      lines.push(prefix + line + ':');
      for (const child of node.children) {
        formatNode(child, level + 1);
      }
    } else if (node.value) {
      lines.push(prefix + line + `: "${node.value}"`);
    } else {
      lines.push(prefix + line);
    }
  }

  // Format root's children (skip the fragment wrapper)
  if (root.role === 'fragment' && root.children) {
    for (const child of root.children) {
      formatNode(child, indent);
    }
  } else {
    formatNode(root, indent);
  }

  return lines.join('\n');
}
