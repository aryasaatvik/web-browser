/**
 * Mouse event construction utilities.
 */

import { getClickablePoint } from '../dom/visibility.js';
import { getElementByRef } from '../a11y/refs.js';
import { deepElementFromPoint } from '../dom/shadow.js';
import type { Modifier } from './keyboard.js';
import { Modifiers } from './keys.js';

export type MouseButton = 'left' | 'right' | 'middle';

export interface MouseEventOptions {
  button?: MouseButton;
  clickCount?: number;
  modifiers?: number;
}

/**
 * Options for click operations
 */
export interface ClickOptions {
  button?: MouseButton;
  clickCount?: number;
  delay?: number; // Delay between down and up
  modifiers?: Modifier[];
}

/**
 * Mouse event init data returned by state methods
 */
export interface MouseEventData {
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
  button: number;
  buttons: number;
  detail: number;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/**
 * Wheel event init data
 */
export interface WheelEventData extends MouseEventData {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
}

/**
 * Button value for MouseEvent.button property
 */
const BUTTON_VALUES: Record<MouseButton, number> = {
  left: 0,
  middle: 1,
  right: 2,
};

/**
 * Button mask for MouseEvent.buttons property
 */
const BUTTON_MASKS: Record<MouseButton, number> = {
  left: 1,
  right: 2,
  middle: 4,
};

/**
 * Stateful mouse that tracks position and button state.
 * Ports Playwright's mouse state management pattern.
 */
export class MouseState {
  private x = 0;
  private y = 0;
  private buttons = new Set<MouseButton>();
  private modifiers = new Set<Modifier>();

  /**
   * Get current mouse position.
   */
  getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  /**
   * Set the current modifiers (for keyboard integration).
   */
  setModifiers(modifiers: Set<Modifier>): void {
    this.modifiers = new Set(modifiers);
  }

  /**
   * Move mouse to coordinates, optionally with interpolation steps.
   * Returns array of move events (one per step).
   */
  move(x: number, y: number, steps = 1): MouseEventData[] {
    const events: MouseEventData[] = [];
    const fromX = this.x;
    const fromY = this.y;

    for (let i = 1; i <= steps; i++) {
      const middleX = fromX + (x - fromX) * (i / steps);
      const middleY = fromY + (y - fromY) * (i / steps);

      events.push(this.createEventData(middleX, middleY, 'none'));
    }

    this.x = x;
    this.y = y;

    return events;
  }

  /**
   * Press a mouse button down.
   */
  down(button: MouseButton = 'left'): MouseEventData {
    this.buttons.add(button);
    return this.createEventData(this.x, this.y, button, 1);
  }

  /**
   * Release a mouse button.
   */
  up(button: MouseButton = 'left'): MouseEventData {
    this.buttons.delete(button);
    return this.createEventData(this.x, this.y, button, 1);
  }

  /**
   * Click at coordinates (move + down + up + click event).
   * Returns all event data.
   */
  click(
    x: number,
    y: number,
    options: ClickOptions = {}
  ): {
    move: MouseEventData[];
    down: MouseEventData;
    up: MouseEventData;
    click: MouseEventData;
  } {
    const button = options.button || 'left';
    const clickCount = options.clickCount || 1;

    // Apply modifiers if provided
    if (options.modifiers) {
      this.modifiers = new Set(options.modifiers);
    }

    const moveEvents = this.move(x, y);

    // Add button for down event
    this.buttons.add(button);
    const downEvent = this.createEventData(x, y, button, clickCount);

    // Remove button for up event
    this.buttons.delete(button);
    const upEvent = this.createEventData(x, y, button, clickCount);

    // Click event (buttons is 0)
    const clickEvent = this.createEventData(x, y, button, clickCount);

    return {
      move: moveEvents,
      down: downEvent,
      up: upEvent,
      click: clickEvent,
    };
  }

