/**
 * Test helpers for native-host package.
 */

export {
  createMockReadable,
  createMockWritable,
  createNativeMessageBuffer,
  parseNativeMessageBuffer,
} from './mock-stream.js';

export {
  createMockSocket,
  createMockServer,
} from './mock-socket.js';

export {
  setupMockTimers,
  nextTick,
  flushPromises,
  calculateBackoffDelays,
} from './mock-timers.js';
