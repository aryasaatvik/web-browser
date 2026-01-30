/**
 * CDP (Chrome DevTools Protocol) client using chrome.debugger API.
 */

type Debuggee = { tabId: number };

export class CdpClient {
  private attached = new Set<number>();

  async attach(tabId: number): Promise<void> {
    if (this.attached.has(tabId)) return;

    await browser.debugger.attach({ tabId }, "1.3");
    this.attached.add(tabId);
  }

  async detach(tabId: number): Promise<void> {
    if (!this.attached.has(tabId)) return;

    try {
      await browser.debugger.detach({ tabId });
    } catch {
      // Ignore detach errors
    }
    this.attached.delete(tabId);
  }

  isAttached(tabId: number): boolean {
    return this.attached.has(tabId);
  }

  async sendCommand<T = unknown>(
    tabId: number,
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (!this.attached.has(tabId)) {
      await this.attach(tabId);
    }

    return browser.debugger.sendCommand({ tabId }, method, params) as Promise<T>;
  }
}

export const cdp = new CdpClient();
