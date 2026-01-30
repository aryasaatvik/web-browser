/**
 * Accessible name and description computation.
 * Implements the W3C Accessible Name and Description Computation spec.
 * https://www.w3.org/TR/accname-1.2/
 *
 * Based on Playwright's implementation patterns.
 */

import { ariaCache } from './cache.js';
import { isElementHiddenForAria, isIgnoredForAria } from './hidden.js';
import { getAriaRole } from './roles.js';

/**
 * Options for accessible name computation.
 */
export interface NameComputationOptions {
  /** Include content from aria-hidden elements (for aria-labelledby) */
  includeHidden?: boolean;
}

/**
 * Internal context for name computation to track traversal state.
 */
interface NameContext {
  visitedElements: Set<Element>;
  includeHidden: boolean;
  // Track traversal mode
  embeddedInLabelledBy?: { element: Element; hidden: boolean };
  embeddedInDescribedBy?: { element: Element; hidden: boolean };
  embeddedInLabel?: { element: Element; hidden: boolean };
  embeddedInNativeTextAlternative?: { element: Element; hidden: boolean };
  embeddedInTargetElement?: 'self' | 'descendant';
}

/**
 * Roles that get their accessible name from content.
 * https://w3c.github.io/aria/#namefromcontent
 */
const NAME_FROM_CONTENT_ROLES = new Set([
  'button',
  'cell',
  'checkbox',
  'columnheader',
  'gridcell',
  'heading',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'row',
  'rowheader',
  'switch',
  'tab',
  'tooltip',
  'treeitem',
]);

/**
 * Roles that prohibit naming.
 * https://w3c.github.io/aria/#namefromprohibited
 */
const NAME_PROHIBITED_ROLES = new Set([
  'caption',
  'code',
  'definition',
  'deletion',
  'emphasis',
  'generic',
  'insertion',
  'mark',
  'paragraph',
  'presentation',
  'strong',
  'subscript',
  'suggestion',
  'superscript',
  'term',
  'time',
]);

/**
 * Additional roles that allow name from content when embedded.
 */
const EMBEDDED_NAME_FROM_CONTENT_ROLES = new Set([
  '',
  'caption',
  'code',
  'contentinfo',
  'definition',
  'deletion',
  'emphasis',
  'insertion',
  'list',
  'listitem',
  'mark',
  'none',
  'paragraph',
  'presentation',
  'region',
  'row',
  'rowgroup',
  'section',
  'strong',
  'subscript',
  'superscript',
  'table',
  'term',
  'time',
]);

/**
 * Get elements referenced by ID refs (space-separated IDs).
 */
function getIdRefs(element: Element, idRefs: string | null): Element[] {
  if (!idRefs) return [];

  const root = element.getRootNode() as Document | ShadowRoot;
  const ids = idRefs.split(/\s+/).filter((id) => id);
  const elements: Element[] = [];

  for (const id of ids) {
    try {
      const el = root.getElementById ? root.getElementById(id) : document.getElementById(id);
      if (el && !elements.includes(el)) {
        elements.push(el);
      }
    } catch {
      // Invalid ID, skip
    }
  }

  return elements;
}

/**
 * Normalize whitespace in accessible name.
 * "Flat string" per spec: collapse whitespace, trim.
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[\u200b\u00ad]/g, '') // Zero-width and soft hyphen
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if role allows name from content.
 */
function allowsNameFromContent(role: string, isDescendant: boolean): boolean {
  if (NAME_FROM_CONTENT_ROLES.has(role)) {
    return true;
  }
  if (isDescendant && EMBEDDED_NAME_FROM_CONTENT_ROLES.has(role)) {
    return true;
  }
  return false;
}

/**
 * Get the accessible name of an element following W3C spec.
 * Priority: aria-labelledby > aria-label > native label > title > alt > placeholder > text content
 *
 * @param element The element to compute name for
 * @param options Computation options
 */
export function computeAccessibleName(
  element: Element,
  options: NameComputationOptions = {}
): string {
  const includeHidden = options.includeHidden ?? false;

  // Use cache if active
  if (ariaCache.isActive()) {
    return ariaCache.getAccessibleName(element, includeHidden, () => {
      return computeAccessibleNameCore(element, options);
    });
  }

  return computeAccessibleNameCore(element, options);
}

