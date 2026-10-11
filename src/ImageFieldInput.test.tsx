import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, createEvent, fireEvent, screen } from "@testing-library/react"
import {
  type ImageSchemaType,
  type ImageValue,
  type ObjectInputProps,
} from "sanity"
import { ImageFieldInput } from "./ImageFieldInput"
import { renderWithUi } from "./test/render"

type UploadCall = { type: string; file: File; opts: { filename: string } }

// Hoisted so the module mock can share upload state with the tests.
const { uploadCalls, uploadState, workspaceState } = vi.hoisted(() => ({
  uploadCalls: [] as UploadCall[],
  uploadState: {
    nextAssetId: "image-a1b2c3d4e5f6-1200x800-jpg",
    fails: false,
  },
  workspaceState: { assetSources: [] as unknown[] },
}))

vi.mock("sanity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sanity")>()
  return {
    ...actual,
    useClient: () => ({
      config: () => ({ projectId: "proj", dataset: "dataset" }),
      observable: {
        assets: {
          upload: (type: string, file: File, opts: { filename: string }) => {
            uploadCalls.push({ type, file, opts })
            return {
              subscribe: (observer: {
                next: (event: unknown) => void
                error: (error: unknown) => void
              }) => {
                if (uploadState.fails) {
                  observer.error(new Error("upload failed"))
                } else {
                  observer.next({
                    type: "complete",
                    body: { document: { _id: uploadState.nextAssetId } },
                  })
                }
                return { unsubscribe: () => {} }
              },
            }
          },
        },
      },
    }),
    useWorkspace: () => ({
      form: { image: { assetSources: workspaceState.assetSources } },
    }),
  }
})

const baseProps = (
  overrides: Partial<
    Omit<ObjectInputProps<ImageValue, ImageSchemaType>, "schemaType">
  > & {
    schemaType?: { name: string; options?: ImageSchemaType["options"] }
  } = {}
): ObjectInputProps<ImageValue, ImageSchemaType> =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  ({
    value: undefined,
    onChange: () => {},
    path: ["hero"],
    members: [],
    readOnly: false,
    schemaType: { name: "image", options: {} },
    renderDefault: () => null,
    ...overrides,
  }) as unknown as ObjectInputProps<ImageValue, ImageSchemaType>

const pasteFiles = (target: Element, files: File[]) => {
  const event = createEvent.paste(target, { bubbles: true, cancelable: true })
  Object.defineProperty(event, "clipboardData", { value: { files } })
  fireEvent(target, event)
}

beforeEach(() => {
  uploadCalls.length = 0
  uploadState.nextAssetId = "image-a1b2c3d4e5f6-1200x800-jpg"
  uploadState.fails = false
  workspaceState.assetSources = []
})

describe("ImageFieldInput paste-to-upload", () => {
  it("uploads an image pasted onto the field", () => {
    renderWithUi(<ImageFieldInput {...baseProps()} />)

    const file = new File(["data"], "pic.png", { type: "image/png" })
    pasteFiles(screen.getByRole("button", { name: "Upload" }), [file])

    expect(uploadCalls).toHaveLength(1)
    expect(uploadCalls[0]).toEqual({
      type: "image",
      file,
      opts: { filename: "pic.png" },
    })
  })

  it("ignores a paste with no image file", () => {
    renderWithUi(<ImageFieldInput {...baseProps()} />)

    const file = new File(["data"], "notes.txt", { type: "text/plain" })
    pasteFiles(screen.getByRole("button", { name: "Upload" }), [file])

    expect(uploadCalls).toHaveLength(0)
  })

  it("ignores a pasted image whose type options.accept excludes", () => {
    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          schemaType: { name: "image", options: { accept: "image/png" } },
        })}
      />
    )

    const file = new File(["data"], "pic.gif", { type: "image/gif" })
    pasteFiles(screen.getByRole("button", { name: "Upload" }), [file])

    expect(uploadCalls).toHaveLength(0)
  })

  it("ignores a pasted image whose type allowedFormats excludes", () => {
    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          schemaType: {
            name: "image",
            options: { imageField: { allowedFormats: ["jpg", "png"] } },
          },
        })}
      />
    )

    const file = new File(["data"], "pic.gif", { type: "image/gif" })
    pasteFiles(screen.getByRole("button", { name: "Upload" }), [file])

    expect(uploadCalls).toHaveLength(0)
  })

  it("picks the accepted image when the clipboard also holds other files", () => {
    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          schemaType: { name: "image", options: { accept: "image/png" } },
        })}
      />
    )

    const notes = new File(["data"], "notes.txt", { type: "text/plain" })
    const png = new File(["data"], "pic.png", { type: "image/png" })
    pasteFiles(screen.getByRole("button", { name: "Upload" }), [notes, png])

    expect(uploadCalls).toHaveLength(1)
    expect(uploadCalls[0]?.file).toBe(png)
  })

  it("ignores paste while read-only", () => {
    renderWithUi(<ImageFieldInput {...baseProps({ readOnly: true })} />)

    const file = new File(["data"], "pic.png", { type: "image/png" })
    pasteFiles(screen.getByRole("button", { name: "Upload" }), [file])

    expect(uploadCalls).toHaveLength(0)
  })
})

