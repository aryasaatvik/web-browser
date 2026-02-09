/**
 * Tests for TabManager - tab group management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TabManager } from './tabs.js';

const S1 = 's1';

describe('TabManager', () => {
  let manager: TabManager;

  beforeEach(() => {
    manager = new TabManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ensureGroup', () => {
    it('should create group for first tab', async () => {
      await manager.ensureGroup(S1, 1);

      expect(browser.tabs.group).toHaveBeenCalledWith({ tabIds: 1 });
      const groupId = await (browser.tabs.group as ReturnType<typeof vi.fn>).mock.results[0].value;
      expect(browser.tabGroups.update).toHaveBeenCalledWith(groupId, {
        title: 'Browser MCP (s1)',
        color: 'blue',
        collapsed: false,
      });
    });

    it('should reuse existing group', async () => {
      await manager.ensureGroup(S1, 1);
      const groupId = await (browser.tabs.group as ReturnType<typeof vi.fn>).mock.results[0].value;
      await manager.ensureGroup(S1, 2);

      // Second call should add to existing group
      expect(browser.tabs.group).toHaveBeenCalledTimes(2);
      expect(browser.tabs.group).toHaveBeenLastCalledWith({ tabIds: 2, groupId });

      // tabGroups.update should only be called once for group creation
      expect(browser.tabGroups.update).toHaveBeenCalledTimes(1);
    });

    it('should create new group after clearing', async () => {
      await manager.ensureGroup(S1, 1);
      const groupId1 = await (browser.tabs.group as ReturnType<typeof vi.fn>).mock.results[0].value;

      // Clear the group (simulating deletion)
      manager.clearGroup(groupId1);

      await manager.ensureGroup(S1, 2);

      // Should have created a new group
      expect(browser.tabGroups.update).toHaveBeenCalledTimes(2);
    });

    it('should track managed tabs', async () => {
      // Create tabs that will exist
      const tab1 = globalThis.mockBrowser.tabs._createTab({ id: 1 });
      const tab2 = globalThis.mockBrowser.tabs._createTab({ id: 2 });

      await manager.ensureGroup(S1, tab1.id!);
      await manager.ensureGroup(S1, tab2.id!);

      expect(await manager.isManaged(S1, 1)).toBe(true);
      expect(await manager.isManaged(S1, 2)).toBe(true);
      expect(await manager.isManaged(S1, 3)).toBe(false);
    });
  });

  describe('isManaged', () => {
    it('should return false for unmanaged tab', async () => {
      expect(await manager.isManaged(S1, 123)).toBe(false);
    });

    it('should return true for managed tab', async () => {
      // Create the tab first so it exists
      globalThis.mockBrowser.tabs._createTab({ id: 123 });

      await manager.ensureGroup(S1, 123);

      expect(await manager.isManaged(S1, 123)).toBe(true);
    });

    it('should return false and clean up if tab no longer exists', async () => {
      await manager.ensureGroup(S1, 123);

      // Simulate tab being closed
      browser.tabs.get = vi.fn().mockRejectedValue(new Error('Tab not found'));

      expect(await manager.isManaged(S1, 123)).toBe(false);
    });
  });

  describe('listTabs', () => {
    it('should return empty array when no tabs', async () => {
      const tabs = await manager.listTabs(S1);
      expect(tabs).toEqual([]);
    });

    it('should return managed tabs', async () => {
      // Create tabs
      const tab1 = await browser.tabs.create({ url: 'https://example1.com' });
      const tab2 = await browser.tabs.create({ url: 'https://example2.com' });

      await manager.ensureGroup(S1, tab1.id!);
      await manager.ensureGroup(S1, tab2.id!);

      const tabs = await manager.listTabs(S1);

      expect(tabs.length).toBe(2);
    });

    it('should filter out closed tabs', async () => {
      const tab1 = await browser.tabs.create({ url: 'https://example1.com' });
      const tab2 = await browser.tabs.create({ url: 'https://example2.com' });

      await manager.ensureGroup(S1, tab1.id!);
      await manager.ensureGroup(S1, tab2.id!);

      // Close one tab
      globalThis.mockBrowser.tabs._removeTab(tab1.id!);

      const tabs = await manager.listTabs(S1);

      expect(tabs.length).toBe(1);
      expect(tabs[0].id).toBe(tab2.id);
    });
  });

  describe('createTab', () => {
    it('should create new tab', async () => {
      const tab = await manager.createTab(S1);

      expect(browser.tabs.create).toHaveBeenCalledWith({
        url: 'about:blank',
        active: true,
      });
      expect(tab.id).toBeDefined();
    });

    it('should create tab with URL', async () => {
      await manager.createTab(S1, 'https://example.com');

      expect(browser.tabs.create).toHaveBeenCalledWith({
        url: 'https://example.com',
        active: true,
      });
    });

    it('should add new tab to group', async () => {
      const tab = await manager.createTab(S1);

      expect(browser.tabs.group).toHaveBeenCalled();
      expect(await manager.isManaged(S1, tab.id!)).toBe(true);
    });
  });

  describe('closeTab', () => {
    it('should close tab', async () => {
      const tab = await manager.createTab(S1);
      await manager.closeTab(S1, tab.id!);

      expect(browser.tabs.remove).toHaveBeenCalledWith(tab.id);
      expect(await manager.isManaged(S1, tab.id!)).toBe(false);
    });

    it('should handle already closed tab', async () => {
      browser.tabs.remove = vi.fn().mockRejectedValue(new Error('Tab already closed'));

      const tab = await manager.createTab(S1);
      await expect(manager.closeTab(S1, tab.id!)).resolves.toBeUndefined();
    });
  });

  describe('removeTab', () => {
    it('should remove tab from tracking without closing', async () => {
      const tab = await manager.createTab(S1);
      manager.removeTab(tab.id!);

      expect(browser.tabs.remove).not.toHaveBeenCalled();
      expect(await manager.isManaged(S1, tab.id!)).toBe(false);
    });
  });

  describe('clearGroup', () => {
    it('should clear group reference', async () => {
      await manager.ensureGroup(S1, 1);
      const groupId = await (browser.tabs.group as ReturnType<typeof vi.fn>).mock.results[0].value;
      manager.clearGroup(groupId);

      // Next ensureGroup should create a new group
      await manager.ensureGroup(S1, 2);

      expect(browser.tabGroups.update).toHaveBeenCalledTimes(2);
    });

    it('should not clear if group ID does not match', async () => {
      await manager.ensureGroup(S1, 1);
      const groupId = await (browser.tabs.group as ReturnType<typeof vi.fn>).mock.results[0].value;

      manager.clearGroup(99);

      // Next ensureGroup should reuse existing group
      await manager.ensureGroup(S1, 2);

      expect(browser.tabs.group).toHaveBeenLastCalledWith({ tabIds: 2, groupId });
    });
  });
});

describe('TabManager group naming', () => {
  it('should use correct group name and color', async () => {
    const manager = new TabManager();
    await manager.ensureGroup(S1, 123);
    const groupId = await (browser.tabs.group as ReturnType<typeof vi.fn>).mock.results[0].value;

    expect(browser.tabGroups.update).toHaveBeenCalledWith(groupId, {
      title: 'Browser MCP (s1)',
      color: 'blue',
      collapsed: false,
    });
  });
});

describe('TabManager lifecycle', () => {
  let manager: TabManager;

  beforeEach(() => {
    manager = new TabManager();
  });

  it('should handle full tab lifecycle', async () => {
    // Create tab
    const tab = await manager.createTab(S1, 'https://example.com');
    expect(await manager.isManaged(S1, tab.id!)).toBe(true);

    // List should include it
    let tabs = await manager.listTabs(S1);
    expect(tabs.length).toBe(1);

    // Close tab
    await manager.closeTab(S1, tab.id!);
    expect(await manager.isManaged(S1, tab.id!)).toBe(false);

    // List should be empty
    tabs = await manager.listTabs(S1);
    expect(tabs.length).toBe(0);
  });

  it('should handle multiple tabs', async () => {
    const tab1 = await manager.createTab(S1, 'https://example1.com');
    const tab2 = await manager.createTab(S1, 'https://example2.com');
    const tab3 = await manager.createTab(S1, 'https://example3.com');

    let tabs = await manager.listTabs(S1);
    expect(tabs.length).toBe(3);

    // Close middle tab
    await manager.closeTab(S1, tab2.id!);

    tabs = await manager.listTabs(S1);
    expect(tabs.length).toBe(2);
    expect(tabs.map((t) => t.id)).not.toContain(tab2.id);
  });
});
