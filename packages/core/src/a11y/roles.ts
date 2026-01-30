/**
 * ARIA role utilities.
 * Based on WAI-ARIA role mappings and HTML-AAM spec.
 * Reference: https://www.w3.org/TR/html-aam/
 */

/**
 * Global ARIA attributes with roles where they're prohibited.
 * https://www.w3.org/TR/wai-aria-1.2/#global_states
 * Format: [attribute, prohibited roles or undefined if allowed on all roles]
 */
const GLOBAL_ARIA_ATTRIBUTES: [string, string[] | undefined][] = [
  ['aria-atomic', undefined],
  ['aria-busy', undefined],
  ['aria-controls', undefined],
  ['aria-current', undefined],
  ['aria-describedby', undefined],
  ['aria-details', undefined],
  ['aria-dropeffect', undefined],
  ['aria-flowto', undefined],
  ['aria-grabbed', undefined],
  ['aria-hidden', undefined],
  ['aria-keyshortcuts', undefined],
  ['aria-label', ['caption', 'code', 'deletion', 'emphasis', 'generic', 'insertion', 'paragraph', 'presentation', 'strong', 'subscript', 'superscript']],
  ['aria-labelledby', ['caption', 'code', 'deletion', 'emphasis', 'generic', 'insertion', 'paragraph', 'presentation', 'strong', 'subscript', 'superscript']],
  ['aria-live', undefined],
  ['aria-owns', undefined],
  ['aria-relevant', undefined],
  ['aria-roledescription', ['generic']],
];

/**
 * Elements that prevent header/footer from being landmarks when they contain them.
 * https://www.w3.org/TR/wai-aria-practices/examples/landmarks/HTML5.html
 */
const LANDMARK_ANCESTORS = ['article', 'aside', 'main', 'nav', 'section'];

/**
 * Valid ARIA roles for validation.
 */
const VALID_ROLES = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'button',
  'caption', 'cell', 'checkbox', 'code', 'columnheader', 'combobox', 'complementary',
  'contentinfo', 'definition', 'deletion', 'dialog', 'directory', 'document',
  'emphasis', 'feed', 'figure', 'form', 'generic', 'grid', 'gridcell', 'group',
  'heading', 'img', 'insertion', 'link', 'list', 'listbox', 'listitem', 'log',
  'main', 'mark', 'marquee', 'math', 'meter', 'menu', 'menubar', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'navigation', 'none', 'note', 'option',
  'paragraph', 'presentation', 'progressbar', 'radio', 'radiogroup', 'region',
  'row', 'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox', 'separator',
  'slider', 'spinbutton', 'status', 'strong', 'subscript', 'superscript', 'switch',
  'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox', 'time', 'timer',
  'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem',
]);

/**
 * Map of HTML elements to their implicit ARIA roles.
 * Comprehensive mapping based on HTML-AAM spec.
 */
const IMPLICIT_ROLES: Record<string, string | ((element: Element) => string | null)> = {
  // Links
  a: (el) => el.hasAttribute('href') ? 'link' : null,
  area: (el) => el.hasAttribute('href') ? 'link' : null,

  // Sections & Landmarks
  article: 'article',
  aside: 'complementary',
  footer: (el) => isWithinLandmark(el) ? null : 'contentinfo',
  header: (el) => isWithinLandmark(el) ? null : 'banner',
  main: 'main',
  nav: 'navigation',
  section: (el) => hasExplicitAccessibleName(el) ? 'region' : null,
  search: 'search',

  // Forms
  button: 'button',
  datalist: 'listbox',
  fieldset: 'group',
  form: (el) => hasExplicitAccessibleName(el) ? 'form' : null,
  input: getInputRole,
  meter: 'meter',
  optgroup: 'group',
  option: 'option',
  output: 'status',
  progress: 'progressbar',
  select: getSelectRole,
  textarea: 'textbox',

  // Lists
  dd: 'definition',
  dl: 'list',
  dt: 'term',
  li: 'listitem',
  menu: 'list',
  ol: 'list',
  ul: 'list',

  // Tables
  caption: 'caption',
  table: 'table',
  tbody: 'rowgroup',
  td: getCellRole,
  tfoot: 'rowgroup',
  th: getHeaderCellRole,
  thead: 'rowgroup',
  tr: 'row',

  // Media
  figure: 'figure',
  img: getImageRole,
  svg: 'img',

  // Interactive
  details: 'group',
  dialog: 'dialog',
  summary: 'button',

  // Text semantic elements
  blockquote: 'blockquote',
  code: 'code',
  del: 'deletion',
  dfn: 'term',
  em: 'emphasis',
  hr: 'separator',
  ins: 'insertion',
  mark: 'mark',
  p: 'paragraph',
  strong: 'strong',
  sub: 'subscript',
  sup: 'superscript',
  time: 'time',

  // Structure
  address: 'group',
  hgroup: 'group',

  // Headings
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',

  // Document
  html: 'document',
  math: 'math',
};

