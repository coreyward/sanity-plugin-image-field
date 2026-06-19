import { describe, expect, it } from "vitest"
import {
  acceptFromAllowedFormats,
  acceptsType,
  assetRefMatchesAllowedFormats,
  describeAllowedFormats,
  imageFormatFromAssetRef,
  isTextEntryTarget,
  normalizeAllowedFormats,
} from "./upload"

describe("acceptsType", () => {
  it("matches the image/* default", () => {
    expect(acceptsType("image/png", "image/*")).toBe(true)
    expect(acceptsType("image/svg+xml", "image/*")).toBe(true)
    expect(acceptsType("application/pdf", "image/*")).toBe(false)
  })

  it("matches an explicit comma-separated list", () => {
    const accept = "image/png,image/jpeg"
    expect(acceptsType("image/png", accept)).toBe(true)
    expect(acceptsType("image/jpeg", accept)).toBe(true)
    expect(acceptsType("image/gif", accept)).toBe(false)
    expect(acceptsType("image/webp", accept)).toBe(false)
  })

  it("tolerates whitespace and mixed case", () => {
    expect(acceptsType("IMAGE/PNG", "image/png, image/jpeg")).toBe(true)
    expect(acceptsType("image/jpeg", " IMAGE/JPEG ")).toBe(true)
  })

  it("treats * and */* as accept-anything", () => {
    expect(acceptsType("application/pdf", "*")).toBe(true)
    expect(acceptsType("application/pdf", "*/*")).toBe(true)
  })

  it("accepts anything when the accept list is empty", () => {
    expect(acceptsType("application/pdf", "")).toBe(true)
    expect(acceptsType("image/png", "   ")).toBe(true)
  })

  it("rejects a file with no MIME type unless a glob covers it", () => {
    expect(acceptsType("", "image/*")).toBe(false)
    expect(acceptsType("", "*/*")).toBe(true)
  })
})

describe("allowed format helpers", () => {
  it("resolves the jpeg alias to jpg and removes duplicates", () => {
    expect(normalizeAllowedFormats(["jpeg", "png", "jpg"])).toEqual([
      "jpg",
      "png",
    ])
  })

  it("resolves the tif alias to tiff", () => {
    expect(normalizeAllowedFormats(["tif"])).toEqual(["tiff"])
  })

  it("matches a tif-suffixed asset ref against an allowed tiff format", () => {
    expect(
      assetRefMatchesAllowedFormats("image-a1b2c3d4e5f6-1200x800-tif", ["tiff"])
    ).toBe(true)
  })

  it("throws on a format the field does not handle", () => {
    // @ts-expect-error -- "ico" is not an AllowedImageFormat
    expect(() => normalizeAllowedFormats(["ico"])).toThrow(
      /Unsupported image format "ico"/
    )
  })

  it("builds a MIME accept string from allowed formats", () => {
    expect(acceptFromAllowedFormats(["jpg", "png", "webp"])).toBe(
      "image/jpeg,.jpg,.jpeg,image/png,image/webp"
    )
  })

  it("lists both spellings for jpg/jpeg and tiff/tif regardless of which is configured", () => {
    expect(acceptFromAllowedFormats(["jpeg"])).toBe("image/jpeg,.jpg,.jpeg")
    expect(acceptFromAllowedFormats(["tif"])).toBe("image/tiff,.tif,.tiff")
    expect(acceptFromAllowedFormats(["tiff"])).toBe("image/tiff,.tif,.tiff")
  })

  it("reads the format suffix from Sanity image asset refs", () => {
    expect(imageFormatFromAssetRef("image-a1b2c3d4e5f6-1200x800-jpg")).toBe(
      "jpg"
    )
    expect(imageFormatFromAssetRef("image-a1b2c3d4e5f6-512x512-svg")).toBe(
      "svg"
    )
  })

  it("matches asset refs against the configured formats", () => {
    expect(
      assetRefMatchesAllowedFormats("image-a1b2c3d4e5f6-1200x800-jpg", ["jpeg"])
    ).toBe(true)
    expect(
      assetRefMatchesAllowedFormats("image-a1b2c3d4e5f6-1200x800-gif", [
        "jpg",
        "png",
      ])
    ).toBe(false)
  })

  it("describes allowed formats for messages", () => {
    expect(describeAllowedFormats(["jpg", "png", "webp"])).toBe(
      "JPEG, JPG, PNG, or WEBP"
    )
  })
})

describe("isTextEntryTarget", () => {
  it("is true for inputs, textareas, and contenteditable elements", () => {
    expect(isTextEntryTarget(document.createElement("input"))).toBe(true)
    expect(isTextEntryTarget(document.createElement("textarea"))).toBe(true)

    const editable = document.createElement("div")
    editable.setAttribute("contenteditable", "true")
    expect(isTextEntryTarget(editable)).toBe(true)
  })

  it("is false for non-text elements and null", () => {
    expect(isTextEntryTarget(document.createElement("div"))).toBe(false)
    expect(isTextEntryTarget(document.createElement("button"))).toBe(false)
    expect(isTextEntryTarget(null)).toBe(false)
  })
})