  /**
   * Double-click at coordinates.
   */
  doubleClick(x: number, y: number, options: ClickOptions = {}): MouseEventData[] {
    const button = options.button || 'left';
    const events: MouseEventData[] = [];

    // Apply modifiers if provided
    if (options.modifiers) {
      this.modifiers = new Set(options.modifiers);
    }

    // Move to position
    events.push(...this.move(x, y));

    // First click (clickCount: 1)
    this.buttons.add(button);
    events.push(this.createEventData(x, y, button, 1)); // mousedown
    this.buttons.delete(button);
    events.push(this.createEventData(x, y, button, 1)); // mouseup
    events.push(this.createEventData(x, y, button, 1)); // click

    // Second click (clickCount: 2)
    this.buttons.add(button);
    events.push(this.createEventData(x, y, button, 2)); // mousedown
    this.buttons.delete(button);
    events.push(this.createEventData(x, y, button, 2)); // mouseup
    events.push(this.createEventData(x, y, button, 2)); // click
    events.push(this.createEventData(x, y, button, 2)); // dblclick

    return events;
  }

  /**
   * Right-click at coordinates.
   */
  contextClick(x: number, y: number): MouseEventData[] {
    const events: MouseEventData[] = [];

    // Move to position
    events.push(...this.move(x, y));

    // Right click
    this.buttons.add('right');
    events.push(this.createEventData(x, y, 'right', 1)); // mousedown
    this.buttons.delete('right');
    events.push(this.createEventData(x, y, 'right', 1)); // mouseup
    events.push(this.createEventData(x, y, 'right', 1)); // contextmenu

    return events;
  }

  /**
   * Check if a button is currently pressed.
   */
  isButtonPressed(button: MouseButton): boolean {
    return this.buttons.has(button);
  }

  /**
   * Get the current buttons mask (bitfield).
   * left: 1, right: 2, middle: 4
   */
  getButtonsMask(): number {
    let mask = 0;
    for (const button of this.buttons) {
      mask |= BUTTON_MASKS[button];
    }
    return mask;
  }

  /**
   * Wheel scroll at current position.
   */
  wheel(deltaX: number, deltaY: number): WheelEventData {
    return {
      ...this.createEventData(this.x, this.y, 'none'),
      deltaX,
      deltaY,
      deltaMode: 0, // DOM_DELTA_PIXEL
    };
  }

  /**
   * Reset all state (move to 0,0, release all buttons).
   */
  reset(): void {
    this.x = 0;
    this.y = 0;
    this.buttons.clear();
    this.modifiers.clear();
  }

  /**
   * Create mouse event data.
   */
  private createEventData(
    x: number,
    y: number,
    button: MouseButton | 'none',
    detail = 0
  ): MouseEventData {
    return {
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: button === 'none' ? 0 : BUTTON_VALUES[button],
      buttons: this.getButtonsMask(),
      detail,
      ctrlKey: this.modifiers.has('Control'),
      altKey: this.modifiers.has('Alt'),
      shiftKey: this.modifiers.has('Shift'),
      metaKey: this.modifiers.has('Meta'),
    };
  }
}

/**
 * Get the numeric button value for a mouse button name.
 */
function getButtonValue(button: MouseButton): number {
  switch (button) {
    case 'left': return 0;
    case 'middle': return 1;
    case 'right': return 2;
    default: return 0;
  }
}

/**
 * Get the buttons bitmask for a mouse button.
 */
function getButtonsMask(button: MouseButton): number {
  switch (button) {
    case 'left': return 1;
    case 'middle': return 4;
    case 'right': return 2;
    default: return 1;
  }
}

/**
 * Create a mouse event with the given options.
 */
export function createMouseEvent(
  type: string,
  x: number,
  y: number,
  options: MouseEventOptions = {}
): MouseEvent {
  const button = options.button || 'left';
  const clickCount = options.clickCount || 1;
  const modifiers = options.modifiers || 0;

  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    detail: clickCount,
    screenX: x,
    screenY: y,
    clientX: x,
    clientY: y,
    button: getButtonValue(button),
    buttons: type === 'mouseup' ? 0 : getButtonsMask(button),
    ctrlKey: (modifiers & 2) !== 0,
    altKey: (modifiers & 1) !== 0,
    shiftKey: (modifiers & 8) !== 0,
    metaKey: (modifiers & 4) !== 0,
  });
}

/**
 * Dispatch a click at coordinates.
 */
export function dispatchClickAt(
  x: number,
  y: number,
  options: MouseEventOptions = {}
): boolean {
  const element = deepElementFromPoint(x, y);
  if (!element) return false;

  // Dispatch mousedown, mouseup, and click
  const mousedown = createMouseEvent('mousedown', x, y, options);
  const mouseup = createMouseEvent('mouseup', x, y, options);
  const click = createMouseEvent('click', x, y, options);

  element.dispatchEvent(mousedown);
  element.dispatchEvent(mouseup);
  element.dispatchEvent(click);

  return true;
}

