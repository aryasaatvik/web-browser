// DO NOT DELETE THIS FILE!!!
// This is a smoke test to confirm we're using a custom server entry.
import handler from "@tanstack/react-start/server-entry";

console.log("[server-entry]: using custom server entry in 'src/server.ts'");

export default {
  fetch(request: Request) {
    return handler.fetch(request);
  },
};