describe("ImageFieldInput with an SVG asset", () => {
  const svgValue = {
    _type: "image",
    asset: { _type: "reference", _ref: "image-a1b2c3d4e5f6-svg" },
  } as ImageValue

  it("previews the SVG from the CDN instead of crashing", () => {
    const { container } = renderWithUi(
      <ImageFieldInput {...baseProps({ value: svgValue })} />
    )
    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "a1b2c3d4e5f6.svg"
    )
  })

  it("offers no crop affordance for a non-croppable SVG", () => {
    renderWithUi(<ImageFieldInput {...baseProps({ value: svgValue })} />)
    expect(screen.queryByRole("button", { name: "Edit crop" })).toBeNull()
  })

  it("previews a dimensioned SVG from the CDN with no transform params", () => {
    const dimensionedSvgValue = {
      _type: "image",
      asset: { _type: "reference", _ref: "image-a1b2c3d4e5f6-1200x800-svg" },
    } as ImageValue

    const { container } = renderWithUi(
      <ImageFieldInput {...baseProps({ value: dimensionedSvgValue })} />
    )
    const src = container.querySelector("img")?.getAttribute("src")
    expect(src).toBe(
      "https://cdn.sanity.io/images/proj/dataset/a1b2c3d4e5f6-1200x800.svg"
    )
  })

  it("offers no crop affordance for a dimensioned SVG", () => {
    const dimensionedSvgValue = {
      _type: "image",
      asset: { _type: "reference", _ref: "image-a1b2c3d4e5f6-1200x800-svg" },
    } as ImageValue

    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          value: dimensionedSvgValue,
          schemaType: {
            name: "image",
            options: { imageField: { aspectRatio: 1 } },
          },
        })}
      />
    )
    expect(screen.queryByRole("button", { name: "Edit crop" })).toBeNull()
  })
})

const pickFile = (
  file = new File(["data"], "pic.jpg", { type: "image/jpeg" })
) =>
  fireEvent.change(screen.getByLabelText("Upload image"), {
    target: { files: [file] },
  })

