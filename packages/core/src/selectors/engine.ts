/**
 * Root types that selector engines can query against.
 */
export type SelectorRoot = Element | Document | ShadowRoot;

/**
 * Selector engine interface.
 * Each selector engine can query elements using its specific selector syntax.
 */
export interface SelectorEngine {
  /**
   * Engine name for selector syntax (e.g., 'css', 'xpath', 'role', 'text')
   */
  readonly name: string;

  /**
   * Query a single element matching the selector
   */
  query(root: SelectorRoot, selector: string): Element | null;

  /**
   * Query all elements matching the selector
   */
  queryAll(root: SelectorRoot, selector: string): Element[];
}

/**
 * Selector engine registry
 */
export class SelectorEngineRegistry {
  private engines = new Map<string, SelectorEngine>();

  register(engine: SelectorEngine): void {
    this.engines.set(engine.name, engine);
  }

  get(name: string): SelectorEngine | undefined {
    return this.engines.get(name);
  }

  has(name: string): boolean {
    return this.engines.has(name);
  }

  names(): string[] {
    return [...this.engines.keys()];
  }
}

/**
 * Parse a selector string into engine name and selector body.
 * Supports syntax like: "css=.class", "text=Hello", "role=button", "internal:has=button"
 * If no engine prefix, defaults to CSS.
 */
export function parseSelector(selector: string): { engine: string; body: string } {
  // Support engine names with colons (e.g., internal:has, internal:has-text)
  const match = selector.match(/^([a-zA-Z_][a-zA-Z0-9_:-]*)=(.+)$/s);
  if (match) {
    return { engine: match[1].toLowerCase(), body: match[2] };
  }
  return { engine: 'css', body: selector };
}

/**
 * Global selector engine registry
 */
export const selectorEngines = new SelectorEngineRegistry();
