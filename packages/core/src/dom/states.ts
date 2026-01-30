/**
 * Element state checking system.
 * Implements Playwright's 8-state element checking with ARIA compliance.
 */

import { isElementVisible } from './visibility.js';
import { checkElementStability, type StabilityOptions, type StabilityResult } from './stability.js';

/**
 * Element states that can be checked.
 */
export type ElementState =
  | 'visible'
  | 'hidden'
  | 'enabled'
  | 'disabled'
  | 'editable'
  | 'checked'
  | 'unchecked'
  | 'indeterminate'
  | 'stable';

/**
 * States that can be checked synchronously (without stability).
 */
export type SyncElementState = Exclude<ElementState, 'stable'>;

/**
 * Result of checking an element's state.
 */
export interface StateCheckResult {
  /** Whether the element matches the requested state */
  matches: boolean;
  /** The actual state received (for error messages) */
  received?: string;
  /** Whether the element is a radio button (for checked/unchecked states) */
  isRadio?: boolean;
}

// Roles that support aria-disabled
const kAriaDisabledRoles = [
  'application', 'button', 'composite', 'gridcell', 'group', 'input', 'link',
  'menuitem', 'scrollbar', 'separator', 'tab', 'checkbox', 'columnheader',
  'combobox', 'grid', 'listbox', 'menu', 'menubar', 'menuitemcheckbox',
  'menuitemradio', 'option', 'radio', 'radiogroup', 'row', 'rowheader',
  'searchbox', 'select', 'slider', 'spinbutton', 'switch', 'tablist',
  'textbox', 'toolbar', 'tree', 'treegrid', 'treeitem',
];

// Roles that support aria-checked
const kAriaCheckedRoles = [
  'checkbox', 'menuitemcheckbox', 'option', 'radio', 'switch',
  'menuitemradio', 'treeitem',
];

// Roles that support aria-readonly
const kAriaReadonlyRoles = [
  'checkbox', 'combobox', 'grid', 'gridcell', 'listbox', 'radiogroup',
  'slider', 'spinbutton', 'textbox', 'columnheader', 'rowheader',
  'searchbox', 'switch', 'treegrid',
];

/**
 * Get the element's tag name safely (handles null/undefined).
 */
function getTagName(element: Element): string {
  return element.tagName?.toUpperCase() ?? '';
}

/**
 * Get the element's ARIA role (explicit or implicit).
 */
function getRole(element: Element): string | null {
  // Check explicit role first
  const explicitRole = element.getAttribute('role');
  if (explicitRole) {
    return explicitRole.split(/\s+/)[0].toLowerCase();
  }

  // Check implicit role based on tag
  const tagName = getTagName(element);
  switch (tagName) {
    case 'BUTTON':
      return 'button';
    case 'INPUT': {
      const type = (element as HTMLInputElement).type.toLowerCase();
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (['text', 'email', 'tel', 'url', 'password', 'search'].includes(type)) return 'textbox';
      if (type === 'number') return 'spinbutton';
      if (type === 'range') return 'slider';
      return null;
    }
    case 'TEXTAREA':
      return 'textbox';
    case 'SELECT':
      return 'combobox';
    default:
      return null;
  }
}

/**
 * Check if a parent element (or ancestor) has aria-disabled="true".
 */
