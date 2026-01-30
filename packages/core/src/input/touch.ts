/**
 * Touch event construction utilities.
 * Provides stateful touch tracking and gesture support.
 */

import { deepElementFromPoint } from '../dom/shadow.js';
import type { Modifier } from './keyboard.js';
import { Modifiers } from './keys.js';

/**
 * Represents a single touch point on the screen.
 */
export interface TouchPoint {
  x: number;
  y: number;
  id?: number;
  radiusX?: number;
  radiusY?: number;
  rotationAngle?: number;
  force?: number;
}

/**
 * Touch event data returned by touch state methods.
 */
export interface TouchEventData {
  type: 'touchstart' | 'touchend' | 'touchmove' | 'touchcancel';
  touches: TouchPoint[];
  targetTouches: TouchPoint[];
  changedTouches: TouchPoint[];
  modifiers?: number;
}

/**
 * Stateful touch tracker that manages multiple simultaneous touches.
 * Ports Playwright's touchscreen state management pattern.
 */
export class TouchState {
  private activeTouches: Map<number, TouchPoint> = new Map();
  private nextTouchId = 0;
  private modifiers = new Set<Modifier>();

  /**
   * Get all currently active touches.
   * Returns cloned touch points to prevent mutation issues.
   */
  getActiveTouches(): TouchPoint[] {
    return Array.from(this.activeTouches.values()).map(t => ({ ...t }));
  }

  /**
   * Get the number of active touches.
   */
  getActiveTouchCount(): number {
    return this.activeTouches.size;
  }

  /**
   * Set the current modifiers (for keyboard integration).
   */
  setModifiers(modifiers: Set<Modifier>): void {
    this.modifiers = new Set(modifiers);
  }

  /**
   * Get the current modifier mask.
   */
  private getModifierMask(): number {
    let mask = 0;
    if (this.modifiers.has('Alt')) mask |= Modifiers.Alt;
    if (this.modifiers.has('Control')) mask |= Modifiers.Control;
    if (this.modifiers.has('Meta')) mask |= Modifiers.Meta;
    if (this.modifiers.has('Shift')) mask |= Modifiers.Shift;
    return mask;
  }

  /**
   * Start a touch at the given coordinates.
   * Returns touch ID for multi-touch tracking.
   */
  touchStart(x: number, y: number): { id: number; event: TouchEventData } {
    const id = this.nextTouchId++;
    const touch: TouchPoint = { x, y, id, radiusX: 1, radiusY: 1, force: 1 };
    this.activeTouches.set(id, touch);

    const event: TouchEventData = {
      type: 'touchstart',
      touches: this.getActiveTouches(),
      targetTouches: this.getActiveTouches(),
      changedTouches: [{ ...touch }],
      modifiers: this.getModifierMask(),
    };

    return { id, event };
  }

  /**
   * Move an existing touch to new coordinates.
   */
  touchMove(id: number, x: number, y: number): TouchEventData {
    const touch = this.activeTouches.get(id);
    if (!touch) {
      throw new Error(`Touch with id ${id} not found`);
    }

    touch.x = x;
    touch.y = y;

    return {
      type: 'touchmove',
      touches: this.getActiveTouches(),
      targetTouches: this.getActiveTouches(),
      changedTouches: [{ ...touch }],
      modifiers: this.getModifierMask(),
    };
  }

  /**
   * End a touch.
   */
  touchEnd(id: number): TouchEventData {
    const touch = this.activeTouches.get(id);
    if (!touch) {
      throw new Error(`Touch with id ${id} not found`);
    }

    // Clone before deleting to preserve the touch data
    const clonedTouch = { ...touch };
    this.activeTouches.delete(id);

    return {
      type: 'touchend',
      touches: this.getActiveTouches(),
      targetTouches: this.getActiveTouches(),
      changedTouches: [clonedTouch],
      modifiers: this.getModifierMask(),
    };
  }

