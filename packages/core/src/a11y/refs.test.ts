/**
 * Tests for element reference system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getElementRef,
  getElementByRef,
  isValidRef,
  clearElementRefs,
  getRefCount,
  createElementRefs,
  resolveElementRefs,
} from './refs.js';

describe('Element Refs', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    clearElementRefs();
  });

  afterEach(() => {
    container.remove();
    clearElementRefs();
  });

  describe('getElementRef', () => {
    it('should create a reference for an element', () => {
      const element = document.createElement('button');
      container.appendChild(element);

      const ref = getElementRef(element);
      expect(ref).toMatch(/^ref_\d+$/);
    });

    it('should return the same reference for the same element', () => {
      const element = document.createElement('button');
      container.appendChild(element);

      const ref1 = getElementRef(element);
      const ref2 = getElementRef(element);
      expect(ref1).toBe(ref2);
    });

    it('should create different references for different elements', () => {
      const element1 = document.createElement('button');
      const element2 = document.createElement('button');
      container.appendChild(element1);
      container.appendChild(element2);

      const ref1 = getElementRef(element1);
      const ref2 = getElementRef(element2);
      expect(ref1).not.toBe(ref2);
    });
  });

  describe('getElementByRef', () => {
    it('should return the element for a valid reference', () => {
      const element = document.createElement('button');
      container.appendChild(element);

      const ref = getElementRef(element);
      const retrieved = getElementByRef(ref);
      expect(retrieved).toBe(element);
    });

    it('should return null for an invalid reference', () => {
      const retrieved = getElementByRef('ref_99999');
      expect(retrieved).toBeNull();
    });

    it('should return null for a disconnected element', () => {
      const element = document.createElement('button');
      container.appendChild(element);

      const ref = getElementRef(element);
      element.remove();

      const retrieved = getElementByRef(ref);
      expect(retrieved).toBeNull();
    });
  });

  describe('isValidRef', () => {
    it('should return true for a valid reference', () => {
      const element = document.createElement('button');
      container.appendChild(element);

      const ref = getElementRef(element);
      expect(isValidRef(ref)).toBe(true);
    });

    it('should return false for an invalid reference', () => {
      expect(isValidRef('ref_99999')).toBe(false);
    });
  });

  describe('getRefCount', () => {
    it('should return 0 when no references exist', () => {
      expect(getRefCount()).toBe(0);
    });

    it('should return correct count after creating references', () => {
      const element1 = document.createElement('button');
      const element2 = document.createElement('button');
      container.appendChild(element1);
      container.appendChild(element2);

      getElementRef(element1);
      getElementRef(element2);

      expect(getRefCount()).toBe(2);
    });
  });

  describe('createElementRefs', () => {
    it('should create references for multiple elements', () => {
      const elements = [
        document.createElement('button'),
        document.createElement('input'),
        document.createElement('div'),
      ];
      elements.forEach((el) => container.appendChild(el));

      const refs = createElementRefs(elements);
      expect(refs).toHaveLength(3);
      refs.forEach((ref) => expect(ref).toMatch(/^ref_\d+$/));
    });
  });

  describe('resolveElementRefs', () => {
    it('should resolve multiple references', () => {
      const elements = [
        document.createElement('button'),
        document.createElement('input'),
      ];
      elements.forEach((el) => container.appendChild(el));

      const refs = createElementRefs(elements);
      const resolved = resolveElementRefs(refs);

      expect(resolved).toHaveLength(2);
      expect(resolved[0]).toBe(elements[0]);
      expect(resolved[1]).toBe(elements[1]);
    });

    it('should return null for invalid references in batch', () => {
      const element = document.createElement('button');
      container.appendChild(element);

      const ref = getElementRef(element);
      const resolved = resolveElementRefs([ref, 'ref_99999']);

      expect(resolved[0]).toBe(element);
      expect(resolved[1]).toBeNull();
    });
  });

  describe('clearElementRefs', () => {
    it('should clear all references', () => {
      const element = document.createElement('button');
      container.appendChild(element);

      getElementRef(element);
      expect(getRefCount()).toBe(1);

      clearElementRefs();
      expect(getRefCount()).toBe(0);
    });
  });
});