/**
 * Core implementation of accessible name computation.
 */
function computeAccessibleNameCore(
  element: Element,
  options: NameComputationOptions = {}
): string {
  const role = getAriaRole(element) || '';

  // Step 1: Check if element prohibits naming
  // Also check explicit role attribute for presentation/none roles
  // (getAriaRole returns null for these when no conflict exists)
  if (NAME_PROHIBITED_ROLES.has(role)) {
    return '';
  }

  // Check explicit role attribute for presentation/none
  // If getAriaRole returned null AND the explicit role is presentation/none,
  // it means there was no conflict and the presentation role applies
  const explicitRole = element.getAttribute('role')?.split(/\s+/)[0]?.toLowerCase() || '';
  if ((explicitRole === 'presentation' || explicitRole === 'none') && role === '') {
    // Presentation role applies (no conflict) - element prohibits naming
    return '';
  }

  // Step 2: Begin traversal
  const context: NameContext = {
    visitedElements: new Set(),
    includeHidden: options.includeHidden ?? false,
    embeddedInTargetElement: 'self',
  };

  const name = computeNameInternal(element, context);
  return normalizeWhitespace(name);
}

/**
 * Get the accessible description of an element.
 * Priority: aria-describedby > aria-description > title (if not used for name)
 *
 * @param element The element to compute description for
 * @param options Computation options
 */
export function computeAccessibleDescription(
  element: Element,
  options: NameComputationOptions = {}
): string {
  const includeHidden = options.includeHidden ?? false;

  // Use cache if active
  if (ariaCache.isActive()) {
    return ariaCache.getAccessibleDescription(element, includeHidden, () => {
      return computeAccessibleDescriptionCore(element, options);
    });
  }

  return computeAccessibleDescriptionCore(element, options);
}

/**
 * Core implementation of accessible description computation.
 */
function computeAccessibleDescriptionCore(
  element: Element,
  options: NameComputationOptions = {}
): string {
  const context: NameContext = {
    visitedElements: new Set(),
    includeHidden: options.includeHidden ?? false,
  };

  // Check aria-describedby
  const describedBy = element.getAttribute('aria-describedby');
  if (describedBy) {
    const refs = getIdRefs(element, describedBy);
    if (refs.length > 0) {
      const description = refs
        .map((ref) => {
          const refContext: NameContext = {
            ...context,
            visitedElements: new Set(),
            embeddedInDescribedBy: { element: ref, hidden: isElementHiddenForAria(ref) },
          };
          return computeNameInternal(ref, refContext);
        })
        .join(' ');
      return normalizeWhitespace(description);
    }
  }

  // Check aria-description
  const ariaDescription = element.getAttribute('aria-description');
  if (ariaDescription && ariaDescription.trim()) {
    return normalizeWhitespace(ariaDescription);
  }

  // Fall back to title if not used for name
  // Note: title is used for name in some cases, so we need to check
  const name = computeAccessibleName(element, options);
  const title = element.getAttribute('title');
  if (title && title.trim() && name !== title.trim()) {
    return normalizeWhitespace(title);
  }

  return '';
}

/**
 * Internal name computation with traversal context.
 */
