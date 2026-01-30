/**
 * @web-browser/native-host
 *
 * MCP server and native messaging bridge for Web Browser MCP.
 */

// MCP Server
export { MCPServer } from './mcp/server.js';

// Backends
export { ExtensionBackend } from './backends/extension.js';
export { CdpBackend } from './backends/cdp.js';
export type { BrowserBackend, BackendName } from './backends/types.js';

// MCP Server and Bridge
export { runMcp } from './mcp.js';
export { runBridge } from './bridge.js';

// Native messaging protocol utilities
export {
  readNativeMessage,
  writeNativeMessage,
  createNativeMessageReader,
  createNativeMessageWriter,
  EndOfStreamError,
} from './native-messaging.js';
