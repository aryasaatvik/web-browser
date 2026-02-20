# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-20
**Commit:** 937e937

## OVERVIEW

MCP (Model Context Protocol) server for browser automation via Chrome extension. Enables AI agents to control web browsers programmatically through Chrome extension + native messaging, or direct CDP connection.

**Core Stack:** TypeScript, Bun, Turbo, Vitest, MCP SDK

## STRUCTURE

```
.
├── packages/
│   ├── core/           # Shared browser automation logic (selectors, DOM, a11y, input)
│   ├── extension/      # Chrome extension (Manifest V3, WXT)
│   └── native-host/    # MCP server + native messaging bridge
├── apps/web/           # React dashboard (excluded)
├── scripts/            # Build/release scripts
└── docs/               # Documentation
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Browser automation logic | `packages/core/src/` | Selectors, DOM utils, a11y tree, input handling |
| MCP server | `packages/native-host/src/` | Daemon, bridge, tools, backends |
| Chrome extension | `packages/extension/` | Background, content scripts, WXT config |
| Run tests | `bun test` | Vitest with happy-dom for DOM tests |
| Build | `bun run build` | Turbo build |
| Typecheck | `bun run typecheck` | Uses root tsconfig project references |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `runDaemon` | function | `native-host/src/daemon.ts` | Start MCP HTTP server |
| `BrowserBackend` | interface | `native-host/src/backends/types.ts` | Backend abstraction |
| `SelectorEngine` | interface | `core/src/selectors/engine.ts` | Selector abstraction |
| `generateAriaTree` | function | `core/src/a11y/tree.ts` | A11y tree generation |

## CONVENTIONS

- **Use Bun** instead of Node.js/npm/yarn/pnpm for all commands
- **Use Vitest** for testing: `bun test`, `bun test:watch`, `bun test:coverage`
- **Tests co-located** with source using `.test.ts` suffix
- **Workspace packages**: Each in `packages/*` has own `package.json`
- **TypeScript strict mode** enabled globally

## ANTI-PATTERNS (THIS PROJECT)

- Deprecated WebKit `createTouch` API fallback in `core/src/dom/hitTarget.ts:399-430`
- Multiple hardcoded magic numbers (timeouts like 50ms, 200ms, 900ms scattered)
- Browser-specific workarounds (WebKit, Chrome-specific MediaDevices API)

## COMMANDS

```bash
# Install dependencies
bun install

# Dev
bun run dev
bun run dev:extension  # Chrome extension only

# Test
bun test
bun test:watch

# Build
bun run build

# Typecheck
bun run typecheck

# Install native messaging host
bun run install:native

# Release
bun run release
```

## AGENTS.md LOCATIONS

| Directory | Purpose |
|-----------|---------|
| `packages/core` | Browser automation core (selectors, DOM, a11y, input) |
| `packages/extension` | Chrome extension (WXT, Manifest V3) |
| `packages/native-host` | MCP server, bridge, tools, backends |
