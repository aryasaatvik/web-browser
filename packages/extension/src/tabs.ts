/**
 * Tab group manager for organizing managed tabs.
 */

import type { Browser } from "wxt/browser";

const GROUP_PREFIX = "Browser MCP";
const GROUP_COLOR = "blue";
const STORAGE_KEY = "browser_mcp_session_groups_v1";

type SessionId = string;

function shortSessionId(sessionId: string): string {
  return sessionId.length <= 8 ? sessionId : sessionId.slice(0, 8);
}

function groupTitle(sessionId: string): string {
  return `${GROUP_PREFIX} (${shortSessionId(sessionId)})`;
}

type PersistedSessionGroups = Record<SessionId, number>;

export class TabManager {
  private sessions = new Map<SessionId, { groupId: number | null; managedTabs: Set<number> }>();
  private tabToSession = new Map<number, SessionId>();
  private groupToSession = new Map<number, SessionId>();

  // Lazy init so importing this module doesn't touch storage during tests/prepare.
  private initPromise: Promise<void> | null = null;

  private async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      // Storage is optional in some test environments.
      const storage = (browser as any).storage?.local as undefined | { get: (k: string) => Promise<any> };
      const persisted: PersistedSessionGroups = storage ? ((await storage.get(STORAGE_KEY))?.[STORAGE_KEY] || {}) : {};

      for (const [sessionId, groupId] of Object.entries(persisted)) {
        try {
          // Verify group still exists.
          await browser.tabGroups.get(groupId);
          this.sessions.set(sessionId, { groupId, managedTabs: new Set() });
          this.groupToSession.set(groupId, sessionId);

          // Rebuild managed tabs from the group membership.
          const groupedTabs = await browser.tabs.query({ groupId });
          for (const t of groupedTabs) {
            if (typeof t.id === "number") {
              this.sessions.get(sessionId)!.managedTabs.add(t.id);
              this.tabToSession.set(t.id, sessionId);
            }
          }
        } catch {
          // Drop missing group.
        }
      }
    })();
    return this.initPromise;
  }

  private async persist(): Promise<void> {
    const storage = (browser as any).storage?.local as undefined | { set: (v: any) => Promise<void> };
    if (!storage) return;

    const out: PersistedSessionGroups = {};
    for (const [sessionId, state] of this.sessions.entries()) {
      if (typeof state.groupId === "number") {
        out[sessionId] = state.groupId;
      }
    }
    await storage.set({ [STORAGE_KEY]: out });
  }

  private ensureSession(sessionId: SessionId): { groupId: number | null; managedTabs: Set<number> } {
    let s = this.sessions.get(sessionId);
    if (!s) {
      s = { groupId: null, managedTabs: new Set<number>() };
      this.sessions.set(sessionId, s);
    }
    return s;
  }

  async ensureGroup(sessionId: SessionId, tabId: number): Promise<void> {
    await this.init();
    const session = this.ensureSession(sessionId);
    session.managedTabs.add(tabId);
    this.tabToSession.set(tabId, sessionId);

    // Check if we already have a group
    if (session.groupId !== null) {
      try {
        await browser.tabs.group({ tabIds: tabId, groupId: session.groupId });
        return;
      } catch {
        // Group may have been deleted, create new one
        if (session.groupId !== null) this.groupToSession.delete(session.groupId);
        session.groupId = null;
      }
    }

    // Create new group
    const groupId = await browser.tabs.group({ tabIds: tabId });
    session.groupId = groupId;
    this.groupToSession.set(groupId, sessionId);
    await this.persist().catch(() => {});

    await browser.tabGroups.update(groupId, {
      title: groupTitle(sessionId),
      color: GROUP_COLOR,
      collapsed: false,
    });
  }

  async isManaged(sessionId: SessionId, tabId: number): Promise<boolean> {
    await this.init();
    const session = this.sessions.get(sessionId);
    if (!session?.managedTabs.has(tabId)) return false;

    try {
      await browser.tabs.get(tabId);
      return true;
    } catch {
      session.managedTabs.delete(tabId);
      this.tabToSession.delete(tabId);
      return false;
    }
  }

  async listTabs(sessionId: SessionId): Promise<Browser.tabs.Tab[]> {
    await this.init();
    const tabs: Browser.tabs.Tab[] = [];
    const session = this.ensureSession(sessionId);

    for (const tabId of session.managedTabs) {
      try {
        const tab = await browser.tabs.get(tabId);
        tabs.push(tab);
      } catch {
        session.managedTabs.delete(tabId);
        this.tabToSession.delete(tabId);
      }
    }

    return tabs;
  }

  async createTab(sessionId: SessionId, url?: string): Promise<Browser.tabs.Tab> {
    await this.init();
    const tab = await browser.tabs.create({
      url: url || "about:blank",
      active: true,
    });

    if (tab.id) {
      await this.ensureGroup(sessionId, tab.id);
    }

    return tab;
  }

  async closeTab(sessionId: SessionId, tabId: number): Promise<void> {
    await this.init();
    const session = this.sessions.get(sessionId);
    session?.managedTabs.delete(tabId);
    this.tabToSession.delete(tabId);
    try {
      await browser.tabs.remove(tabId);
    } catch {
      // Tab may already be closed
    }
  }

  removeTab(tabId: number): void {
    const sessionId = this.tabToSession.get(tabId);
    if (!sessionId) return;
    const session = this.sessions.get(sessionId);
    session?.managedTabs.delete(tabId);
    this.tabToSession.delete(tabId);
  }

  clearGroup(groupId: number): void {
    const sessionId = this.groupToSession.get(groupId);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (session) session.groupId = null;
    this.groupToSession.delete(groupId);
    // Leave managedTabs; tabs may still exist but are no longer grouped.
    void this.persist().catch(() => {});
  }
}

export const tabs = new TabManager();
