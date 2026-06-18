// oxlint-disable react/only-export-components -- test helper, not a refresh boundary
import { type ReactElement, type ReactNode } from "react"
import { LayerProvider, PortalProvider, ThemeProvider } from "@sanity/ui"
import { buildTheme } from "@sanity/ui/theme"
import { render, type RenderOptions } from "@testing-library/react"

const theme = buildTheme()

/**
 * The minimum @sanity/ui context a component under test requires. Provides a
 * theme plus the layer and portal providers that `Dialog` requires to mount and
 * stack.
 */
const Providers = ({ children }: { children: ReactNode }) => (
  <ThemeProvider theme={theme}>
    <LayerProvider>
      <PortalProvider>{children}</PortalProvider>
    </LayerProvider>
  </ThemeProvider>
)

/** `@testing-library/react`'s render, wrapped in the Studio's UI providers. */
export const renderWithUi = (
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) => render(ui, { wrapper: Providers, ...options })