  /**
   * Cancel all active touches.
   */
  touchCancel(): TouchEventData {
    const changedTouches = this.getActiveTouches();
    this.activeTouches.clear();

    return {
      type: 'touchcancel',
      touches: [],
      targetTouches: [],
      changedTouches,
      modifiers: this.getModifierMask(),
    };
  }

  /**
   * Perform a tap (touchStart + touchEnd) at coordinates.
   */
  tap(x: number, y: number): TouchEventData[] {
    const { event: startEvent, id } = this.touchStart(x, y);
    const endEvent = this.touchEnd(id);
    return [startEvent, endEvent];
  }

  /**
   * Perform a double tap.
   */
  doubleTap(x: number, y: number): TouchEventData[] {
    const events: TouchEventData[] = [];

    // First tap
    events.push(...this.tap(x, y));

    // Second tap
    events.push(...this.tap(x, y));

    return events;
  }

  /**
   * Perform a long press (touchStart, hold, touchEnd).
   * Returns all events; the caller is responsible for timing.
   */
  longPress(x: number, y: number, _duration?: number): TouchEventData[] {
    const { event: startEvent, id } = this.touchStart(x, y);
    const endEvent = this.touchEnd(id);

    // Return both events; the duration parameter is advisory
    // and timing should be handled by the caller
    return [startEvent, endEvent];
  }

  /**
   * Perform a swipe from start to end.
   * Returns all events including intermediate move events.
   */
  swipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    steps = 10
  ): TouchEventData[] {
    const events: TouchEventData[] = [];

    // Start touch
    const { event: startEvent, id } = this.touchStart(startX, startY);
    events.push(startEvent);

    // Move in steps
    for (let i = 1; i <= steps; i++) {
      const x = startX + (endX - startX) * (i / steps);
      const y = startY + (endY - startY) * (i / steps);
      events.push(this.touchMove(id, x, y));
    }

    // End touch
    events.push(this.touchEnd(id));

    return events;
  }

  /**
   * Perform a pinch gesture (two-finger zoom).
   * startDistance and endDistance are the distances between the two fingers.
   */
  pinch(
    centerX: number,
    centerY: number,
    startDistance: number,
    endDistance: number,
    steps = 10
  ): TouchEventData[] {
    const events: TouchEventData[] = [];

    // Calculate starting positions for two touches
    const halfStartDist = startDistance / 2;
    const touch1StartX = centerX - halfStartDist;
    const touch1StartY = centerY;
    const touch2StartX = centerX + halfStartDist;
    const touch2StartY = centerY;

    // Start first touch
    const { event: start1Event, id: id1 } = this.touchStart(touch1StartX, touch1StartY);
    events.push(start1Event);

    // Start second touch
    const { event: start2Event, id: id2 } = this.touchStart(touch2StartX, touch2StartY);
    events.push(start2Event);

    // Move both touches in steps
    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      const currentHalfDist = halfStartDist + (endDistance / 2 - halfStartDist) * progress;

      const touch1X = centerX - currentHalfDist;
      const touch2X = centerX + currentHalfDist;

      events.push(this.touchMove(id1, touch1X, centerY));
      events.push(this.touchMove(id2, touch2X, centerY));
    }

    // End both touches
    events.push(this.touchEnd(id1));
    events.push(this.touchEnd(id2));

    return events;
  }

  /**
   * Reset all touch state.
   */
  reset(): void {
    this.activeTouches.clear();
    this.nextTouchId = 0;
    this.modifiers.clear();
  }
}

/**
 * Create a Touch object for use in TouchEvent.
 */
