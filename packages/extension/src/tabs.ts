/**
 * Tab group manager for organizing managed tabs.
 */

import type { Browser } from "wxt/browser";

const GROUP_NAME = "Browser MCP";
const GROUP_COLOR = "blue";

export class TabManager {
  private groupId: number | null = null;
  private managedTabs = new Set<number>();

  async ensureGroup(tabId: number): Promise<void> {
    this.managedTabs.add(tabId);

    // Check if we already have a group
    if (this.groupId !== null) {
      try {
        await browser.tabs.group({ tabIds: tabId, groupId: this.groupId });
        return;
      } catch {
        // Group may have been deleted, create new one
        this.groupId = null;
      }
    }

    // Create new group
    const groupId = await browser.tabs.group({ tabIds: tabId });
    this.groupId = groupId;

    await browser.tabGroups.update(groupId, {
      title: GROUP_NAME,
      color: GROUP_COLOR,
      collapsed: false,
    });
  }

  async isManaged(tabId: number): Promise<boolean> {
    if (!this.managedTabs.has(tabId)) return false;

    try {
      await browser.tabs.get(tabId);
      return true;
    } catch {
      this.managedTabs.delete(tabId);
      return false;
    }
  }

  async listTabs(): Promise<Browser.tabs.Tab[]> {
    const tabs: Browser.tabs.Tab[] = [];

    for (const tabId of this.managedTabs) {
      try {
        const tab = await browser.tabs.get(tabId);
        tabs.push(tab);
      } catch {
        this.managedTabs.delete(tabId);
      }
    }

    return tabs;
  }

  async createTab(url?: string): Promise<Browser.tabs.Tab> {
    const tab = await browser.tabs.create({
      url: url || "about:blank",
      active: true,
    });

    if (tab.id) {
      await this.ensureGroup(tab.id);
    }

    return tab;
  }

  async closeTab(tabId: number): Promise<void> {
    this.managedTabs.delete(tabId);
    try {
      await browser.tabs.remove(tabId);
    } catch {
      // Tab may already be closed
    }
  }

  removeTab(tabId: number): void {
    this.managedTabs.delete(tabId);
  }

  clearGroup(groupId: number): void {
    if (this.groupId === groupId) {
      this.groupId = null;
    }
  }
}

export const tabs = new TabManager();