function computeNameInternal(element: Element, context: NameContext): string {
  // Prevent infinite loops
  if (context.visitedElements.has(element)) {
    return '';
  }

  const childContext: NameContext = {
    ...context,
    embeddedInTargetElement:
      context.embeddedInTargetElement === 'self' ? 'descendant' : context.embeddedInTargetElement,
  };

  // Step 2a: Hidden Not Referenced
  // If hidden and not part of aria-labelledby/describedby traversal, skip
  if (!context.includeHidden) {
    const isHiddenTraversal =
      context.embeddedInLabelledBy?.hidden ||
      context.embeddedInDescribedBy?.hidden ||
      context.embeddedInNativeTextAlternative?.hidden ||
      context.embeddedInLabel?.hidden;

    if (isIgnoredForAria(element) || (!isHiddenTraversal && isElementHiddenForAria(element))) {
      context.visitedElements.add(element);
      return '';
    }
  }

  // Step 2b: aria-labelledby
  // Only process if not already in an aria-labelledby traversal
  if (!context.embeddedInLabelledBy) {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const refs = getIdRefs(element, labelledBy);
      if (refs.length > 0) {
        const names = refs.map((ref) => {
          const refContext: NameContext = {
            ...context,
            visitedElements: new Set(),
            embeddedInLabelledBy: { element: ref, hidden: isElementHiddenForAria(ref) },
            embeddedInDescribedBy: undefined,
            embeddedInTargetElement: undefined,
            embeddedInLabel: undefined,
            embeddedInNativeTextAlternative: undefined,
          };
          return computeNameInternal(ref, refContext);
        });
        const combinedName = names.join(' ');
        if (combinedName.trim()) {
          return combinedName;
        }
      }
    }
  }

  const role = getAriaRole(element) || '';
  const tagName = element.tagName;

  // Step 2c/2d: Embedded control handling
  if (
    context.embeddedInLabel ||
    context.embeddedInLabelledBy ||
    context.embeddedInTargetElement === 'descendant'
  ) {
    const embeddedValue = getEmbeddedControlValue(element, role, childContext);
    if (embeddedValue !== null) {
      context.visitedElements.add(element);
      return embeddedValue;
    }
  }

  // Step 2d: aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) {
    context.visitedElements.add(element);
    return ariaLabel;
  }

  // Step 2e: Native text alternative elements
  const nativeName = getNativeTextAlternative(element, tagName, role, context, childContext);
  if (nativeName !== null) {
    return nativeName;
  }

  // Step 2f/2h: Name from content
  const shouldNameFromContent =
    allowsNameFromContent(role, context.embeddedInTargetElement === 'descendant') ||
    (tagName === 'SUMMARY' && role !== 'presentation' && role !== 'none') ||
    context.embeddedInLabelledBy ||
    context.embeddedInDescribedBy ||
    context.embeddedInLabel ||
    context.embeddedInNativeTextAlternative;

  if (shouldNameFromContent) {
    context.visitedElements.add(element);
    const contentName = getNameFromContent(element, childContext);
    const trimmed = context.embeddedInTargetElement === 'self' ? contentName.trim() : contentName;
    if (trimmed) {
      return contentName;
    }
  }

  // Step 2i: title attribute
  if (role !== 'presentation' && role !== 'none') {
    context.visitedElements.add(element);
    const title = element.getAttribute('title');
    if (title && title.trim()) {
      return title;
    }
  }

  context.visitedElements.add(element);
  return '';
}

/**
 * Get value from embedded control (textbox, combobox, etc.).
 */
function getEmbeddedControlValue(
  element: Element,
  role: string,
  context: NameContext
): string | null {
  // Check if this is the label's own control
  const labels = (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).labels;
  const labelledBy = getIdRefs(element, element.getAttribute('aria-labelledby'));
  const isOwnLabel = labels && [...labels].includes(element as HTMLLabelElement);
  const isOwnLabelledBy = labelledBy.includes(element);

  if (isOwnLabel || isOwnLabelledBy) {
    return null;
  }

  // Handle different control types
  if (role === 'textbox') {
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      return (element as HTMLInputElement | HTMLTextAreaElement).value;
    }
    return element.textContent || '';
  }

  if (role === 'combobox' || role === 'listbox') {
    if (element.tagName === 'SELECT') {
      const select = element as HTMLSelectElement;
      const selectedOptions = [...select.selectedOptions];
      if (!selectedOptions.length && select.options.length) {
        selectedOptions.push(select.options[0]);
      }
      return selectedOptions.map((opt) => computeNameInternal(opt, context)).join(' ');
    }
    // For ARIA combobox/listbox, find selected options
    const listbox =
      role === 'combobox'
        ? element.querySelector('[role="listbox"]') ||
          [...element.querySelectorAll('*')].find((el) => getAriaRole(el) === 'listbox')
        : element;
    if (listbox) {
      const selectedOptions = [...listbox.querySelectorAll('[aria-selected="true"]')].filter(
        (el) => getAriaRole(el) === 'option'
      );
      if (selectedOptions.length) {
        return selectedOptions.map((opt) => computeNameInternal(opt, context)).join(' ');
      }
    }
    // Fallback for combobox with input
    if (element.tagName === 'INPUT') {
      return (element as HTMLInputElement).value;
    }
  }

  if (
    role === 'progressbar' ||
    role === 'scrollbar' ||
    role === 'slider' ||
    role === 'spinbutton' ||
    role === 'meter'
  ) {
    const valueText = element.getAttribute('aria-valuetext');
    if (valueText) return valueText;

    const valueNow = element.getAttribute('aria-valuenow');
    if (valueNow) return valueNow;

    return element.getAttribute('value') || '';
  }

  if (role === 'menu') {
    return '';
  }

  return null;
}