function createTouch(
  target: EventTarget,
  point: TouchPoint,
  identifier: number
): Touch {
  // Use Touch constructor if available (modern browsers)
  if (typeof Touch !== 'undefined') {
    return new Touch({
      identifier,
      target,
      clientX: point.x,
      clientY: point.y,
      screenX: point.x,
      screenY: point.y,
      pageX: point.x + (typeof window !== 'undefined' ? window.scrollX : 0),
      pageY: point.y + (typeof window !== 'undefined' ? window.scrollY : 0),
      radiusX: point.radiusX ?? 1,
      radiusY: point.radiusY ?? 1,
      rotationAngle: point.rotationAngle ?? 0,
      force: point.force ?? 1,
    });
  }

  // Fallback for older WebKit (document.createTouch)
  const doc = target instanceof Node ? target.ownerDocument : document;
  if (doc && 'createTouch' in doc) {
    return (doc as any).createTouch(
      typeof window !== 'undefined' ? window : null,
      target,
      identifier,
      point.x + (typeof window !== 'undefined' ? window.scrollX : 0),
      point.y + (typeof window !== 'undefined' ? window.scrollY : 0),
      point.x,
      point.y
    );
  }

  // Last resort: create a mock Touch-like object
  return {
    identifier,
    target,
    clientX: point.x,
    clientY: point.y,
    screenX: point.x,
    screenY: point.y,
    pageX: point.x + (typeof window !== 'undefined' ? window.scrollX : 0),
    pageY: point.y + (typeof window !== 'undefined' ? window.scrollY : 0),
    radiusX: point.radiusX ?? 1,
    radiusY: point.radiusY ?? 1,
    rotationAngle: point.rotationAngle ?? 0,
    force: point.force ?? 1,
  } as Touch;
}

/**
 * Create a TouchList from an array of Touch objects.
 * Returns the array cast appropriately for use with TouchEvent constructor.
 */
function createTouchList(touches: Touch[]): Touch[] {
  // The TouchEvent constructor actually accepts Touch[] despite the type definition
  // saying TouchList. We return the array directly and let the runtime handle it.
  // Add TouchList-like item method for compatibility
  const touchArray = touches as Touch[] & { item?: (index: number) => Touch | null };
  if (!('item' in touchArray)) {
    touchArray.item = (index: number) => touches[index] ?? null;
  }
  return touchArray;
}

/**
 * Create a TouchEvent from TouchEventData.
 */
export function createTouchEvent(
  target: EventTarget,
  data: TouchEventData
): TouchEvent {
  const modifiers = data.modifiers ?? 0;

  // Create Touch objects for each touch point
  const touches = data.touches.map((point, i) =>
    createTouch(target, point, point.id ?? i)
  );
  const targetTouches = data.targetTouches.map((point, i) =>
    createTouch(target, point, point.id ?? i)
  );
  const changedTouches = data.changedTouches.map((point, i) =>
    createTouch(target, point, point.id ?? i)
  );

  // Try to use TouchEvent constructor (modern browsers)
  if (typeof TouchEvent !== 'undefined') {
    try {
      // TouchEvent constructor accepts Touch[] despite type definitions saying TouchList
      // Cast to any to avoid type conflicts with TouchList
      const init: TouchEventInit = {
        bubbles: true,
        cancelable: data.type !== 'touchcancel',
        view: typeof window !== 'undefined' ? window : undefined,
        ctrlKey: (modifiers & Modifiers.Control) !== 0,
        altKey: (modifiers & Modifiers.Alt) !== 0,
        shiftKey: (modifiers & Modifiers.Shift) !== 0,
        metaKey: (modifiers & Modifiers.Meta) !== 0,
      };
      // Assign touch arrays - browser accepts arrays but TS types expect TouchList
      (init as any).touches = createTouchList(touches);
      (init as any).targetTouches = createTouchList(targetTouches);
      (init as any).changedTouches = createTouchList(changedTouches);
      return new TouchEvent(data.type, init);
    } catch {
      // Fall through to createEvent fallback
    }
  }

  // Fallback: use document.createEvent (older browsers)
  if (typeof document !== 'undefined' && document.createEvent) {
    const event = document.createEvent('TouchEvent') as TouchEvent;

    // Use initTouchEvent if available
    if ('initTouchEvent' in event) {
      (event as any).initTouchEvent(
        data.type,
        true, // bubbles
        data.type !== 'touchcancel', // cancelable
        typeof window !== 'undefined' ? window : null, // view
        0, // detail
        0, 0, // screenX, screenY
        0, 0, // clientX, clientY
        (modifiers & Modifiers.Control) !== 0,
        (modifiers & Modifiers.Alt) !== 0,
        (modifiers & Modifiers.Shift) !== 0,
        (modifiers & Modifiers.Meta) !== 0,
        createTouchList(touches),
        createTouchList(targetTouches),
        createTouchList(changedTouches)
      );
    }

    return event;
  }

  // Absolute fallback: create a basic event with touch properties
  const event = new Event(data.type, {
    bubbles: true,
    cancelable: data.type !== 'touchcancel',
  }) as unknown as TouchEvent;

  // Add touch-specific properties
  Object.defineProperties(event, {
    touches: { value: createTouchList(touches), writable: false },
    targetTouches: { value: createTouchList(targetTouches), writable: false },
    changedTouches: { value: createTouchList(changedTouches), writable: false },
    ctrlKey: { value: (modifiers & Modifiers.Control) !== 0, writable: false },
    altKey: { value: (modifiers & Modifiers.Alt) !== 0, writable: false },
    shiftKey: { value: (modifiers & Modifiers.Shift) !== 0, writable: false },
    metaKey: { value: (modifiers & Modifiers.Meta) !== 0, writable: false },
  });

  return event;
}