/**
 * Dispatch a click on an element by ref.
 */
export function dispatchClickByRef(
  ref: string,
  options: MouseEventOptions = {}
): boolean {
  const element = getElementByRef(ref);
  if (!element) return false;

  const point = getClickablePoint(element);
  if (!point) return false;

  return dispatchClickAt(point.x, point.y, options);
}

/**
 * Dispatch a double click at coordinates.
 */
export function dispatchDoubleClickAt(
  x: number,
  y: number,
  options: MouseEventOptions = {}
): boolean {
  const element = deepElementFromPoint(x, y);
  if (!element) return false;

  // First click
  dispatchClickAt(x, y, { ...options, clickCount: 1 });

  // Second click with clickCount: 2
  dispatchClickAt(x, y, { ...options, clickCount: 2 });

  // Dispatch dblclick event
  const dblclick = createMouseEvent('dblclick', x, y, { ...options, clickCount: 2 });
  element.dispatchEvent(dblclick);

  return true;
}

/**
 * Dispatch a right click at coordinates.
 */
export function dispatchRightClickAt(
  x: number,
  y: number,
  options: MouseEventOptions = {}
): boolean {
  const element = deepElementFromPoint(x, y);
  if (!element) return false;

  const rightClickOptions = { ...options, button: 'right' as MouseButton };

  // Dispatch mousedown and mouseup
  const mousedown = createMouseEvent('mousedown', x, y, rightClickOptions);
  const mouseup = createMouseEvent('mouseup', x, y, rightClickOptions);
  const contextmenu = createMouseEvent('contextmenu', x, y, rightClickOptions);

  element.dispatchEvent(mousedown);
  element.dispatchEvent(mouseup);
  element.dispatchEvent(contextmenu);

  return true;
}

/**
 * Dispatch mouse move to coordinates.
 */
export function dispatchMouseMove(x: number, y: number, modifiers = 0): void {
  const element = deepElementFromPoint(x, y);
  if (!element) return;

  const event = createMouseEvent('mousemove', x, y, { modifiers });
  element.dispatchEvent(event);
}

/**
 * Dispatch mouse hover on an element (mouseenter + mouseover).
 */
export function dispatchHoverAt(x: number, y: number): boolean {
  const element = deepElementFromPoint(x, y);
  if (!element) return false;

  const mouseenter = new MouseEvent('mouseenter', {
    bubbles: false,
    cancelable: false,
    view: window,
    clientX: x,
    clientY: y,
  });

  const mouseover = new MouseEvent('mouseover', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
  });

  element.dispatchEvent(mouseenter);
  element.dispatchEvent(mouseover);

  return true;
}

/**
 * Dispatch a drag operation from source to target coordinates.
 */
export function dispatchDrag(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  steps = 10
): boolean {
  const startElement = deepElementFromPoint(startX, startY);
  if (!startElement) return false;

  // Mouse down at start
  const mousedown = createMouseEvent('mousedown', startX, startY);
  startElement.dispatchEvent(mousedown);

  // Move in steps
  for (let i = 1; i <= steps; i++) {
    const x = startX + (endX - startX) * (i / steps);
    const y = startY + (endY - startY) * (i / steps);
    dispatchMouseMove(x, y);
  }

  // Mouse up at end
  const endElement = deepElementFromPoint(endX, endY);
  if (endElement) {
    const mouseup = createMouseEvent('mouseup', endX, endY);
    endElement.dispatchEvent(mouseup);
  }

  return true;
}

/**
 * Create a wheel event for scrolling.
 */
export function createWheelEvent(
  x: number,
  y: number,
  deltaX: number,
  deltaY: number
): WheelEvent {
  return new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    deltaX,
    deltaY,
    deltaMode: WheelEvent.DOM_DELTA_PIXEL,
  });
}

/**
 * Dispatch a scroll at coordinates.
 */
export function dispatchScroll(
  x: number,
  y: number,
  deltaX: number,
  deltaY: number
): boolean {
  const element = deepElementFromPoint(x, y);
  if (!element) return false;

  const event = createWheelEvent(x, y, deltaX, deltaY);
  element.dispatchEvent(event);

  return true;
}
