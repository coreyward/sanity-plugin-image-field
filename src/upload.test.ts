import { describe, expect, it } from "vitest"
import { acceptsType, isTextEntryTarget } from "./upload"

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
