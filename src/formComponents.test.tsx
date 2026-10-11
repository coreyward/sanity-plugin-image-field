import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { type InputProps } from "sanity"
import { imageFieldFormInput } from "./formComponents"
import { renderWithUi } from "./test/render"

vi.mock("sanity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sanity")>()
  return {
    ...actual,
    useClient: () => ({
      config: () => ({ projectId: "proj", dataset: "dataset" }),
      observable: {
        assets: {
          upload: () => ({
            subscribe: () => ({ unsubscribe: () => {} }),
          }),
        },
      },
    }),
    useWorkspace: () => ({ form: { image: { assetSources: [] } } }),
  }
})

const baseProps = (overrides: {
  schemaType: { name: string; type?: unknown; options?: unknown }
  renderDefault?: (props: InputProps) => React.ReactNode
}): InputProps =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  ({
    value: undefined,
    onChange: () => {},
    path: ["hero"],
    members: [],
    readOnly: false,
    renderDefault: () => null,
    ...overrides,
  }) as unknown as InputProps

describe("imageFieldFormInput", () => {
  it("renders ImageFieldInput when the schema type is image", () => {
    renderWithUi(
      imageFieldFormInput(
        baseProps({ schemaType: { name: "image", options: {} } })
      )
    )

    expect(screen.getByLabelText("Upload image")).toBeInTheDocument()
  })

  it("renders ImageFieldInput when the chain reaches image through type", () => {
    renderWithUi(
      imageFieldFormInput(
        baseProps({
          schemaType: { name: "customImage", type: { name: "image" } },
        })
      )
    )

    expect(screen.getByLabelText("Upload image")).toBeInTheDocument()
  })

  it("renders ImageFieldInput when image is two levels deep in the chain", () => {
    renderWithUi(
      imageFieldFormInput(
        baseProps({
          schemaType: {
            name: "heroImage",
            type: { name: "customImage", type: { name: "image" } },
          },
        })
      )
    )

    expect(screen.getByLabelText("Upload image")).toBeInTheDocument()
  })

  it("calls renderDefault when the chain never reaches image", () => {
    const renderDefault = vi.fn<(props: InputProps) => React.ReactNode>(() => (
      <div>default input</div>
    ))
    const props = baseProps({
      schemaType: { name: "string", type: { name: "text" } },
      renderDefault,
    })

    renderWithUi(imageFieldFormInput(props))

    expect(renderDefault).toHaveBeenCalledTimes(1)
    expect(renderDefault).toHaveBeenCalledWith(props)
    expect(screen.getByText("default input")).toBeInTheDocument()
    expect(screen.queryByLabelText("Upload image")).toBeNull()
  })
})