describe("ImageFieldInput deferred commit", () => {
  it("defers the commit until the crop is confirmed", () => {
    const onChange = vi.fn<(patches: unknown) => void>()
    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          onChange,
          schemaType: {
            name: "image",
            options: { imageField: { aspectRatio: 1 } },
          },
        })}
      />
    )

    pickFile()

    expect(onChange).not.toHaveBeenCalled()
    expect(
      screen.getByRole("button", { name: "Confirm crop" })
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Confirm crop" }))

    expect(onChange).toHaveBeenCalledTimes(1)
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const patches = onChange.mock.calls[0]?.[0] as {
      path?: unknown[]
      value?: unknown
    }[]
    const assetPatch = patches.find((patch) => patch.path?.[0] === "asset")
    expect(assetPatch?.value).toEqual({
      _type: "reference",
      _ref: "image-a1b2c3d4e5f6-1200x800-jpg",
    })
    expect(patches.some((patch) => patch.path?.[0] === "crop")).toBe(true)
  })

  it("discards a newly selected image when the crop is canceled", () => {
    const onChange = vi.fn<(patches: unknown) => void>()
    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          onChange,
          schemaType: {
            name: "image",
            options: { imageField: { aspectRatio: 1 } },
          },
        })}
      />
    )

    pickFile()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Confirm crop" })).toBeNull()
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument()
  })

  it("rejects a too-small image when there is no crop editor", () => {
    const onChange = vi.fn<(patches: unknown) => void>()
    uploadState.nextAssetId = "image-a1b2c3d4e5f6-100x100-jpg"
    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          onChange,
          schemaType: {
            name: "image",
            options: {
              imageField: {
                requiredDimensions: { width: 800, height: 450 },
              },
            },
          },
        })}
      />
    )

    pickFile()

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(/too small/i)).toBeInTheDocument()
  })

  it("commits a valid image immediately when there is no crop editor", () => {
    const onChange = vi.fn<(patches: unknown) => void>()
    uploadState.nextAssetId = "image-a1b2c3d4e5f6-1200x800-jpg"
    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          onChange,
          schemaType: {
            name: "image",
            options: {
              imageField: {
                requiredDimensions: { width: 800, height: 450 },
              },
            },
          },
        })}
      />
    )

    pickFile()

    expect(screen.queryByRole("button", { name: "Confirm crop" })).toBeNull()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("commits a dimensioned SVG immediately, skipping the crop editor", () => {
    const onChange = vi.fn<(patches: unknown) => void>()
    uploadState.nextAssetId = "image-a1b2c3d4e5f6-1200x800-svg"
    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          onChange,
          // An aspect constraint opens the editor for a raster image. An SVG is
          // not croppable, so it must commit straight through regardless.
          schemaType: {
            name: "image",
            options: { imageField: { aspectRatio: 1 } },
          },
        })}
      />
    )

    pickFile()

    expect(screen.queryByRole("button", { name: "Confirm crop" })).toBeNull()
    expect(onChange).toHaveBeenCalledTimes(1)
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const patches = onChange.mock.calls[0]?.[0] as {
      type?: string
      path?: unknown[]
      value?: unknown
    }[]
    const assetPatch = patches.find((patch) => patch.path?.[0] === "asset")
    expect(assetPatch?.value).toEqual({
      _type: "reference",
      _ref: "image-a1b2c3d4e5f6-1200x800-svg",
    })
    const cropPatch = patches.find((patch) => patch.path?.[0] === "crop")
    expect(cropPatch?.type).toBe("unset")
  })
})

const rasterValue = (extra: Record<string, unknown> = {}): ImageValue => ({
  _type: "image",
  asset: { _type: "reference", _ref: "image-a1b2c3d4e5f6-1200x800-jpg" },
  ...extra,
})

type UnsetPatch = { type: string; path: unknown[] }

const unsetPatches = (onChange: ReturnType<typeof vi.fn>): UnsetPatch[] =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  onChange.mock.calls[0]?.[0] as UnsetPatch[]

const dropPaths = (patches: UnsetPatch[]) =>
  patches.map((patch) => patch.path[0])

describe("ImageFieldInput removeImage", () => {
  it("keeps a sibling field and unsets only the asset keys on an object path", () => {
    const onChange = vi.fn<(patches: unknown) => void>()
    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          onChange,
          path: ["hero"],
          value: rasterValue({ alt: "x" }),
        })}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Remove" }))

    const patches = unsetPatches(onChange)
    expect(patches.every((patch) => patch.type === "unset")).toBe(true)
    expect(patches.some((patch) => patch.path.length === 0)).toBe(false)
    expect(dropPaths(patches)).toEqual(["asset", "media"])
    expect(dropPaths(patches)).not.toContain("alt")
  })

  it("unsets the whole object when no sibling fields remain on an object path", () => {
    const onChange = vi.fn<(patches: unknown) => void>()
    renderWithUi(
      <ImageFieldInput
        {...baseProps({ onChange, path: ["hero"], value: rasterValue() })}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Remove" }))

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const patch = onChange.mock.calls[0]?.[0] as UnsetPatch
    expect(patch.type).toBe("unset")
    expect(patch.path).toEqual([])
  })

  it("unsets the asset keys, not the whole object, on an array-element path", () => {
    const onChange = vi.fn<(patches: unknown) => void>()
    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          onChange,
          path: ["images", { _key: "k1" }],
          value: rasterValue(),
        })}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Remove" }))

    const patches = unsetPatches(onChange)
    expect(patches.every((patch) => patch.type === "unset")).toBe(true)
    expect(patches.some((patch) => patch.path.length === 0)).toBe(false)
    expect(dropPaths(patches)).toEqual(["asset", "media"])
  })
})

