import { vi } from "vitest"
import "@testing-library/jest-dom/vitest"

// jsdom defines neither ResizeObserver nor matchMedia, but @sanity/ui and
// CropArea's frame measurement use them at render time. No-op stubs are enough.
// The component tests check behavior that does not depend on real layout.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub)

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}))