/**
 * Input type to role mapping.
 */
const INPUT_TYPE_TO_ROLE: Record<string, string> = {
  button: 'button',
  checkbox: 'checkbox',
  image: 'button',
  number: 'spinbutton',
  radio: 'radio',
  range: 'slider',
  reset: 'button',
  submit: 'button',
};

/**
 * Check if element is within a landmark region.
 */
function isWithinLandmark(element: Element): boolean {
  let parent = element.parentElement;
  while (parent) {
    const tag = parent.tagName.toLowerCase();
    if (LANDMARK_ANCESTORS.includes(tag)) {
      return true;
    }
    // Also check for elements with explicit landmark roles
    const role = parent.getAttribute('role');
    if (role && ['article', 'complementary', 'main', 'navigation', 'region'].includes(role)) {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
}

/**
 * Check if element has an explicit accessible name via aria-label or aria-labelledby.
 */
function hasExplicitAccessibleName(element: Element): boolean {
  return element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby');
}

/**
 * Check if element has any global ARIA attribute (considering role-specific prohibitions).
 * @param element The element to check
 * @param forRole Optional role to check prohibitions for
 */
function hasGlobalAriaAttribute(element: Element, forRole?: string | null): boolean {
  return GLOBAL_ARIA_ATTRIBUTES.some(([attr, prohibited]) => {
    // If attribute is prohibited for this role, it doesn't count as a global ARIA attribute
    if (prohibited?.includes(forRole || '')) {
      return false;
    }
    return element.hasAttribute(attr);
  });
}

/**
 * Check if element has a valid tabindex.
 */
function hasTabIndex(element: Element): boolean {
  return !Number.isNaN(Number(String(element.getAttribute('tabindex'))));
}

/**
 * Check if element is focusable.
 */
function isFocusable(element: Element): boolean {
  return !isNativelyDisabled(element) && (isNativelyFocusable(element) || hasTabIndex(element));
}

/**
 * Check if element is natively focusable.
 */
function isNativelyFocusable(element: Element): boolean {
  const tagName = element.tagName.toUpperCase();
  if (['BUTTON', 'DETAILS', 'SELECT', 'TEXTAREA'].includes(tagName)) {
    return true;
  }
  if (tagName === 'A' || tagName === 'AREA') {
    return element.hasAttribute('href');
  }
  if (tagName === 'INPUT') {
    return (element as HTMLInputElement).type !== 'hidden';
  }
  return false;
}

/**
 * Check if element is natively disabled.
 */
function isNativelyDisabled(element: Element): boolean {
  const tagName = element.tagName.toUpperCase();
  if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'OPTGROUP'].includes(tagName)) {
    return element.hasAttribute('disabled');
  }
  return false;
}

/**
 * Get role for input element based on type and attributes.
 */
function getInputRole(element: Element): string | null {
  const input = element as HTMLInputElement;
  const type = (input.type || 'text').toLowerCase();

  // Search input
  if (type === 'search') {
    return input.hasAttribute('list') ? 'combobox' : 'searchbox';
  }

  // Text-like inputs
  if (['email', 'tel', 'text', 'url', ''].includes(type)) {
    // Check if input has a valid datalist
    const listId = input.getAttribute('list');
    if (listId) {
      const datalist = input.ownerDocument.getElementById(listId);
      if (datalist && datalist.tagName.toLowerCase() === 'datalist') {
        return 'combobox';
      }
    }
    return 'textbox';
  }

  // Password input
  if (type === 'password') {
    return 'textbox';
  }

  // Hidden input has no role
  if (type === 'hidden') {
    return null;
  }

  // File input - browsers report as button
  // https://github.com/w3c/aria/issues/1926
  if (type === 'file') {
    return 'button';
  }

  // Map known types to roles
  return INPUT_TYPE_TO_ROLE[type] || 'textbox';
}

/**
 * Get role for select element based on attributes.
 */