const fileDataTransfer = (file?: File) => ({
  types: ["Files"],
  dropEffect: "",
  files: {
    length: file ? 1 : 0,
    item: (index: number) => (index === 0 ? (file ?? null) : null),
  },
})

const fireDrag = (
  target: Element,
  type: "dragEnter" | "dragOver" | "drop",
  file?: File
) => {
  fireEvent[type](target, { dataTransfer: fileDataTransfer(file) })
}

describe("ImageFieldInput drag-and-drop upload", () => {
  it("switches the dropzone copy when files are dragged over it", () => {
    renderWithUi(<ImageFieldInput {...baseProps()} />)

    expect(
      screen.getByText("Drag and drop an image here, or")
    ).toBeInTheDocument()

    fireDrag(screen.getByRole("button", { name: "Upload" }), "dragEnter")

    expect(screen.getByText("Drop the image to upload")).toBeInTheDocument()
  })

  it("uploads a dropped file", () => {
    renderWithUi(<ImageFieldInput {...baseProps()} />)

    const file = new File(["data"], "pic.png", { type: "image/png" })
    fireDrag(screen.getByRole("button", { name: "Upload" }), "drop", file)

    expect(uploadCalls).toHaveLength(1)
    expect(uploadCalls[0]?.file).toBe(file)
  })

  it("ignores a drop while read-only", () => {
    renderWithUi(<ImageFieldInput {...baseProps({ readOnly: true })} />)

    const file = new File(["data"], "pic.png", { type: "image/png" })
    fireDrag(screen.getByRole("button", { name: "Upload" }), "drop", file)

    expect(uploadCalls).toHaveLength(0)
  })
})

describe("ImageFieldInput dimension messaging in the confirmed preview", () => {
  it("shows the critical message when below the required size", () => {
    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          value: rasterValue(),
          schemaType: {
            name: "image",
            options: {
              imageField: {
                requiredDimensions: { width: 5000, height: 5000 },
              },
            },
          },
        })}
      />
    )

    expect(
      screen.getByText(
        "Cropped image is below the required 5000 × 5000 px. Edit the crop to enlarge it."
      )
    ).toBeInTheDocument()
  })

  it("shows the caution message when below the recommended size", () => {
    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          value: rasterValue(),
          schemaType: {
            name: "image",
            options: {
              imageField: {
                recommendedDimensions: { width: 5000, height: 5000 },
              },
            },
          },
        })}
      />
    )

    expect(
      screen.getByText("Cropped image is below the recommended 5000 × 5000 px.")
    ).toBeInTheDocument()
  })

  it("shows no message when the cropped size clears the limits", () => {
    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          value: rasterValue(),
          schemaType: {
            name: "image",
            options: {
              imageField: {
                requiredDimensions: { width: 800, height: 450 },
                recommendedDimensions: { width: 1000, height: 600 },
              },
            },
          },
        })}
      />
    )

    expect(screen.queryByText(/Cropped image is below/)).toBeNull()
  })
})

describe("ImageFieldInput upload errors", () => {
  it("derives the file picker accept value from allowed formats", () => {
    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          schemaType: {
            name: "image",
            options: { imageField: { allowedFormats: ["jpeg", "png"] } },
          },
        })}
      />
    )

    expect(screen.getByLabelText("Upload image")).toHaveAttribute(
      "accept",
      "image/jpeg,.jpg,.jpeg,image/png"
    )
  })

  it("rejects a picked file whose type is not accepted and uploads nothing", () => {
    renderWithUi(<ImageFieldInput {...baseProps()} />)

    const file = new File(["data"], "doc.pdf", { type: "application/pdf" })
    pickFile(file)

    expect(uploadCalls).toHaveLength(0)
    expect(screen.getByText(/isn't accepted/i)).toBeInTheDocument()
  })

  it("rejects a picked file whose type allowedFormats excludes", () => {
    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          schemaType: {
            name: "image",
            options: { imageField: { allowedFormats: ["jpg", "png"] } },
          },
        })}
      />
    )

    const file = new File(["data"], "pic.webp", { type: "image/webp" })
    pickFile(file)

    expect(uploadCalls).toHaveLength(0)
    expect(screen.getByText(/isn't accepted/i)).toBeInTheDocument()
  })

  it("shows a failure message when the upload errors", () => {
    uploadState.fails = true
    renderWithUi(<ImageFieldInput {...baseProps()} />)

    pickFile()

    expect(
      screen.getByText("Upload failed. Please try again.")
    ).toBeInTheDocument()
  })
})

