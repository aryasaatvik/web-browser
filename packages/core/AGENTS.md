# packages/core

Shared browser automation logic. Works in browser contexts.

## OVERVIEW

Core library for browser automation: selector engines, DOM utilities, accessibility tree generation, input handling.

## STRUCTURE

```
src/
├── selectors/     # CSS, XPath, Text, Role, Layout selectors
├── dom/           # Visibility, shadow DOM, hit-testing, stability
├── a11y/          # ARIA tree, roles, names, hidden detection
└── input/         # Mouse, keyboard, touch event handling
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Selector engine | `src/selectors/engine.ts`, `evaluator.ts` |
| Accessibility tree | `src/a11y/tree.ts` |
| DOM visibility | `src/dom/visibility.ts` |
| Input handling | `src/input/mouse.ts`, `keyboard.ts` |
| Shadow DOM | `src/dom/shadow.ts` |

## KEY EXPORTS

```typescript
// Main
export * from './index'

// Selectors
export { SelectorEngineRegistry, type SelectorEngine } from './selectors/engine'
export { CssSelectorEngine, XpathSelectorEngine, TextSelectorEngine, RoleSelectorEngine } from './selectors/...'

// DOM
export { isElementVisible, isElementInteractable, getClickablePoint } from './dom/visibility'
export { deepQuery, deepElementFromPoint } from './dom/shadow'

// A11y
export { generateAriaTree } from './a11y/tree'
export { isElementHiddenForAria } from './a11y/hidden'

// Input
export { MouseState, KeyboardState } from './input/...'
```

## TESTING

- Uses `happy-dom` environment
- Tests co-located with `.test.ts` suffix
- Run: `bun test:watch` (from root: `turbo run test --filter=@web-browser/core`)