function getSelectRole(element: Element): string {
  const select = element as HTMLSelectElement;
  // Check multiple attribute first
  if (select.hasAttribute('multiple')) {
    return 'listbox';
  }
  // Check size attribute - use getAttribute to handle both property and attribute
  const sizeAttr = select.getAttribute('size');
  if (sizeAttr) {
    const size = parseInt(sizeAttr, 10);
    if (!isNaN(size) && size > 1) {
      return 'listbox';
    }
  }
  return 'combobox';
}

/**
 * Get role for td element (could be cell or gridcell).
 */
function getCellRole(element: Element): string {
  const table = element.closest('table');
  if (table) {
    const role = table.getAttribute('role');
    if (role === 'grid' || role === 'treegrid') {
      return 'gridcell';
    }
  }
  return 'cell';
}

/**
 * Get role for th element based on scope and position.
 */
function getHeaderCellRole(element: Element): string | null {
  const scope = element.getAttribute('scope');

  // Explicit scope takes precedence
  if (scope === 'col' || scope === 'colgroup') {
    return 'columnheader';
  }
  if (scope === 'row' || scope === 'rowgroup') {
    return 'rowheader';
  }

  const nextSibling = element.nextElementSibling;
  const prevSibling = element.previousElementSibling;

  const row = element.parentElement?.tagName?.toUpperCase() === 'TR' ? element.parentElement : undefined;

  // Chrome/Safari: A TH that is the only cell in a table is not labeling any content
  if (!nextSibling && !prevSibling) {
    if (row) {
      const table = row.closest('table') as HTMLTableElement | null;
      if (table && table.rows.length <= 1) {
        return null;
      }
    }
    return 'columnheader';
  }

  // Check siblings to determine header type
  const isHeaderCell = (el: Element | null): boolean =>
    !!el && el.tagName.toUpperCase() === 'TH';

  const isNonEmptyDataCell = (el: Element | null): boolean =>
    !!el && el.tagName.toUpperCase() === 'TD' &&
    !!(el.textContent?.trim() || el.children.length > 0);

  if (isHeaderCell(nextSibling) && isHeaderCell(prevSibling)) {
    return 'columnheader';
  }

  if (isNonEmptyDataCell(nextSibling) || isNonEmptyDataCell(prevSibling)) {
    return 'rowheader';
  }

  return 'columnheader';
}

/**
 * Get role for img element based on alt and other attributes.
 */
function getImageRole(element: Element): string | null {
  const alt = element.getAttribute('alt');
  const title = element.getAttribute('title');

  // Empty alt with no title and no global ARIA attributes = presentation
  // Pass null to check all global ARIA attributes without role-specific prohibitions
  if (alt === '' && !title && !hasGlobalAriaAttribute(element, null) && !hasTabIndex(element)) {
    return 'presentation';
  }

  return 'img';
}

/**
 * Handle presentation/none conflict resolution per ARIA spec.
 * https://www.w3.org/TR/wai-aria-1.2/#conflict_resolution_presentation_none
 * @param element The element to check
 * @param implicitRole The implicit role to use for checking attribute prohibitions
 */
export function hasPresentationConflict(element: Element, implicitRole?: string | null): boolean {
  // Check if global ARIA attributes are present and valid for the implicit role
  // (If aria-label would be valid on the element with its implicit role, it triggers conflict)
  return hasGlobalAriaAttribute(element, implicitRole || null) || isFocusable(element);
}

/**
 * Get the explicit ARIA role from the role attribute.
 */
function getExplicitAriaRole(element: Element): string | null {
  const roleAttr = element.getAttribute('role');
  if (!roleAttr) {
    return null;
  }

  // Find first valid role
  const roles = roleAttr.split(/\s+/).map(r => r.toLowerCase().trim());
  for (const role of roles) {
    if (VALID_ROLES.has(role)) {
      return role;
    }
  }

  return null;
}

/**
 * Get implicit role from element.
 */
function getImplicitRole(element: Element): string | null {
  const tagName = element.tagName.toLowerCase();
  const roleOrFn = IMPLICIT_ROLES[tagName];

  if (typeof roleOrFn === 'function') {
    return roleOrFn(element);
  }

  return roleOrFn ?? null;
}

/**
 * Elements that inherit presentation role from parent.
 * https://www.w3.org/TR/wai-aria-1.2/#conflict_resolution_presentation_none
 */