/**
 * Dispatch a touch event on an element.
 */
export function dispatchTouchEvent(
  element: Element,
  data: TouchEventData
): boolean {
  const event = createTouchEvent(element, data);
  return element.dispatchEvent(event);
}

/**
 * Dispatch a tap sequence on an element at coordinates.
 */
export function dispatchTap(
  element: Element,
  x: number,
  y: number
): boolean {
  const state = new TouchState();
  const events = state.tap(x, y);

  for (const eventData of events) {
    const event = createTouchEvent(element, eventData);
    element.dispatchEvent(event);
  }

  return true;
}

/**
 * Dispatch a tap at coordinates (finds element automatically).
 */
export function dispatchTapAt(
  x: number,
  y: number,
  modifiers = 0
): boolean {
  const element = deepElementFromPoint(x, y);
  if (!element) return false;

  const state = new TouchState();

  // Apply modifiers
  const modSet = new Set<Modifier>();
  if (modifiers & Modifiers.Alt) modSet.add('Alt');
  if (modifiers & Modifiers.Control) modSet.add('Control');
  if (modifiers & Modifiers.Meta) modSet.add('Meta');
  if (modifiers & Modifiers.Shift) modSet.add('Shift');
  state.setModifiers(modSet);

  const events = state.tap(x, y);

  for (const eventData of events) {
    const event = createTouchEvent(element, eventData);
    element.dispatchEvent(event);
  }

  return true;
}

/**
 * Dispatch a swipe gesture at coordinates.
 */
export function dispatchSwipeAt(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  steps = 10
): boolean {
  const startElement = deepElementFromPoint(startX, startY);
  if (!startElement) return false;

  const state = new TouchState();
  const events = state.swipe(startX, startY, endX, endY, steps);

  for (const eventData of events) {
    // For move and end events, find the element at the current touch position
    const touchPoint = eventData.changedTouches[0];
    const element = touchPoint
      ? deepElementFromPoint(touchPoint.x, touchPoint.y) ?? startElement
      : startElement;

    const event = createTouchEvent(element, eventData);
    element.dispatchEvent(event);
  }

  return true;
}

/**
 * Dispatch a pinch gesture at coordinates.
 */
export function dispatchPinchAt(
  centerX: number,
  centerY: number,
  startDistance: number,
  endDistance: number,
  steps = 10
): boolean {
  const element = deepElementFromPoint(centerX, centerY);
  if (!element) return false;

  const state = new TouchState();
  const events = state.pinch(centerX, centerY, startDistance, endDistance, steps);

  for (const eventData of events) {
    const event = createTouchEvent(element, eventData);
    element.dispatchEvent(event);
  }

  return true;
}
