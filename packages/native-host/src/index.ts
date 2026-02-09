/**
 * web-browser
 *
 * MCP server and native messaging bridge for Web Browser.
 */

// Backends
export { ExtensionBackend } from './backends/extension.js';
export { CdpBackend } from './backends/cdp.js';
export type { BrowserBackend, BackendName } from './backends/types.js';

// MCP Daemon and Bridge
export { runDaemon, BridgeBackend } from './daemon.js';
export { runBridge } from './bridge.js';
export { installNative, uninstallNative, OFFICIAL_EXTENSION_ID } from './installer.js';

// Native messaging protocol utilities
export {
  readNativeMessage,
  writeNativeMessage,
  createNativeMessageReader,
  createNativeMessageWriter,
  EndOfStreamError,
} from './native-messaging.js';
