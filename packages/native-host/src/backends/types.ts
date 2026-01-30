/**
 * Backend interface types.
 */

export type BackendName = 'extension' | 'cdp';

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ConnectOptions {
  /**
   * WebSocket URL for CDP connection
   */
  url?: string;

  /**
   * Tab ID for extension backend
   */
  tabId?: number;
}

/**
 * Browser backend interface.
 * Both extension and CDP backends implement this interface.
 */
export interface BrowserBackend {
  /**
   * Backend name
   */
  readonly name: BackendName;

  /**
   * Connect to the browser
   */
  connect(options?: ConnectOptions): Promise<void>;

  /**
   * Disconnect from the browser
   */
  disconnect(): Promise<void>;

  /**
   * Check if connected
   */
  isConnected(): boolean;

  /**
   * Execute a tool
   */
  execute(tool: string, args: Record<string, unknown>): Promise<ToolResult>;
}
