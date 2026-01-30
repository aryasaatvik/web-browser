/**
 * Element stability detection.
 * Checks if an element's position and size are stable across animation frames.
 * Based on Playwright's stability checking implementation.
 */

export interface StabilityOptions {
  /** Number of RAF frames to check stability across. Default: 2 */
  frameCount?: number;
  /** Timeout in milliseconds. Default: 5000 */
  timeout?: number;
}

export interface StabilityResult {
  stable: boolean;
  reason?: 'disconnected' | 'moving' | 'resizing' | 'timeout';
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function getRect(element: Element): Rect {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.top,
    y: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Check if element position/size is stable across animation frames.
 * Uses requestAnimationFrame to compare bounding rects.
 *
 * @param element The element to check stability for
 * @param options Stability check options
 * @returns Promise resolving to stability result
 */
export async function checkElementStability(
  element: Element,
  options?: StabilityOptions
): Promise<StabilityResult> {
  const frameCount = options?.frameCount ?? 2;
  const timeout = options?.timeout ?? 5000;

  // Check if element is connected
  if (!element.isConnected) {
    return { stable: false, reason: 'disconnected' };
  }

  const startTime = performance.now();
  const continuePolling = Symbol('continuePolling');

  let lastRect: Rect | undefined;
  let stableFrameCount = 0;
  let lastTime = 0;

  const check = (): typeof continuePolling | StabilityResult => {
    // Check if element is still connected
    if (!element.isConnected) {
      return { stable: false, reason: 'disconnected' };
    }

    // Check timeout
    if (performance.now() - startTime > timeout) {
      return { stable: false, reason: 'timeout' };
    }

    // WebKit workaround: ignore frames shorter than 16ms
    const time = performance.now();
    if (frameCount > 1 && time - lastTime < 15) {
      return continuePolling;
    }
    lastTime = time;

    const currentRect = getRect(element);

    if (lastRect) {
      if (!rectsEqual(currentRect, lastRect)) {
        // Position or size changed - determine the reason
        if (currentRect.width !== lastRect.width || currentRect.height !== lastRect.height) {
          // Keep checking, element is still moving
          lastRect = currentRect;
          stableFrameCount = 0;
          return continuePolling;
        }
        if (currentRect.x !== lastRect.x || currentRect.y !== lastRect.y) {
          // Keep checking, element is still moving
          lastRect = currentRect;
          stableFrameCount = 0;
          return continuePolling;
        }
      }

      stableFrameCount++;
      if (stableFrameCount >= frameCount) {
        return { stable: true };
      }
    }

    lastRect = currentRect;
    return continuePolling;
  };

  return new Promise<StabilityResult>((resolve, reject) => {
    const raf = () => {
      try {
        const result = check();
        if (result !== continuePolling) {
          resolve(result);
        } else {
          requestAnimationFrame(raf);
        }
      } catch (e) {
        reject(e);
      }
    };
    requestAnimationFrame(raf);
  });
}

/**
 * Wait for element to become stable or timeout.
 * This is an alias for checkElementStability for API consistency.
 *
 * @param element The element to wait for stability
 * @param options Stability check options
 * @returns Promise resolving to stability result
 */
export async function waitForElementStable(
  element: Element,
  options?: StabilityOptions
): Promise<StabilityResult> {
  return checkElementStability(element, options);
}

/**
 * Check if an element is currently stable (synchronous snapshot check).
 * This only checks the current state and cannot detect movement.
 * For true stability detection, use checkElementStability.
 *
 * @param element The element to check
 * @returns Whether the element is connected and has valid dimensions
 */
export function isElementStableSync(element: Element): boolean {
  if (!element.isConnected) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  // Element must have valid dimensions to be considered stable
  return rect.width > 0 && rect.height > 0;
}