const fakeSource = (overrides: Record<string, unknown> = {}) => ({
  name: "default",
  title: "Default",
  component: () => null,
  ...overrides,
})

describe("ImageFieldInput select-existing affordance", () => {
  it("renders no select-existing control with no sources", () => {
    workspaceState.assetSources = []
    renderWithUi(<ImageFieldInput {...baseProps()} />)

    expect(screen.queryByText("Select existing")).toBeNull()
  })

  it("renders a button with one source", () => {
    workspaceState.assetSources = [fakeSource()]
    renderWithUi(<ImageFieldInput {...baseProps()} />)

    const control = screen.getByRole("button", { name: "Select existing" })
    expect(control).toBeInTheDocument()
    expect(control).not.toHaveAttribute("aria-haspopup")
  })

  it("renders a menu button with two or more sources", () => {
    workspaceState.assetSources = [
      fakeSource({ name: "one", title: "One" }),
      fakeSource({ name: "two", title: "Two" }),
    ]
    renderWithUi(<ImageFieldInput {...baseProps()} />)

    const control = screen.getByRole("button", { name: "Select existing" })
    expect(control).toHaveAttribute("aria-haspopup", "true")
  })

  it("rejects a non-image selection from a source", () => {
    let captured: ((assets: unknown[]) => void) | null = null
    const Source = (props: { onSelect: (assets: unknown[]) => void }) => {
      captured = props.onSelect
      return null
    }
    workspaceState.assetSources = [fakeSource({ component: Source })]
    renderWithUi(<ImageFieldInput {...baseProps()} />)

    fireEvent.click(screen.getByRole("button", { name: "Select existing" }))

    expect(captured).not.toBeNull()
    act(() => {
      captured?.([{ kind: "assetDocumentId", value: "not-an-image-ref" }])
    })

    expect(screen.getByText(/can't be used here/i)).toBeInTheDocument()
  })

  it("rejects an existing image whose format allowedFormats excludes", () => {
    let captured: ((assets: unknown[]) => void) | null = null
    const Source = (props: { onSelect: (assets: unknown[]) => void }) => {
      captured = props.onSelect
      return null
    }
    workspaceState.assetSources = [fakeSource({ component: Source })]
    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          schemaType: {
            name: "image",
            options: { imageField: { allowedFormats: ["jpg", "png"] } },
          },
        })}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Select existing" }))

    expect(captured).not.toBeNull()
    act(() => {
      captured?.([
        { kind: "assetDocumentId", value: "image-a1b2c3d4e5f6-1200x800-gif" },
      ])
    })

    expect(screen.getByText(/format isn't accepted/i)).toBeInTheDocument()
  })

  it("opens the crop editor for a valid image selected from a source", () => {
    let captured: ((assets: unknown[]) => void) | null = null
    const Source = (props: { onSelect: (assets: unknown[]) => void }) => {
      captured = props.onSelect
      return null
    }
    workspaceState.assetSources = [fakeSource({ component: Source })]
    renderWithUi(
      <ImageFieldInput
        {...baseProps({
          schemaType: {
            name: "image",
            options: { imageField: { aspectRatio: 1 } },
          },
        })}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Select existing" }))

    expect(captured).not.toBeNull()
    act(() => {
      captured?.([
        { kind: "assetDocumentId", value: "image-a1b2c3d4e5f6-1200x800-jpg" },
      ])
    })

    expect(
      screen.getByRole("button", { name: "Confirm crop" })
    ).toBeInTheDocument()
  })
})
