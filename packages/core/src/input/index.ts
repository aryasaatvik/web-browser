export * from './keys.js';
export * from './mouse.js';
export * from './keyboard.js';
export * from './touch.js';

// Re-export specific types for state management
export type { Modifier, TypeOptions, KeyboardEventData } from './keyboard.js';
export { KeyboardState } from './keyboard.js';

export type { ClickOptions, MouseEventData, WheelEventData } from './mouse.js';
export { MouseState } from './mouse.js';

export type { TouchPoint, TouchEventData } from './touch.js';
export { TouchState } from './touch.js';