function hasAncestorAriaDisabled(element: Element): boolean {
  let current: Element | null = element.parentElement;
  while (current) {
    const ariaDisabled = current.getAttribute('aria-disabled');
    if (ariaDisabled?.toLowerCase() === 'true') {
      return true;
    }
    if (ariaDisabled?.toLowerCase() === 'false') {
      return false;
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * Check if an element is inside a disabled fieldset.
 */
function isInDisabledFieldset(element: Element): boolean {
  const fieldset = element.closest('fieldset[disabled]');
  if (!fieldset) return false;

  // Elements inside <legend> are not affected by fieldset disabled
  const legend = fieldset.querySelector(':scope > legend');
  if (legend && legend.contains(element)) {
    return false;
  }
  return true;
}

/**
 * Check if an element is inside a disabled optgroup.
 */
function isInDisabledOptgroup(element: Element): boolean {
  return getTagName(element) === 'OPTION' && !!element.closest('optgroup[disabled]');
}

/**
 * Check if element is disabled (considering both native and ARIA disabled).
 */
function isElementDisabled(element: Element): boolean {
  // Check native disabled attribute for form controls
  const tagName = getTagName(element);
  const isNativeFormControl = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'OPTGROUP'].includes(tagName);

  if (isNativeFormControl) {
    if (element.hasAttribute('disabled')) {
      return true;
    }
    if (isInDisabledFieldset(element)) {
      return true;
    }
    if (isInDisabledOptgroup(element)) {
      return true;
    }
  }

  // Check aria-disabled
  const role = getRole(element);
  if (role && kAriaDisabledRoles.includes(role)) {
    const ariaDisabled = element.getAttribute('aria-disabled');
    if (ariaDisabled?.toLowerCase() === 'true') {
      return true;
    }
    if (ariaDisabled?.toLowerCase() === 'false') {
      return false;
    }
  }

  // Check ancestor aria-disabled
  return hasAncestorAriaDisabled(element);
}

/**
 * Check if element is readonly.
 * Returns 'error' if the element doesn't support readonly.
 */
function isElementReadonly(element: Element): boolean | 'error' {
  const tagName = getTagName(element);

  // Check native readonly for form controls
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) {
    return element.hasAttribute('readonly');
  }

  // Check aria-readonly for supported roles
  const role = getRole(element);
  if (role && kAriaReadonlyRoles.includes(role)) {
    return element.getAttribute('aria-readonly') === 'true';
  }

  // Check contenteditable
  if ((element as HTMLElement).isContentEditable) {
    return false;
  }

  return 'error';
}

/**
 * Check if element is checked (for checkboxes, radios, switches).
 * Returns 'error' if the element doesn't support checked state.
 */
function getCheckedState(element: Element, allowMixed: boolean): boolean | 'mixed' | 'error' {
  const tagName = getTagName(element);

  // Check native checkbox/radio
  if (tagName === 'INPUT') {
    const input = element as HTMLInputElement;
    const type = input.type.toLowerCase();

    if (['checkbox', 'radio'].includes(type)) {
      // Check indeterminate first (only for mixed mode)
      if (allowMixed && input.indeterminate) {
        return 'mixed';
      }
      return input.checked;
    }
  }

  // Check aria-checked for supported roles
  const role = getRole(element);
  if (role && kAriaCheckedRoles.includes(role)) {
    const ariaChecked = element.getAttribute('aria-checked');
    if (ariaChecked === 'true') {
      return true;
    }
    if (allowMixed && ariaChecked === 'mixed') {
      return 'mixed';
    }
    return false;
  }

  return 'error';
}

/**
 * Check if element is in the specified state (synchronous, non-stable states only).
 *
 * @param element The element to check
 * @param state The state to check for
 * @returns StateCheckResult with matches and received values
 * @throws Error if the state requires capabilities the element doesn't have
 */
export function checkElementState(element: Element, state: ElementState): StateCheckResult {
  // Handle stable state specially - it requires async checking
  if (state === 'stable') {
    // For synchronous check, we can only verify the element is connected and has dimensions
    if (!element.isConnected) {
      return { matches: false, received: 'disconnected' };
    }
    const rect = element.getBoundingClientRect();
    const hasSize = rect.width > 0 && rect.height > 0;
    return { matches: hasSize, received: hasSize ? 'stable' : 'no-size' };
  }

  // Handle disconnected element
  if (!element.isConnected) {
    if (state === 'hidden') {
      return { matches: true, received: 'hidden' };
    }
    return { matches: false, received: 'error:notconnected' };
  }

  // Check visible/hidden states
  if (state === 'visible' || state === 'hidden') {
    const visible = isElementVisible(element);
    return {
      matches: state === 'visible' ? visible : !visible,
      received: visible ? 'visible' : 'hidden',
    };
  }

  // Check enabled/disabled states
  if (state === 'enabled' || state === 'disabled') {
    const disabled = isElementDisabled(element);
    return {
      matches: state === 'disabled' ? disabled : !disabled,
      received: disabled ? 'disabled' : 'enabled',
    };
  }

  // Check editable state
  if (state === 'editable') {
    const disabled = isElementDisabled(element);
    const readonly = isElementReadonly(element);

    if (readonly === 'error') {
      throw new Error(
        'Element is not an <input>, <textarea>, <select> or [contenteditable] and does not have a role allowing [aria-readonly]'
      );
    }

    return {
      matches: !disabled && !readonly,
      received: disabled ? 'disabled' : readonly ? 'readonly' : 'editable',
    };
  }

  // Check checked/unchecked states
  if (state === 'checked' || state === 'unchecked') {
    const need = state === 'checked';
    const checked = getCheckedState(element, false);

    if (checked === 'error') {
      throw new Error('Not a checkbox or radio button');
    }

    const tagName = getTagName(element);
    const isRadio = tagName === 'INPUT' && (element as HTMLInputElement).type === 'radio';

    return {
      matches: need === checked,
      received: checked ? 'checked' : 'unchecked',
      isRadio,
    };
  }

  // Check indeterminate state
  if (state === 'indeterminate') {
    const checked = getCheckedState(element, true);

    if (checked === 'error') {
      throw new Error('Not a checkbox or radio button');
    }

    return {
      matches: checked === 'mixed',
      received: checked === true ? 'checked' : checked === false ? 'unchecked' : 'mixed',
    };
  }

  throw new Error(`Unexpected element state "${state}"`);
}

/**
 * Wait for element to reach specified state with timeout.
 * Uses polling for non-stable states, RAF for stable state.
 *
 * @param element The element to wait for
 * @param state The state to wait for
 * @param timeout Timeout in milliseconds (default: 5000)
 * @returns Promise resolving to StateCheckResult
 */
export async function waitForElementState(
  element: Element,
  state: ElementState,
  timeout: number = 5000
): Promise<StateCheckResult> {
  const startTime = performance.now();

  // Handle stable state with dedicated stability checker
  if (state === 'stable') {
    const stabilityResult: StabilityResult = await checkElementStability(element, {
      timeout,
      frameCount: 2,
    });

    return {
      matches: stabilityResult.stable,
      received: stabilityResult.stable ? 'stable' : stabilityResult.reason,
    };
  }

  // Poll for other states
  const pollInterval = 50; // ms

  while (performance.now() - startTime < timeout) {
    try {
      const result = checkElementState(element, state);
      if (result.matches) {
        return result;
      }
    } catch {
      // Element might have been removed or changed, continue polling
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Final check after timeout
  try {
    return checkElementState(element, state);
  } catch (e) {
    return {
      matches: false,
      received: 'error:timeout',
    };
  }
}

/**
 * Check multiple states at once.
 * Returns first failing state or success if all match.
 * Checks 'stable' state last since it's async in nature.
 *
 * @param element The element to check
 * @param states Array of states to check
 * @returns Object with success and optional missingState
 */
export async function checkElementStates(
  element: Element,
  states: ElementState[]
): Promise<{ success: boolean; missingState?: ElementState }> {
  // Check stable state first if present (it's async and most expensive)
  if (states.includes('stable')) {
    const stabilityResult = await checkElementStability(element, { frameCount: 2 });
    if (!stabilityResult.stable) {
      return { success: false, missingState: 'stable' };
    }
    if (stabilityResult.reason === 'disconnected') {
      return { success: false, missingState: 'stable' };
    }
  }

  // Check all other states synchronously
  for (const state of states) {
    if (state === 'stable') continue;

    try {
      const result = checkElementState(element, state);
      if (result.received === 'error:notconnected') {
        return { success: false, missingState: state };
      }
      if (!result.matches) {
        return { success: false, missingState: state };
      }
    } catch {
      return { success: false, missingState: state };
    }
  }

  return { success: true };
}

/**
 * Synchronous version of checkElementStates for non-stable states.
 * Does not handle 'stable' state properly - use checkElementStates for that.
 *
 * @param element The element to check
 * @param states Array of states to check (should not include 'stable')
 * @returns Object with success and optional missingState
 */
export function checkElementStatesSync(
  element: Element,
  states: SyncElementState[]
): { success: boolean; missingState?: SyncElementState } {
  for (const state of states) {
    try {
      const result = checkElementState(element, state);
      if (result.received === 'error:notconnected') {
        return { success: false, missingState: state };
      }
      if (!result.matches) {
        return { success: false, missingState: state };
      }
    } catch {
      return { success: false, missingState: state };
    }
  }

  return { success: true };
}