const PRESENTATION_INHERITANCE_PARENTS: Record<string, string[]> = {
  DD: ['DL', 'DIV'],
  DIV: ['DL'],
  DT: ['DL', 'DIV'],
  LI: ['OL', 'UL'],
  TBODY: ['TABLE'],
  TD: ['TR'],
  TFOOT: ['TABLE'],
  TH: ['TR'],
  THEAD: ['TABLE'],
  TR: ['THEAD', 'TBODY', 'TFOOT', 'TABLE'],
};

/**
 * Check if element should inherit presentation role from parent.
 */
function shouldInheritPresentationRole(element: Element): boolean {
  let current: Element | null = element;

  while (current) {
    const parent: Element | null = current.parentElement;
    const validParents = PRESENTATION_INHERITANCE_PARENTS[current.tagName.toUpperCase()];

    if (!validParents || !parent || !validParents.includes(parent.tagName.toUpperCase())) {
      break;
    }

    const parentExplicitRole = getExplicitAriaRole(parent);
    if ((parentExplicitRole === 'none' || parentExplicitRole === 'presentation')) {
      // Check if parent has conflict resolution
      if (!hasPresentationConflict(parent)) {
        return true;
      }
    }
    current = parent;
  }

  return false;
}

/**
 * Get the ARIA role of an element.
 * Follows the ARIA role calculation algorithm:
 * 1. Check explicit role attribute (with presentation conflict resolution)
 * 2. Check inherited presentation role
 * 3. Return implicit role
 */
export function getAriaRole(element: Element): string | null {
  const explicitRole = getExplicitAriaRole(element);

  // If no explicit role, check for presentation inheritance and return implicit
  if (!explicitRole) {
    // Check if role should be inherited from parent with presentation
    if (shouldInheritPresentationRole(element)) {
      return null;
    }
    return getImplicitRole(element);
  }

  // Handle presentation/none role with conflict resolution
  if (explicitRole === 'none' || explicitRole === 'presentation') {
    const implicitRole = getImplicitRole(element);
    if (hasPresentationConflict(element, implicitRole)) {
      // Conflict resolution: fall back to implicit role
      return implicitRole;
    }
    return null; // Presentation role applies - element has no role
  }

  return explicitRole;
}

/**
 * Get the accessible name of an element.
 * Follows the accessible name computation algorithm (simplified).
 */
export function getAccessibleName(element: Element): string {
  // Check aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const names: string[] = [];
    for (const id of labelledBy.split(/\s+/)) {
      const labelElement = document.getElementById(id);
      if (labelElement) {
        names.push(getTextContent(labelElement));
      }
    }
    if (names.length > 0) {
      return names.join(' ');
    }
  }

  // Check aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) {
    return ariaLabel.trim();
  }

  // Check for associated label (for form controls)
  if (element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement) {
    const labels = element.labels;
    if (labels && labels.length > 0) {
      return getTextContent(labels[0]);
    }
  }

  // Check for title attribute
  const title = element.getAttribute('title');
  if (title && title.trim()) {
    return title.trim();
  }

  // Check for alt attribute (images)
  if (element instanceof HTMLImageElement) {
    const alt = element.alt;
    if (alt && alt.trim()) {
      return alt.trim();
    }
  }

  // Check for placeholder (form controls)
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const placeholder = element.placeholder;
    if (placeholder && placeholder.trim()) {
      return placeholder.trim();
    }
  }

  // For buttons, links, etc., use text content
  const role = getAriaRole(element);
  if (role && ['button', 'link', 'menuitem', 'option', 'tab'].includes(role)) {
    return getTextContent(element);
  }

  return '';
}

function getTextContent(element: Element): string {
  return (element.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * Check if an element is hidden from accessibility tree.
 */
export function isAriaHidden(element: Element): boolean {
  // Check aria-hidden
  if (element.getAttribute('aria-hidden') === 'true') {
    return true;
  }

  // Check if in an aria-hidden subtree
  let parent = element.parentElement;
  while (parent) {
    if (parent.getAttribute('aria-hidden') === 'true') {
      return true;
    }
    parent = parent.parentElement;
  }

  // Check if visually hidden via CSS
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return true;
  }

  return false;
}

/**
 * Get the ARIA level of a heading element.
 */
export function getHeadingLevel(element: Element): number | null {
  // Check aria-level
  const ariaLevel = element.getAttribute('aria-level');
  if (ariaLevel) {
    const level = parseInt(ariaLevel, 10);
    if (!isNaN(level) && level >= 1) {
      return level;
    }
  }

  // Check implicit level from h1-h6
  const match = element.tagName.match(/^H([1-6])$/i);
  if (match) {
    return parseInt(match[1], 10);
  }

  return null;
}
