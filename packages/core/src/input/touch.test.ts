/**
 * Tests for TouchState class and touch utilities.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TouchState,
  type TouchPoint,
  type TouchEventData,
} from './touch.js';

describe('TouchState', () => {
  let touch: TouchState;

  beforeEach(() => {
    touch = new TouchState();
  });

  describe('initialization', () => {
    it('should start with no active touches', () => {
      expect(touch.getActiveTouches()).toEqual([]);
    });

    it('should start with active touch count of 0', () => {
      expect(touch.getActiveTouchCount()).toBe(0);
    });
  });

  describe('getActiveTouches()', () => {
    it('should return empty array when no touches', () => {
      expect(touch.getActiveTouches()).toEqual([]);
    });

    it('should return active touches after touchStart', () => {
      touch.touchStart(100, 200);
      const touches = touch.getActiveTouches();
      expect(touches).toHaveLength(1);
      expect(touches[0].x).toBe(100);
      expect(touches[0].y).toBe(200);
    });

    it('should return multiple active touches', () => {
      touch.touchStart(100, 100);
      touch.touchStart(200, 200);
      expect(touch.getActiveTouches()).toHaveLength(2);
    });
  });

  describe('getActiveTouchCount()', () => {
    it('should return 0 with no touches', () => {
      expect(touch.getActiveTouchCount()).toBe(0);
    });

    it('should return 1 after single touchStart', () => {
      touch.touchStart(100, 100);
      expect(touch.getActiveTouchCount()).toBe(1);
    });

    it('should increment with each touchStart', () => {
      touch.touchStart(100, 100);
      touch.touchStart(200, 200);
      expect(touch.getActiveTouchCount()).toBe(2);
    });

    it('should decrement after touchEnd', () => {
      const { id } = touch.touchStart(100, 100);
      touch.touchStart(200, 200);
      touch.touchEnd(id);
      expect(touch.getActiveTouchCount()).toBe(1);
    });
  });

  describe('touchStart()', () => {
    it('should create a new touch and return its ID', () => {
      const { id } = touch.touchStart(100, 200);
      expect(typeof id).toBe('number');
    });

    it('should return sequential IDs', () => {
      const { id: id1 } = touch.touchStart(100, 100);
      const { id: id2 } = touch.touchStart(200, 200);
      expect(id2).toBe(id1 + 1);
    });

    it('should return touchstart event', () => {
      const { event } = touch.touchStart(100, 200);
      expect(event.type).toBe('touchstart');
    });

    it('should include touch in all arrays', () => {
      const { event } = touch.touchStart(100, 200);
      expect(event.touches).toHaveLength(1);
      expect(event.targetTouches).toHaveLength(1);
      expect(event.changedTouches).toHaveLength(1);
    });

    it('should have correct coordinates', () => {
      const { event } = touch.touchStart(150, 250);
      expect(event.changedTouches[0].x).toBe(150);
      expect(event.changedTouches[0].y).toBe(250);
    });

    it('should include touch ID in touch point', () => {
      const { id, event } = touch.touchStart(100, 100);
      expect(event.changedTouches[0].id).toBe(id);
    });

    it('should set default touch properties', () => {
      const { event } = touch.touchStart(100, 100);
      const touchPoint = event.changedTouches[0];
      expect(touchPoint.radiusX).toBe(1);
      expect(touchPoint.radiusY).toBe(1);
      expect(touchPoint.force).toBe(1);
    });
  });

  describe('touchMove()', () => {
    it('should update touch coordinates', () => {
      const { id } = touch.touchStart(100, 100);
      touch.touchMove(id, 150, 175);
      const touches = touch.getActiveTouches();
      expect(touches[0].x).toBe(150);
      expect(touches[0].y).toBe(175);
    });

    it('should return touchmove event', () => {
      const { id } = touch.touchStart(100, 100);
      const event = touch.touchMove(id, 150, 150);
      expect(event.type).toBe('touchmove');
    });

    it('should include updated touch in changedTouches', () => {
      const { id } = touch.touchStart(100, 100);
      const event = touch.touchMove(id, 200, 300);
      expect(event.changedTouches).toHaveLength(1);
      expect(event.changedTouches[0].x).toBe(200);
      expect(event.changedTouches[0].y).toBe(300);
    });

    it('should throw for invalid touch ID', () => {
      expect(() => touch.touchMove(999, 100, 100)).toThrow('Touch with id 999 not found');
    });

    it('should maintain all touches in touches array', () => {
      touch.touchStart(100, 100);
      const { id: id2 } = touch.touchStart(200, 200);
      const event = touch.touchMove(id2, 250, 250);
      expect(event.touches).toHaveLength(2);
    });
  });

  describe('touchEnd()', () => {
    it('should remove touch from active touches', () => {
      const { id } = touch.touchStart(100, 100);
      touch.touchEnd(id);
      expect(touch.getActiveTouches()).toHaveLength(0);
    });

    it('should return touchend event', () => {
      const { id } = touch.touchStart(100, 100);
      const event = touch.touchEnd(id);
      expect(event.type).toBe('touchend');
    });

    it('should have empty touches array after last touch ends', () => {
      const { id } = touch.touchStart(100, 100);
      const event = touch.touchEnd(id);
      expect(event.touches).toHaveLength(0);
    });

    it('should include ended touch in changedTouches', () => {
      const { id } = touch.touchStart(100, 200);
      const event = touch.touchEnd(id);
      expect(event.changedTouches).toHaveLength(1);
      expect(event.changedTouches[0].x).toBe(100);
      expect(event.changedTouches[0].y).toBe(200);
    });

    it('should throw for invalid touch ID', () => {
      expect(() => touch.touchEnd(999)).toThrow('Touch with id 999 not found');
    });

    it('should keep other touches active', () => {
      const { id: id1 } = touch.touchStart(100, 100);
      touch.touchStart(200, 200);
      touch.touchEnd(id1);
      expect(touch.getActiveTouchCount()).toBe(1);
    });
  });

  describe('touchCancel()', () => {
    it('should clear all active touches', () => {
      touch.touchStart(100, 100);
      touch.touchStart(200, 200);
      touch.touchCancel();
      expect(touch.getActiveTouches()).toHaveLength(0);
    });

    it('should return touchcancel event', () => {
      touch.touchStart(100, 100);
      const event = touch.touchCancel();
      expect(event.type).toBe('touchcancel');
    });

    it('should have empty touches array', () => {
      touch.touchStart(100, 100);
      const event = touch.touchCancel();
      expect(event.touches).toHaveLength(0);
      expect(event.targetTouches).toHaveLength(0);
    });

    it('should include all cancelled touches in changedTouches', () => {
      touch.touchStart(100, 100);
      touch.touchStart(200, 200);
      const event = touch.touchCancel();
      expect(event.changedTouches).toHaveLength(2);
    });

    it('should return empty changedTouches when no active touches', () => {
      const event = touch.touchCancel();
      expect(event.changedTouches).toHaveLength(0);
    });
  });

  describe('tap()', () => {
    it('should return two events', () => {
      const events = touch.tap(100, 200);
      expect(events).toHaveLength(2);
    });

    it('should return touchstart then touchend', () => {
      const events = touch.tap(100, 200);
      expect(events[0].type).toBe('touchstart');
      expect(events[1].type).toBe('touchend');
    });

    it('should have matching coordinates', () => {
      const events = touch.tap(150, 250);
      expect(events[0].changedTouches[0].x).toBe(150);
      expect(events[0].changedTouches[0].y).toBe(250);
      expect(events[1].changedTouches[0].x).toBe(150);
      expect(events[1].changedTouches[0].y).toBe(250);
    });

    it('should not leave active touches after tap', () => {
      touch.tap(100, 100);
      expect(touch.getActiveTouchCount()).toBe(0);
    });
  });

  describe('doubleTap()', () => {
    it('should return four events', () => {
      const events = touch.doubleTap(100, 100);
      expect(events).toHaveLength(4);
    });

    it('should be two complete tap sequences', () => {
      const events = touch.doubleTap(100, 100);
      expect(events[0].type).toBe('touchstart');
      expect(events[1].type).toBe('touchend');
      expect(events[2].type).toBe('touchstart');
      expect(events[3].type).toBe('touchend');
    });

    it('should have matching coordinates for all events', () => {
      const events = touch.doubleTap(200, 300);
      for (const event of events) {
        expect(event.changedTouches[0].x).toBe(200);
        expect(event.changedTouches[0].y).toBe(300);
      }
    });

    it('should not leave active touches after doubleTap', () => {
      touch.doubleTap(100, 100);
      expect(touch.getActiveTouchCount()).toBe(0);
    });
  });

  describe('longPress()', () => {
    it('should return two events', () => {
      const events = touch.longPress(100, 100);
      expect(events).toHaveLength(2);
    });

    it('should return touchstart then touchend', () => {
      const events = touch.longPress(100, 100);
      expect(events[0].type).toBe('touchstart');
      expect(events[1].type).toBe('touchend');
    });

    it('should accept optional duration parameter', () => {
      const events = touch.longPress(100, 100, 500);
      expect(events).toHaveLength(2);
    });

    it('should not leave active touches after longPress', () => {
      touch.longPress(100, 100);
      expect(touch.getActiveTouchCount()).toBe(0);
    });
  });

  describe('swipe()', () => {
    it('should return start, move, and end events', () => {
      const events = touch.swipe(0, 0, 100, 100, 5);
      expect(events[0].type).toBe('touchstart');
      expect(events[events.length - 1].type).toBe('touchend');
    });

    it('should have correct number of events', () => {
      const steps = 5;
      const events = touch.swipe(0, 0, 100, 100, steps);
      // 1 start + steps moves + 1 end
      expect(events).toHaveLength(1 + steps + 1);
    });

    it('should have move events with default steps', () => {
      const events = touch.swipe(0, 0, 100, 100);
      // 1 start + 10 moves (default) + 1 end
      expect(events).toHaveLength(12);
    });

    it('should interpolate positions correctly', () => {
      const events = touch.swipe(0, 0, 100, 100, 2);
      // start at 0,0
      expect(events[0].changedTouches[0].x).toBe(0);
      expect(events[0].changedTouches[0].y).toBe(0);
      // move to 50,50
      expect(events[1].changedTouches[0].x).toBe(50);
      expect(events[1].changedTouches[0].y).toBe(50);
      // move to 100,100
      expect(events[2].changedTouches[0].x).toBe(100);
      expect(events[2].changedTouches[0].y).toBe(100);
      // end at 100,100
      expect(events[3].changedTouches[0].x).toBe(100);
      expect(events[3].changedTouches[0].y).toBe(100);
    });

    it('should not leave active touches after swipe', () => {
      touch.swipe(0, 0, 100, 100);
      expect(touch.getActiveTouchCount()).toBe(0);
    });

    it('should support vertical swipes', () => {
      const events = touch.swipe(50, 0, 50, 200, 2);
      expect(events[0].changedTouches[0].x).toBe(50);
      expect(events[0].changedTouches[0].y).toBe(0);
      expect(events[events.length - 1].changedTouches[0].y).toBe(200);
    });

    it('should support negative direction swipes', () => {
      const events = touch.swipe(100, 100, 0, 0, 2);
      expect(events[0].changedTouches[0].x).toBe(100);
      expect(events[events.length - 1].changedTouches[0].x).toBe(0);
    });
  });

  describe('pinch()', () => {
    it('should start with two touches', () => {
      const events = touch.pinch(100, 100, 50, 100, 5);
      expect(events[0].type).toBe('touchstart');
      expect(events[1].type).toBe('touchstart');
    });

    it('should end with two touchend events', () => {
      const events = touch.pinch(100, 100, 50, 100, 5);
      expect(events[events.length - 2].type).toBe('touchend');
      expect(events[events.length - 1].type).toBe('touchend');
    });

    it('should have correct number of events', () => {
      const steps = 5;
      const events = touch.pinch(100, 100, 50, 100, steps);
      // 2 starts + (steps * 2 moves) + 2 ends
      expect(events).toHaveLength(2 + steps * 2 + 2);
    });

    it('should start touches at correct distance', () => {
      const events = touch.pinch(100, 100, 50, 100, 2);
      // First touch at center - halfDist (100 - 25 = 75)
      expect(events[0].changedTouches[0].x).toBe(75);
      // Second touch at center + halfDist (100 + 25 = 125)
      expect(events[1].changedTouches[0].x).toBe(125);
    });

    it('should end touches at correct distance', () => {
      const events = touch.pinch(100, 100, 50, 100, 2);
      // End distance is 100, so half is 50
      // Last touchend events should be at 100-50=50 and 100+50=150
      const lastEndEvents = events.filter(e => e.type === 'touchend');
      const touch1End = lastEndEvents[0].changedTouches[0].x;
      const touch2End = lastEndEvents[1].changedTouches[0].x;
      // One should be at 50, other at 150
      expect([touch1End, touch2End].sort((a, b) => a - b)).toEqual([50, 150]);
    });

    it('should not leave active touches after pinch', () => {
      touch.pinch(100, 100, 50, 100);
      expect(touch.getActiveTouchCount()).toBe(0);
    });

    it('should support pinch out (zoom in)', () => {
      const events = touch.pinch(100, 100, 50, 150, 2);
      // Start touches 25px from center, end 75px from center
      expect(events).toHaveLength(2 + 4 + 2);
    });

    it('should support pinch in (zoom out)', () => {
      const events = touch.pinch(100, 100, 150, 50, 2);
      // Start touches 75px from center, end 25px from center
      expect(events).toHaveLength(2 + 4 + 2);
    });
  });

  describe('reset()', () => {
    it('should clear all active touches', () => {
      touch.touchStart(100, 100);
      touch.touchStart(200, 200);
      touch.reset();
      expect(touch.getActiveTouches()).toHaveLength(0);
    });

    it('should reset touch ID counter', () => {
      touch.touchStart(100, 100);
      touch.reset();
      const { id } = touch.touchStart(50, 50);
      expect(id).toBe(0);
    });

    it('should clear modifiers', () => {
      touch.setModifiers(new Set(['Shift', 'Control']));
      touch.reset();
      const { event } = touch.touchStart(100, 100);
      expect(event.modifiers).toBe(0);
    });
  });

  describe('setModifiers()', () => {
    it('should set modifiers for events', () => {
      touch.setModifiers(new Set(['Shift']));
      const { event } = touch.touchStart(100, 100);
      // Shift = 8
      expect(event.modifiers).toBe(8);
    });

    it('should combine multiple modifiers', () => {
      touch.setModifiers(new Set(['Shift', 'Control']));
      const { event } = touch.touchStart(100, 100);
      // Shift = 8, Control = 2
      expect(event.modifiers).toBe(10);
    });

    it('should support all modifier types', () => {
      touch.setModifiers(new Set(['Alt', 'Control', 'Meta', 'Shift']));
      const { event } = touch.touchStart(100, 100);
      // Alt = 1, Control = 2, Meta = 4, Shift = 8
      expect(event.modifiers).toBe(15);
    });

    it('should update modifiers', () => {
      touch.setModifiers(new Set(['Shift']));
      touch.setModifiers(new Set(['Control']));
      const { event } = touch.touchStart(100, 100);
      expect(event.modifiers).toBe(2);
    });

    it('should apply modifiers to all event types', () => {
      touch.setModifiers(new Set(['Alt']));
      const { id, event: startEvent } = touch.touchStart(100, 100);
      const moveEvent = touch.touchMove(id, 150, 150);
      const endEvent = touch.touchEnd(id);

      expect(startEvent.modifiers).toBe(1);
      expect(moveEvent.modifiers).toBe(1);
      expect(endEvent.modifiers).toBe(1);
    });
  });

  describe('multi-touch scenarios', () => {
    it('should track two simultaneous touches', () => {
      const { id: id1 } = touch.touchStart(100, 100);
      const { id: id2 } = touch.touchStart(200, 200);

      expect(touch.getActiveTouchCount()).toBe(2);

      const touches = touch.getActiveTouches();
      expect(touches.some(t => t.x === 100 && t.y === 100)).toBe(true);
      expect(touches.some(t => t.x === 200 && t.y === 200)).toBe(true);

      touch.touchEnd(id1);
      expect(touch.getActiveTouchCount()).toBe(1);

      touch.touchEnd(id2);
      expect(touch.getActiveTouchCount()).toBe(0);
    });

    it('should correctly track which touch is moved', () => {
      const { id: id1 } = touch.touchStart(100, 100);
      const { id: id2 } = touch.touchStart(200, 200);

      touch.touchMove(id2, 250, 250);

      const touches = touch.getActiveTouches();
      const touch1 = touches.find(t => t.id === id1);
      const touch2 = touches.find(t => t.id === id2);

      expect(touch1?.x).toBe(100);
      expect(touch1?.y).toBe(100);
      expect(touch2?.x).toBe(250);
      expect(touch2?.y).toBe(250);
    });

    it('should maintain touches array during multi-touch', () => {
      const { id: id1, event: start1 } = touch.touchStart(100, 100);
      expect(start1.touches).toHaveLength(1);

      const { event: start2 } = touch.touchStart(200, 200);
      expect(start2.touches).toHaveLength(2);

      const move1 = touch.touchMove(id1, 150, 150);
      expect(move1.touches).toHaveLength(2);
      expect(move1.changedTouches).toHaveLength(1);
    });
  });

  describe('touch event data structure', () => {
    it('should have type property', () => {
      const { event } = touch.touchStart(100, 100);
      expect(event.type).toBeDefined();
      expect(typeof event.type).toBe('string');
    });

    it('should have touches array', () => {
      const { event } = touch.touchStart(100, 100);
      expect(Array.isArray(event.touches)).toBe(true);
    });

    it('should have targetTouches array', () => {
      const { event } = touch.touchStart(100, 100);
      expect(Array.isArray(event.targetTouches)).toBe(true);
    });

    it('should have changedTouches array', () => {
      const { event } = touch.touchStart(100, 100);
      expect(Array.isArray(event.changedTouches)).toBe(true);
    });

    it('should have modifiers property', () => {
      const { event } = touch.touchStart(100, 100);
      expect(event.modifiers).toBeDefined();
      expect(typeof event.modifiers).toBe('number');
    });

    it('touch points should have required properties', () => {
      const { event } = touch.touchStart(100, 200);
      const touchPoint = event.changedTouches[0];
      expect(touchPoint.x).toBe(100);
      expect(touchPoint.y).toBe(200);
      expect(typeof touchPoint.id).toBe('number');
    });
  });
});
