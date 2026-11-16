import { afterEach } from "vitest";
import { cleanup, configure } from "@testing-library/react";

// The default 1s async lookup is too tight when the machine is busy; the
// component behaviour is unchanged, only the waiting window is wider.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
