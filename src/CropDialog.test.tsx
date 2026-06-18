import { describe, expect, it } from "vitest"
import { fireEvent, screen } from "@testing-library/react"
import { type ImageCrop, type ImageHotspot } from "sanity"
import { CropDialog } from "./CropDialog"
import { FREE_ASPECT_RATIO_RANGE } from "./cropMath"
import { renderWithUi } from "./test/render"
import { type ResolvedImageFieldConfig } from "./types"

const source = { width: 1200, height: 800 }
const imageSource = { projectId: "proj", dataset: "dataset" }
const assetRef = "image-a1b2c3d4e5f6-1200x800-jpg"
const config: ResolvedImageFieldConfig = {
  aspectRatioRange: FREE_ASPECT_RATIO_RANGE,
}

/** A config that requires the given cropped size, on the free aspect range. */
const withRequired = (requiredDimensions: {
  width: number
  height: number
}): ResolvedImageFieldConfig => ({
  aspectRatioRange: FREE_ASPECT_RATIO_RANGE,
  requiredDimensions,
})

type ConfirmResult = { crop: ImageCrop; hotspot?: ImageHotspot }

/** A confirm handler that records its calls. */
const captureConfirm = () => {
  const state: { calls: number; result?: ConfirmResult } = { calls: 0 }
  const onConfirm = (result: ConfirmResult) => {
    state.calls += 1
    state.result = result
  }
  return { state, onConfirm }
}

const confirm = () => {
  fireEvent.click(screen.getByRole("button", { name: "Confirm crop" }))
}

describe("CropDialog", () => {
  it("round-trips an existing hotspot unchanged when confirmed untouched", () => {
    const { state, onConfirm } = captureConfirm()
    const initialHotspot: ImageHotspot = {
      _type: "sanity.imageHotspot",
      x: 0.25,
      y: 0.75,
      width: 0.5,
      height: 0.5,
    }

    renderWithUi(
      <CropDialog
        assetRef={assetRef}
        imageSource={imageSource}
        sourceDimensions={source}
        config={config}
        hotspotEnabled
        initialHotspot={initialHotspot}
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    )

    confirm()
    expect(state.calls).toBe(1)
    expect(state.result?.hotspot).toEqual(initialHotspot)
    expect(state.result?.crop._type).toBe("sanity.imageCrop")
  })

  it("seeds a centered hotspot when none exists and confirms it", () => {
    const { state, onConfirm } = captureConfirm()

    renderWithUi(
      <CropDialog
        assetRef={assetRef}
        imageSource={imageSource}
        sourceDimensions={source}
        config={config}
        hotspotEnabled
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    )

    confirm()
    expect(state.result?.hotspot).toMatchObject({ x: 0.5, y: 0.5 })
  })

  it("writes no hotspot when hotspot editing is disabled", () => {
    const { state, onConfirm } = captureConfirm()

    renderWithUi(
      <CropDialog
        assetRef={assetRef}
        imageSource={imageSource}
        sourceDimensions={source}
        config={config}
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    )

    confirm()
    expect(state.calls).toBe(1)
    expect(state.result?.hotspot).toBeUndefined()
  })

  it("pulls an initial hotspot that sits outside the crop inside it", () => {
    const { state, onConfirm } = captureConfirm()
    // A crop covering the right half of the source, so x in [0.5, 1].
    const initialCrop: ImageCrop = {
      _type: "sanity.imageCrop",
      top: 0,
      bottom: 0,
      left: 0.5,
      right: 0,
    }
    const initialHotspot: ImageHotspot = {
      _type: "sanity.imageHotspot",
      x: 0.2, // left of the crop's near edge
      y: 0.5,
      width: 0.5,
      height: 0.5,
    }

    renderWithUi(
      <CropDialog
        assetRef={assetRef}
        imageSource={imageSource}
        sourceDimensions={source}
        config={config}
        initialCrop={initialCrop}
        hotspotEnabled
        initialHotspot={initialHotspot}
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    )

    confirm()
    expect(state.result?.hotspot).toMatchObject({ x: 0.5, y: 0.5 })
  })

  it("shrinks a whole-image hotspot region to the crop on confirm", () => {
    const { state, onConfirm } = captureConfirm()
    // The crop covers the right half of the source, so its source-relative width
    // is 0.5. An incoming 1×1 region spans the whole source, so it is shrunk to
    // fit the crop. The full-height crop leaves the region's height at 1.
    const initialCrop: ImageCrop = {
      _type: "sanity.imageCrop",
      top: 0,
      bottom: 0,
      left: 0.5,
      right: 0,
    }
    const initialHotspot: ImageHotspot = {
      _type: "sanity.imageHotspot",
      x: 0.75,
      y: 0.5,
      width: 1,
      height: 1,
    }

    renderWithUi(
      <CropDialog
        assetRef={assetRef}
        imageSource={imageSource}
        sourceDimensions={source}
        config={config}
        initialCrop={initialCrop}
        hotspotEnabled
        initialHotspot={initialHotspot}
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    )

    confirm()
    expect(state.result?.hotspot?.width).toBeCloseTo(0.5)
    expect(state.result?.hotspot?.height).toBeCloseTo(1)
  })

  it("centers the default focal point on the crop, not the source", () => {
    const { state, onConfirm } = captureConfirm()
    // A crop covering the right half of the source: its center is at source
    // x = 0.75. The default focal point is the center of the crop.
    const initialCrop: ImageCrop = {
      _type: "sanity.imageCrop",
      top: 0,
      bottom: 0,
      left: 0.5,
      right: 0,
    }

    renderWithUi(
      <CropDialog
        assetRef={assetRef}
        imageSource={imageSource}
        sourceDimensions={source}
        config={config}
        initialCrop={initialCrop}
        hotspotEnabled
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    )

    confirm()
    expect(state.result?.hotspot?.x).toBeCloseTo(0.75)
    expect(state.result?.hotspot?.y).toBeCloseTo(0.5)
  })

  describe("size status", () => {
    it("confirms the size when the crop clears the configured limit", () => {
      renderWithUi(
        <CropDialog
          assetRef={assetRef}
          imageSource={imageSource}
          sourceDimensions={source}
          config={withRequired({ width: 100, height: 100 })}
          onConfirm={() => {}}
          onClose={() => {}}
        />
      )
      expect(screen.getByText("Crop size looks good.")).toBeInTheDocument()
    })

    it("shows the dimension issue and blocks confirm when the crop is too small", () => {
      renderWithUi(
        <CropDialog
          assetRef={assetRef}
          imageSource={imageSource}
          sourceDimensions={source}
          config={withRequired({ width: 5000, height: 5000 })}
          onConfirm={() => {}}
          onClose={() => {}}
        />
      )
      expect(
        screen.getByText("Crop must be at least 5000 × 5000 px.")
      ).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: "Confirm crop" })
      ).toBeDisabled()
    })

    it("reserves no status slot when the field sets no size limit", () => {
      renderWithUi(
        <CropDialog
          assetRef={assetRef}
          imageSource={imageSource}
          sourceDimensions={source}
          config={config}
          onConfirm={() => {}}
          onClose={() => {}}
        />
      )
      expect(
        screen.queryByText("Crop size looks good.")
      ).not.toBeInTheDocument()
    })
  })
})
