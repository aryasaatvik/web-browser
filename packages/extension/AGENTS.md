# packages/extension

Chrome Extension (Manifest V3) built with WXT.

## OVERVIEW

Provides browser automation in Chrome via native messaging. Uses `chrome.debugger` API for CDP access.

## STRUCTURE

```
entrypoints/
├── background.ts           # Service worker, command dispatcher
├── content.ts              # Message relay (isolated world)
├── core-bridge.content.ts  # DOM access (MAIN world)
└── visual-indicator.content.ts  # Click highlights

src/
├── native.ts   # Native messaging client
├── cdp.ts      # CDP client wrapper
├── tabs.ts     # Tab manager
└── media.ts    # Recording coordination
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Command handling | `entrypoints/background.ts` |
| Native messaging | `src/native.ts` |
| CDP wrapper | `src/cdp.ts` |
| Content script bridge | `entrypoints/core-bridge.content.ts` |
| Extension manifest | `wxt.config.ts` |

## KEY COMPONENTS

| Component | Role |
|-----------|------|
| NativeClient | Communicates with bridge via `chrome.runtime.connectNative` |
| CdpClient | Wraps Chrome Debugger API |
| TabManager | Session-based tab grouping |
| CoreBridge | Exposes `@web-browser/core` to page |

## CONVENTIONS

- Uses WXT framework for extension build
- Content scripts run in both isolated and MAIN worlds
- Stable extension ID via public key in `manifest-key.txt`