/**
 * Get native text alternative (labels, alt, etc.).
 */
function getNativeTextAlternative(
  element: Element,
  tagName: string,
  role: string,
  context: NameContext,
  childContext: NameContext
): string | null {
  const labelledBy = element.getAttribute('aria-labelledby');

  // Input type=button/submit/reset
  if (tagName === 'INPUT') {
    const input = element as HTMLInputElement;
    const type = input.type.toLowerCase();

    if (['button', 'submit', 'reset'].includes(type)) {
      context.visitedElements.add(element);
      const value = input.value;
      if (value && value.trim()) return value;
      if (type === 'submit') return 'Submit';
      if (type === 'reset') return 'Reset';
      return element.getAttribute('title') || '';
    }

    // Input type=file
    if (type === 'file') {
      context.visitedElements.add(element);
      if (input.labels?.length && !context.embeddedInLabelledBy) {
        return getNameFromLabels(input.labels, context);
      }
      return 'Choose File';
    }

    // Input type=image
    if (type === 'image') {
      context.visitedElements.add(element);
      if (input.labels?.length && !context.embeddedInLabelledBy) {
        return getNameFromLabels(input.labels, context);
      }
      const alt = element.getAttribute('alt');
      if (alt && alt.trim()) return alt;
      const title = element.getAttribute('title');
      if (title && title.trim()) return title;
      return 'Submit';
    }
  }

  // Button element
  if (tagName === 'BUTTON' && !labelledBy) {
    const button = element as HTMLButtonElement;
    if (button.labels?.length) {
      context.visitedElements.add(element);
      return getNameFromLabels(button.labels, context);
    }
    // Fall through to name from content
  }

  // Output element
  if (tagName === 'OUTPUT' && !labelledBy) {
    const output = element as HTMLOutputElement;
    if (output.labels?.length) {
      context.visitedElements.add(element);
      return getNameFromLabels(output.labels, context);
    }
    return element.getAttribute('title') || '';
  }

  // Form controls with labels
  if ((tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') && !labelledBy) {
    const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    context.visitedElements.add(element);

    if (control.labels?.length) {
      return getNameFromLabels(control.labels, context);
    }

    // Placeholder fallback for text inputs
    const usePlaceholder =
      (tagName === 'INPUT' &&
        ['text', 'password', 'search', 'tel', 'email', 'url'].includes(
          (element as HTMLInputElement).type
        )) ||
      tagName === 'TEXTAREA';

    const title = element.getAttribute('title');
    const placeholder = element.getAttribute('placeholder');

    if (!usePlaceholder || title) {
      return title || '';
    }
    return placeholder || '';
  }

  // Fieldset with legend
  if (tagName === 'FIELDSET' && !labelledBy) {
    context.visitedElements.add(element);
    const legend = element.querySelector(':scope > legend');
    if (legend) {
      return computeNameInternal(legend, {
        ...childContext,
        embeddedInNativeTextAlternative: { element: legend, hidden: isElementHiddenForAria(legend) },
      });
    }
    return element.getAttribute('title') || '';
  }

  // Figure with figcaption
  if (tagName === 'FIGURE' && !labelledBy) {
    context.visitedElements.add(element);
    const figcaption = element.querySelector(':scope > figcaption');
    if (figcaption) {
      return computeNameInternal(figcaption, {
        ...childContext,
        embeddedInNativeTextAlternative: {
          element: figcaption,
          hidden: isElementHiddenForAria(figcaption),
        },
      });
    }
    return element.getAttribute('title') || '';
  }

  // Image alt
  if (tagName === 'IMG') {
    context.visitedElements.add(element);
    const alt = element.getAttribute('alt');
    if (alt && alt.trim()) return alt;
    return element.getAttribute('title') || '';
  }

  // Table with caption
  if (tagName === 'TABLE') {
    context.visitedElements.add(element);
    const caption = element.querySelector(':scope > caption');
    if (caption) {
      return computeNameInternal(caption, {
        ...childContext,
        embeddedInNativeTextAlternative: { element: caption, hidden: isElementHiddenForAria(caption) },
      });
    }
    const summary = element.getAttribute('summary');
    if (summary) return summary;
  }

  // Area element
  if (tagName === 'AREA') {
    context.visitedElements.add(element);
    const alt = element.getAttribute('alt');
    if (alt && alt.trim()) return alt;
    return element.getAttribute('title') || '';
  }

  // SVG title
  if (tagName === 'SVG' || (element as SVGElement).ownerSVGElement) {
    context.visitedElements.add(element);
    const title = element.querySelector(':scope > title');
    if (title && (title as SVGElement).ownerSVGElement) {
      return computeNameInternal(title, {
        ...childContext,
        embeddedInLabelledBy: { element: title, hidden: isElementHiddenForAria(title) },
      });
    }
    // SVG anchor xlink:title
    if ((element as SVGElement).ownerSVGElement && tagName === 'A') {
      const xlinkTitle = element.getAttribute('xlink:title');
      if (xlinkTitle && xlinkTitle.trim()) return xlinkTitle;
    }
  }

  return null;
}

/**
 * Get name from associated labels.
 */
function getNameFromLabels(labels: NodeListOf<HTMLLabelElement>, context: NameContext): string {
  return [...labels]
    .map((label) =>
      computeNameInternal(label, {
        ...context,
        visitedElements: new Set(),
        embeddedInLabel: { element: label, hidden: isElementHiddenForAria(label) },
        embeddedInNativeTextAlternative: undefined,
        embeddedInLabelledBy: undefined,
        embeddedInDescribedBy: undefined,
        embeddedInTargetElement: undefined,
      })
    )
    .filter((name) => name)
    .join(' ');
}

/**
 * Get accessible name from element content (text nodes and children).
 */
function getNameFromContent(element: Element, context: NameContext): string {
  const tokens: string[] = [];

  const visit = (node: Node, skipSlotted: boolean) => {
    if (skipSlotted && (node as Element).assignedSlot) {
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const style = getComputedStyle(el);
      const display = style?.display || 'inline';

      let token = computeNameInternal(el, context);

      // Add spacing for block elements
      if (display !== 'inline' || el.tagName === 'BR') {
        token = ' ' + token + ' ';
      }

      tokens.push(token);
    } else if (node.nodeType === Node.TEXT_NODE) {
      tokens.push(node.textContent || '');
    }
  };

  // Handle slot content
  if (element.tagName === 'SLOT') {
    const slot = element as HTMLSlotElement;
    const assignedNodes = slot.assignedNodes();
    if (assignedNodes.length) {
      for (const child of assignedNodes) {
        visit(child, false);
      }
      return tokens.join('');
    }
  }

  // Process children
  for (let child = element.firstChild; child; child = child.nextSibling) {
    visit(child, true);
  }

  // Process shadow DOM
  if (element.shadowRoot) {
    for (let child = element.shadowRoot.firstChild; child; child = child.nextSibling) {
      visit(child, true);
    }
  }

  // Process aria-owns
  const ariaOwns = element.getAttribute('aria-owns');
  if (ariaOwns) {
    const ownedElements = getIdRefs(element, ariaOwns);
    for (const owned of ownedElements) {
      visit(owned, true);
    }
  }

  return tokens.join('');
}
