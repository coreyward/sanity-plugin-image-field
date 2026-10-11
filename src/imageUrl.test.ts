import { type ImageValue } from "sanity"
import { describe, expect, it } from "vitest"
import {
  croppedDimensionsFromValue,
  croppedImageUrl,
  type ImageAssetRef,
  isCroppable,
  isImageAssetRef,
  isSvg,
  type SanityImageSource,
  sourceDimensions,
  sourceImageUrl,
} from "./imageUrl"

const SOURCE: SanityImageSource = { projectId: "proj", dataset: "dataset" }
const REF: ImageAssetRef = "image-a1b2c3d4e5f6-1200x800-jpg"
// A centered crop of REF, 50% wide and 80% tall: 600x640 px, offset (300, 80).
const CROP = {
  _type: "sanity.imageCrop",
  top: 0.1,
  bottom: 0.1,
  left: 0.25,
  right: 0.25,
} as const

const imageValue = (ref: string, crop?: ImageValue["crop"]): ImageValue => ({
  _type: "image",
  asset: { _type: "reference", _ref: ref },
  ...(crop ? { crop } : {}),
})

describe("sourceDimensions", () => {
  it("reads the pixel dimensions encoded in the reference", () => {
    expect(sourceDimensions(REF)).toMatchObject({ width: 1200, height: 800 })
  })

  it("throws on a reference parseImageId can't read", () => {
    expect(() => sourceDimensions("image-NOTHEX-1200x800-jpg")).toThrow(
      /could not parse image id/i
    )
  })
})

describe("isCroppable", () => {
  it("accepts references with encoded WxH dimensions", () => {
    expect(isCroppable(REF)).toBe(true)
    expect(isCroppable("image-abc-1200x800-webp")).toBe(true)
  })

  it("rejects references without dimensions and nullish input", () => {
    expect(isCroppable("image-a1b2c3d4e5f6-svg")).toBe(false)
    expect(isCroppable(undefined)).toBe(false)
    expect(isCroppable(null)).toBe(false)
    expect(isCroppable("")).toBe(false)
  })

  it("rejects a dimensioned SVG, which parses but cannot be transformed", () => {
    expect(isCroppable("image-a1b2c3d4e5f6-1200x800-svg")).toBe(false)
  })
})

describe("isImageAssetRef", () => {
  it("accepts a classic image asset id", () => {
    expect(isImageAssetRef(REF)).toBe(true)
  })

  it("accepts an SVG image asset id", () => {
    // SVGs are valid images, even if they have no croppable dimensions.
    expect(isImageAssetRef("image-a1b2c3d4e5f6-svg")).toBe(true)
  })

  it("rejects non-image and unparseable references", () => {
    expect(isImageAssetRef("file-a1b2c3d4e5f6-1200x800-pdf")).toBe(false)
    expect(isImageAssetRef("image-NOTHEX-1200x800-jpg")).toBe(false)
    expect(isImageAssetRef("")).toBe(false)
  })
})

describe("isSvg", () => {
  it("matches the dimensionless image-<hash>-svg form", () => {
    expect(isSvg("image-a1b2c3d4e5f6-svg")).toBe(true)
  })

  it("matches the dimensioned image-<hash>-<w>x<h>-svg form", () => {
    expect(isSvg("image-a1b2c3d4e5f6-1200x800-svg")).toBe(true)
  })

  it("rejects raster, non-image, and malformed references", () => {
    expect(isSvg(REF)).toBe(false)
    expect(isSvg("file-a1b2c3d4e5f6-svg")).toBe(false)
    expect(isSvg("image-NOTHEX-svg")).toBe(false)
    expect(isSvg("image-a1b2c3d4e5f6-1200x800-png")).toBe(false)
    expect(isSvg("")).toBe(false)
  })
})

describe("croppedDimensionsFromValue", () => {
  it("returns null for undefined or asset-less values", () => {
    expect(croppedDimensionsFromValue(undefined)).toBeNull()
    expect(croppedDimensionsFromValue({ _type: "image" })).toBeNull()
  })

  it("returns null when the asset has no encoded dimensions", () => {
    expect(
      croppedDimensionsFromValue(imageValue("image-a1b2c3d4e5f6-svg"))
    ).toBeNull()
  })

  it("returns null for a dimensioned SVG, which is not croppable", () => {
    expect(
      croppedDimensionsFromValue(imageValue("image-a1b2c3d4e5f6-1200x800-svg"))
    ).toBeNull()
  })

  it("returns the full source size when there is no crop", () => {
    expect(croppedDimensionsFromValue(imageValue(REF))).toMatchObject({
      width: 1200,
      height: 800,
    })
  })

  it("applies the stored crop to the source size", () => {
    expect(croppedDimensionsFromValue(imageValue(REF, CROP))).toEqual({
      width: 600,
      height: 640,
    })
  })
})

describe("sourceImageUrl", () => {
  it("builds the CDN URL for the uncropped source image", () => {
    expect(sourceImageUrl(REF, SOURCE)).toBe(
      "https://cdn.sanity.io/images/proj/dataset/a1b2c3d4e5f6-1200x800.jpg"
    )
  })
})

describe("croppedImageUrl", () => {
  it("returns null when the value has no asset reference", () => {
    expect(croppedImageUrl({ _type: "image" }, SOURCE, 640)).toBeNull()
  })

  it("builds a width-fit URL for an uncropped image", () => {
    expect(croppedImageUrl(imageValue(REF), SOURCE, 640)).toBe(
      "https://cdn.sanity.io/images/proj/dataset/a1b2c3d4e5f6-1200x800.jpg?auto=format&fit=max&q=75&w=640"
    )
  })

  it("encodes the stored crop as a rect parameter", () => {
    const url = croppedImageUrl(imageValue(REF, CROP), SOURCE, 640)
    expect(url).toContain(
      "https://cdn.sanity.io/images/proj/dataset/a1b2c3d4e5f6-1200x800.jpg?"
    )
    expect(url).toContain("rect=300,80,600,640")
  })

  it("rounds the requested display width", () => {
    expect(croppedImageUrl(imageValue(REF), SOURCE, 640.4)).toContain("w=640")
  })

  it("serves an SVG straight from the CDN, with no rect or crop", () => {
    const url = croppedImageUrl(
      imageValue("image-a1b2c3d4e5f6-svg"),
      SOURCE,
      640
    )
    expect(url).toBe(
      "https://cdn.sanity.io/images/proj/dataset/a1b2c3d4e5f6.svg"
    )
  })

  it("serves a dimensioned SVG straight from the CDN, untransformed", () => {
    const url = croppedImageUrl(
      imageValue("image-a1b2c3d4e5f6-1200x800-svg"),
      SOURCE,
      640
    )
    expect(url).toBe(
      "https://cdn.sanity.io/images/proj/dataset/a1b2c3d4e5f6-1200x800.svg"
    )
  })
})
