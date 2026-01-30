/**
 * Tests for MouseState class.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MouseState, type MouseButton, type ClickOptions } from './mouse.js';

describe('MouseState', () => {
  let mouse: MouseState;

  beforeEach(() => {
    mouse = new MouseState();
  });

  describe('initialization', () => {
    it('should start at position 0,0', () => {
      const pos = mouse.getPosition();
      expect(pos.x).toBe(0);
      expect(pos.y).toBe(0);
    });

    it('should start with no pressed buttons', () => {
      expect(mouse.isButtonPressed('left')).toBe(false);
      expect(mouse.isButtonPressed('right')).toBe(false);
      expect(mouse.isButtonPressed('middle')).toBe(false);
    });

    it('should start with buttons mask of 0', () => {
      expect(mouse.getButtonsMask()).toBe(0);
    });
  });

  describe('getPosition()', () => {
    it('should return current position', () => {
      mouse.move(100, 200);
      const pos = mouse.getPosition();
      expect(pos.x).toBe(100);
      expect(pos.y).toBe(200);
    });
  });

  describe('move()', () => {
    it('should update position', () => {
      mouse.move(50, 75);
      const pos = mouse.getPosition();
      expect(pos.x).toBe(50);
      expect(pos.y).toBe(75);
    });

    it('should return single event for default steps', () => {
      const events = mouse.move(100, 100);
      expect(events).toHaveLength(1);
    });

    it('should return correct coordinates in event', () => {
      const events = mouse.move(100, 200);
      expect(events[0].clientX).toBe(100);
      expect(events[0].clientY).toBe(200);
    });

    it('should interpolate with multiple steps', () => {
      const events = mouse.move(100, 100, 5);
      expect(events).toHaveLength(5);
      expect(events[0].clientX).toBe(20);
      expect(events[0].clientY).toBe(20);
      expect(events[4].clientX).toBe(100);
      expect(events[4].clientY).toBe(100);
    });

    it('should include pressed buttons in move events', () => {
      mouse.down('left');
      const events = mouse.move(100, 100);
      expect(events[0].buttons).toBe(1);
    });
  });

  describe('down()', () => {
    it('should track button as pressed', () => {
      mouse.down('left');
      expect(mouse.isButtonPressed('left')).toBe(true);
    });

    it('should return correct event data', () => {
      const event = mouse.down('left');
      expect(event.button).toBe(0);
      expect(event.buttons).toBe(1);
    });

    it('should use left button by default', () => {
      const event = mouse.down();
      expect(event.button).toBe(0);
    });

    it('should return correct button value for right', () => {
      const event = mouse.down('right');
      expect(event.button).toBe(2);
    });

    it('should return correct button value for middle', () => {
      const event = mouse.down('middle');
      expect(event.button).toBe(1);
    });
  });

  describe('up()', () => {
    it('should release button', () => {
      mouse.down('left');
      mouse.up('left');
      expect(mouse.isButtonPressed('left')).toBe(false);
    });

    it('should return correct event data', () => {
      mouse.down('left');
      const event = mouse.up('left');
      expect(event.button).toBe(0);
      expect(event.buttons).toBe(0);
    });

    it('should use left button by default', () => {
      mouse.down('left');
      const event = mouse.up();
      expect(event.button).toBe(0);
    });
  });

  describe('click()', () => {
    it('should return move, down, up, and click events', () => {
      const result = mouse.click(100, 200);
      expect(result.move).toBeDefined();
      expect(result.down).toBeDefined();
      expect(result.up).toBeDefined();
      expect(result.click).toBeDefined();
    });

    it('should move to coordinates', () => {
      mouse.click(100, 200);
      const pos = mouse.getPosition();
      expect(pos.x).toBe(100);
      expect(pos.y).toBe(200);
    });

    it('should use left button by default', () => {
      const result = mouse.click(100, 100);
      expect(result.down.button).toBe(0);
    });

    it('should support right button option', () => {
      const result = mouse.click(100, 100, { button: 'right' });
      expect(result.down.button).toBe(2);
    });

    it('should set correct clickCount', () => {
      const result = mouse.click(100, 100, { clickCount: 2 });
      expect(result.down.detail).toBe(2);
      expect(result.click.detail).toBe(2);
    });

    it('should not leave button pressed after click', () => {
      mouse.click(100, 100);
      expect(mouse.isButtonPressed('left')).toBe(false);
    });

    it('should apply modifiers to events', () => {
      const result = mouse.click(100, 100, { modifiers: ['Shift', 'Control'] });
      expect(result.down.shiftKey).toBe(true);
      expect(result.down.ctrlKey).toBe(true);
    });
  });

  describe('doubleClick()', () => {
    it('should return array of events', () => {
      const events = mouse.doubleClick(100, 100);
      expect(events.length).toBeGreaterThan(1);
    });

    it('should move to coordinates', () => {
      mouse.doubleClick(150, 250);
      const pos = mouse.getPosition();
      expect(pos.x).toBe(150);
      expect(pos.y).toBe(250);
    });

    it('should include dblclick event with clickCount 2', () => {
      const events = mouse.doubleClick(100, 100);
      const dblclick = events[events.length - 1];
      expect(dblclick.detail).toBe(2);
    });

    it('should support button option', () => {
      const events = mouse.doubleClick(100, 100, { button: 'middle' });
      // Check that middle button is used
      const downEvent = events.find((e) => e.button === 1);
      expect(downEvent).toBeDefined();
    });

    it('should apply modifiers', () => {
      const events = mouse.doubleClick(100, 100, { modifiers: ['Alt'] });
      expect(events.some((e) => e.altKey)).toBe(true);
    });
  });

  describe('contextClick()', () => {
    it('should return array of events', () => {
      const events = mouse.contextClick(100, 100);
      expect(events.length).toBeGreaterThan(1);
    });

    it('should move to coordinates', () => {
      mouse.contextClick(75, 125);
      const pos = mouse.getPosition();
      expect(pos.x).toBe(75);
      expect(pos.y).toBe(125);
    });

    it('should use right button', () => {
      const events = mouse.contextClick(100, 100);
      const downEvent = events.find((e) => e.button === 2);
      expect(downEvent).toBeDefined();
    });
  });

  describe('isButtonPressed()', () => {
    it('should return false for unpressed button', () => {
      expect(mouse.isButtonPressed('left')).toBe(false);
    });

    it('should return true for pressed button', () => {
      mouse.down('left');
      expect(mouse.isButtonPressed('left')).toBe(true);
    });

    it('should track all button types', () => {
      const buttons: MouseButton[] = ['left', 'right', 'middle'];
      for (const button of buttons) {
        mouse.down(button);
        expect(mouse.isButtonPressed(button)).toBe(true);
      }
    });
  });

  describe('getButtonsMask()', () => {
    it('should return 0 with no buttons pressed', () => {
      expect(mouse.getButtonsMask()).toBe(0);
    });

    it('should return 1 for left button', () => {
      mouse.down('left');
      expect(mouse.getButtonsMask()).toBe(1);
    });

    it('should return 2 for right button', () => {
      mouse.down('right');
      expect(mouse.getButtonsMask()).toBe(2);
    });

    it('should return 4 for middle button', () => {
      mouse.down('middle');
      expect(mouse.getButtonsMask()).toBe(4);
    });

    it('should combine multiple buttons', () => {
      mouse.down('left');
      mouse.down('right');
      expect(mouse.getButtonsMask()).toBe(3); // 1 + 2
    });

    it('should return correct mask for all buttons', () => {
      mouse.down('left');
      mouse.down('right');
      mouse.down('middle');
      expect(mouse.getButtonsMask()).toBe(7); // 1 + 2 + 4
    });
  });

  describe('multiple buttons pressed simultaneously', () => {
    it('should track multiple buttons', () => {
      mouse.down('left');
      mouse.down('right');
      expect(mouse.isButtonPressed('left')).toBe(true);
      expect(mouse.isButtonPressed('right')).toBe(true);
    });

    it('should release only specified button', () => {
      mouse.down('left');
      mouse.down('right');
      mouse.up('left');
      expect(mouse.isButtonPressed('left')).toBe(false);
      expect(mouse.isButtonPressed('right')).toBe(true);
    });

    it('should update buttons mask correctly', () => {
      mouse.down('left');
      mouse.down('right');
      expect(mouse.getButtonsMask()).toBe(3);
      mouse.up('left');
      expect(mouse.getButtonsMask()).toBe(2);
    });
  });

  describe('wheel()', () => {
    it('should return wheel event data', () => {
      const event = mouse.wheel(0, 100);
      expect(event.deltaX).toBe(0);
      expect(event.deltaY).toBe(100);
    });

    it('should use current position', () => {
      mouse.move(50, 75);
      const event = mouse.wheel(10, 20);
      expect(event.clientX).toBe(50);
      expect(event.clientY).toBe(75);
    });

    it('should set deltaMode to pixel', () => {
      const event = mouse.wheel(0, 100);
      expect(event.deltaMode).toBe(0); // DOM_DELTA_PIXEL
    });

    it('should support negative deltas', () => {
      const event = mouse.wheel(-50, -100);
      expect(event.deltaX).toBe(-50);
      expect(event.deltaY).toBe(-100);
    });

    it('should include button state', () => {
      mouse.down('left');
      const event = mouse.wheel(0, 100);
      expect(event.buttons).toBe(1);
    });
  });

  describe('reset()', () => {
    it('should move position to 0,0', () => {
      mouse.move(100, 200);
      mouse.reset();
      const pos = mouse.getPosition();
      expect(pos.x).toBe(0);
      expect(pos.y).toBe(0);
    });

    it('should release all buttons', () => {
      mouse.down('left');
      mouse.down('right');
      mouse.down('middle');
      mouse.reset();
      expect(mouse.isButtonPressed('left')).toBe(false);
      expect(mouse.isButtonPressed('right')).toBe(false);
      expect(mouse.isButtonPressed('middle')).toBe(false);
    });

    it('should reset buttons mask to 0', () => {
      mouse.down('left');
      mouse.reset();
      expect(mouse.getButtonsMask()).toBe(0);
    });

    it('should clear modifiers', () => {
      mouse.setModifiers(new Set(['Shift', 'Control']));
      mouse.reset();
      const event = mouse.down('left');
      expect(event.shiftKey).toBe(false);
      expect(event.ctrlKey).toBe(false);
    });
  });

  describe('setModifiers()', () => {
    it('should set modifiers for events', () => {
      mouse.setModifiers(new Set(['Shift']));
      const event = mouse.down('left');
      expect(event.shiftKey).toBe(true);
    });

    it('should update modifiers', () => {
      mouse.setModifiers(new Set(['Shift']));
      mouse.setModifiers(new Set(['Control']));
      const event = mouse.down('left');
      expect(event.shiftKey).toBe(false);
      expect(event.ctrlKey).toBe(true);
    });
  });

  describe('event coordinates', () => {
    it('should set clientX and clientY', () => {
      const events = mouse.move(100, 200);
      expect(events[0].clientX).toBe(100);
      expect(events[0].clientY).toBe(200);
    });

    it('should set screenX and screenY to same values', () => {
      const events = mouse.move(100, 200);
      expect(events[0].screenX).toBe(100);
      expect(events[0].screenY).toBe(200);
    });
  });

  describe('drag simulation', () => {
    it('should maintain button state during move', () => {
      mouse.down('left');
      const events = mouse.move(100, 100, 3);
      for (const event of events) {
        expect(event.buttons).toBe(1);
      }
    });

    it('should track position during drag', () => {
      mouse.down('left');
      mouse.move(50, 50);
      expect(mouse.getPosition()).toEqual({ x: 50, y: 50 });
      mouse.move(100, 100);
      expect(mouse.getPosition()).toEqual({ x: 100, y: 100 });
    });
  });

  describe('click options modifiers integration', () => {
    it('should apply all modifiers to click', () => {
      const result = mouse.click(100, 100, {
        modifiers: ['Alt', 'Control', 'Meta', 'Shift'],
      });
      expect(result.down.altKey).toBe(true);
      expect(result.down.ctrlKey).toBe(true);
      expect(result.down.metaKey).toBe(true);
      expect(result.down.shiftKey).toBe(true);
    });

    it('should preserve modifiers through click sequence', () => {
      const result = mouse.click(100, 100, { modifiers: ['Shift'] });
      expect(result.move[0].shiftKey).toBe(true);
      expect(result.down.shiftKey).toBe(true);
      expect(result.up.shiftKey).toBe(true);
      expect(result.click.shiftKey).toBe(true);
    });
  });
});
