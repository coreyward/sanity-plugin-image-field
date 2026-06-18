import { describe, expect, it } from "vitest"
import { type ImageHotspot } from "sanity"
import {
  applyRatio,
  croppedDimensions,
  cropToPixelRect,
  defaultCrop,
  dimensionsAtLeast,
  type Direction,
  focalPointToHotspot,
  formatAspectRatio,
  FREE_ASPECT_RATIO_RANGE,
  hotspotToFocalPoint,
  moveRect,
  type PixelRect,
  pixelRectToCrop,
  resize,
  resolveAspectRatio,
  toNormalizedPoint,
} from "./cropMath"
import { type AspectRatioRange, type Dimensions } from "./types"

const RANGE: AspectRatioRange = { min: 4 / 3, max: 16 / 9 }
const ratioOf = (rect: { width: number; height: number }) =>
  rect.width / rect.height

describe("resolveAspectRatio", () => {
  it("falls back to the free range for undefined", () => {
    expect(resolveAspectRatio(undefined)).toEqual({
      aspectRatioRange: FREE_ASPECT_RATIO_RANGE,
    })
  })

  it("locks a single number to an equal-bounds range", () => {
    expect(resolveAspectRatio(1.5)).toEqual({
      aspectRatioRange: { min: 1.5, max: 1.5 },
    })
  })

  it("passes a range through unchanged", () => {
    expect(resolveAspectRatio({ min: 1, max: 2 })).toEqual({
      aspectRatioRange: { min: 1, max: 2 },
    })
  })

  it("derives bounds and sorted, deduped snapRatios from an array", () => {
    const resolved = resolveAspectRatio([16 / 9, 1, 4 / 3, 1])
    expect(resolved.snapRatios).toEqual([1, 4 / 3, 16 / 9])
    expect(resolved.aspectRatioRange).toEqual({ min: 1, max: 16 / 9 })
  })

  it("reduces a one-element array to a fixed ratio", () => {
    const resolved = resolveAspectRatio([1.5])
    expect(resolved.snapRatios).toEqual([1.5])
    expect(resolved.aspectRatioRange).toEqual({ min: 1.5, max: 1.5 })
  })
})

describe("defaultCrop", () => {
  it("uses the whole image when its ratio is already in range", () => {
    const source: Dimensions = { width: 1600, height: 900 } // 16:9
    const crop = defaultCrop(source, RANGE)
    expect(crop).toEqual({ x: 0, y: 0, width: 1600, height: 900 })
  })

  it("clamps to the allowed ratio and centers when the image is too wide", () => {
    const source: Dimensions = { width: 3000, height: 1000 } // 3:1
    const crop = defaultCrop(source, RANGE)
    expect(ratioOf(crop)).toBeCloseTo(RANGE.max)
    // Centered horizontally, full height.
    expect(crop.y).toBe(0)
    expect(crop.height).toBe(1000)
    expect(crop.x).toBeCloseTo((3000 - crop.width) / 2)
    // Stays within the source bounds.
    expect(crop.x).toBeGreaterThanOrEqual(0)
    expect(crop.x + crop.width).toBeLessThanOrEqual(3000)
  })

  describe("with snapRatios", () => {
    const snap = [4 / 3, 16 / 9]

    it("targets the allowed ratio nearest the source's natural ratio", () => {
      const source: Dimensions = { width: 1000, height: 1000 } // 1:1 → nearest 4:3
      const crop = defaultCrop(source, RANGE, snap)
      expect(ratioOf(crop)).toBeCloseTo(4 / 3)
    })

    it("picks a wider member for a wide source", () => {
      const source: Dimensions = { width: 3000, height: 1000 } // 3:1 → nearest 16:9
      const crop = defaultCrop(source, RANGE, snap)
      expect(ratioOf(crop)).toBeCloseTo(16 / 9)
    })
  })
})

describe("pixelRectToCrop / cropToPixelRect", () => {
  it("round-trips a rectangle through Sanity's fractional crop", () => {
    const source: Dimensions = { width: 2000, height: 1500 }
    const rect = { x: 200, y: 150, width: 1200, height: 900 }
    const back = cropToPixelRect(pixelRectToCrop(rect, source), source)
    expect(back.x).toBeCloseTo(rect.x)
    expect(back.y).toBeCloseTo(rect.y)
    expect(back.width).toBeCloseTo(rect.width)
    expect(back.height).toBeCloseTo(rect.height)
  })

  it("produces non-negative insets that describe the same crop", () => {
    const source: Dimensions = { width: 1000, height: 1000 }
    const crop = pixelRectToCrop(
      { x: 0, y: 0, width: 1000, height: 500 },
      source
    )
    expect(crop.top).toBe(0)
    expect(crop.left).toBe(0)
    expect(crop.right).toBe(0)
    expect(crop.bottom).toBeCloseTo(0.5)
  })
})

describe("resize", () => {
  const source: Dimensions = { width: 2000, height: 2000 }
  const start: PixelRect = { x: 500, y: 500, width: 1000, height: 1000 }

  const DIRECTIONS: { name: string; dir: Direction }[] = [
    { name: "nw", dir: { dx: -1, dy: -1 } },
    { name: "n", dir: { dx: 0, dy: -1 } },
    { name: "ne", dir: { dx: 1, dy: -1 } },
    { name: "e", dir: { dx: 1, dy: 0 } },
    { name: "se", dir: { dx: 1, dy: 1 } },
    { name: "s", dir: { dx: 0, dy: 1 } },
    { name: "sw", dir: { dx: -1, dy: 1 } },
    { name: "w", dir: { dx: -1, dy: 0 } },
  ]
  const OPTS: {
    name: string
    opts: { lockRatio?: boolean; mirror?: boolean }
  }[] = [
    { name: "default", opts: {} },
    { name: "lockRatio", opts: { lockRatio: true } },
    { name: "mirror", opts: { mirror: true } },
  ]
  const POINTERS = [
    { x: -500, y: -500 },
    { x: 5000, y: 5000 },
    { x: 1000, y: 1000 },
    { x: 1900, y: 100 },
    { x: 600, y: 1400 },
  ]

  // Every resize must keep two invariants: the crop stays inside the bounds and
  // its ratio stays within range. Check both across all eight directions, every
  // modifier option, and pointers inside and outside the bounds.
  for (const { name, dir } of DIRECTIONS) {
    for (const { name: optName, opts } of OPTS) {
      it(`holds the bounds and ratio invariants: ${name} (${optName})`, () => {
        for (const pointer of POINTERS) {
          const next = resize(start, dir, pointer, source, RANGE, opts)
          expect(next.x).toBeGreaterThanOrEqual(-1e-6)
          expect(next.y).toBeGreaterThanOrEqual(-1e-6)
          expect(next.x + next.width).toBeLessThanOrEqual(source.width + 1e-6)
          expect(next.y + next.height).toBeLessThanOrEqual(source.height + 1e-6)
          expect(next.width).toBeGreaterThan(0)
          expect(next.height).toBeGreaterThan(0)
          expect(ratioOf(next)).toBeGreaterThanOrEqual(RANGE.min - 1e-6)
          expect(ratioOf(next)).toBeLessThanOrEqual(RANGE.max + 1e-6)
        }
      })
    }
  }

  it("anchors the opposite corner when resizing a corner", () => {
    // Dragging the NW corner keeps the SE corner (1500, 1500) fixed.
    const next = resize(
      start,
      { dx: -1, dy: -1 },
      { x: 800, y: 800 },
      source,
      RANGE
    )
    expect(next.x + next.width).toBeCloseTo(1500)
    expect(next.y + next.height).toBeCloseTo(1500)
  })

  it("reduces a corner drag to the classic opposite-corner resize", () => {
    // SE drag far past the bottom-right edge. The NW corner (500, 500) is the
    // fixed anchor.
    const next = resize(
      start,
      { dx: 1, dy: 1 },
      { x: 5000, y: 5000 },
      source,
      RANGE
    )
    expect(next.x).toBeCloseTo(500)
    expect(next.y).toBeCloseTo(500)
  })

  it("takes a new ratio from the dragged edge on a side, clamped to range", () => {
    // A square crop, dragged east toward a far pointer. The dragged width over the
    // unchanged height implies a wide ratio (2.5), which clamps to RANGE.max. The
    // left edge stays anchored at 800.
    const square: PixelRect = { x: 800, y: 800, width: 400, height: 400 }
    const next = resize(
      square,
      { dx: 1, dy: 0 },
      { x: 1800, y: 1000 },
      source,
      RANGE
    )
    expect(ratioOf(next)).toBeCloseTo(RANGE.max)
    expect(next.x).toBeCloseTo(800)
  })

  it("moves only the dragged edge on a free side drag", () => {
    // A free range, so a side drag changes the aspect ratio without touching the
    // perpendicular edges. Dragging west moves only the left edge: the top and
    // bottom stay at 500/1500 and the right edge stays at 1500.
    const wide: PixelRect = { x: 500, y: 500, width: 1000, height: 1000 }
    const next = resize(
      wide,
      { dx: -1, dy: 0 },
      { x: 300, y: 1000 },
      source,
      FREE_ASPECT_RATIO_RANGE
    )
    expect(next.x).toBeCloseTo(300)
    expect(next.y).toBeCloseTo(500)
    expect(next.width).toBeCloseTo(1200)
    expect(next.height).toBeCloseTo(1000)
    expect(ratioOf(next)).toBeCloseTo(1.2)
  })

  it("locks a corner to the current ratio with lockRatio", () => {
    // A 3:2 crop inside the range. Without lockRatio a corner drag would take its
    // ratio from the pointer; lockRatio holds the ratio at 3:2.
    const start32: PixelRect = { x: 400, y: 400, width: 900, height: 600 }
    const next = resize(
      start32,
      { dx: 1, dy: 1 },
      { x: 1800, y: 600 },
      source,
      RANGE,
      { lockRatio: true }
    )
    expect(ratioOf(next)).toBeCloseTo(1.5)
  })

  it("keeps the center fixed when mirroring", () => {
    const centered: PixelRect = { x: 700, y: 700, width: 600, height: 600 }
    const next = resize(
      centered,
      { dx: 1, dy: 1 },
      { x: 1600, y: 1600 },
      source,
      RANGE,
      { mirror: true }
    )
    expect(next.x + next.width / 2).toBeCloseTo(1000)
    expect(next.y + next.height / 2).toBeCloseTo(1000)
  })

  it("bounds a mirror resize by the nearer edge", () => {
    // A crop near the left edge. A mirrored resize grows outward and must stay
    // inside the image.
    const offset: PixelRect = { x: 50, y: 900, width: 200, height: 200 }
    const next = resize(
      offset,
      { dx: 1, dy: 1 },
      { x: 1900, y: 1900 },
      source,
      RANGE,
      { mirror: true }
    )
    expect(next.x).toBeGreaterThanOrEqual(-1e-6)
    expect(next.x + next.width).toBeLessThanOrEqual(source.width + 1e-6)
  })
})

describe("resize with snapRatios (snaps as you drag)", () => {
  const source: Dimensions = { width: 2000, height: 2000 }
  const range: AspectRatioRange = { min: 1, max: 16 / 9 }
  const snap = [1, 4 / 3, 16 / 9]
  const start: PixelRect = { x: 500, y: 500, width: 1000, height: 1000 } // 1:1

  const isMember = (ratio: number) =>
    snap.some((member) => Math.abs(member - ratio) < 1e-6)

  it("snaps a corner drag to the nearest allowed ratio", () => {
    // The pointer implies a ratio of ~2.14:1. The nearest allowed ratio is 16:9.
    const next = resize(
      start,
      { dx: 1, dy: 1 },
      { x: 2000, y: 1200 },
      source,
      range,
      { snapRatios: snap }
    )
    expect(ratioOf(next)).toBeCloseTo(16 / 9)
  })

  it("lands on an allowed ratio for any pointer, anchor fixed", () => {
    const pointers = [
      { x: 1700, y: 1700 },
      { x: 2000, y: 1100 },
      { x: 1200, y: 1900 },
      { x: 1600, y: 1300 },
    ]
    for (const pointer of pointers) {
      const next = resize(start, { dx: 1, dy: 1 }, pointer, source, range, {
        snapRatios: snap,
      })
      expect(isMember(ratioOf(next))).toBe(true)
      // An SE drag keeps the NW corner (500, 500) fixed while snapping.
      expect(next.x).toBeCloseTo(500)
      expect(next.y).toBeCloseTo(500)
    }
  })

  it("snaps a side drag to a new allowed ratio implied by the dragged edge", () => {
    // Dragging the 4:3 crop's east edge out implies ~1.667 (the dragged width over
    // the unchanged height). Its nearest allowed member is 16:9.
    const fourThree: PixelRect = { x: 400, y: 400, width: 1200, height: 900 }
    const next = resize(
      fourThree,
      { dx: 1, dy: 0 },
      { x: 1900, y: 1000 },
      source,
      range,
      { snapRatios: snap }
    )
    expect(ratioOf(next)).toBeCloseTo(16 / 9)
  })

  it("switches snap ratios on a side drag with a pinned dimension", () => {
    // A full-width 1:1 crop in a tall image, centered vertically. The width is
    // pinned at the image width, so dragging the bottom edge down lowers the
    // implied ratio and snaps it to the next narrower member. The crop stays full
    // width with its top edge fixed.
    const tall: Dimensions = { width: 1000, height: 2000 }
    const tallRange: AspectRatioRange = { min: 2 / 3, max: 1 }
    const tallSnap = [1, 4 / 5, 2 / 3]
    const fullWidth: PixelRect = { x: 0, y: 500, width: 1000, height: 1000 }

    const toFourFifths = resize(
      fullWidth,
      { dx: 0, dy: 1 },
      { x: 500, y: 1800 },
      tall,
      tallRange,
      { snapRatios: tallSnap }
    )
    expect(ratioOf(toFourFifths)).toBeCloseTo(0.8)
    expect(toFourFifths.width).toBeCloseTo(1000)
    expect(toFourFifths.x).toBeCloseTo(0)
    expect(toFourFifths.y).toBeCloseTo(500)

    const toTwoThirds = resize(
      fullWidth,
      { dx: 0, dy: 1 },
      { x: 500, y: 2000 },
      tall,
      tallRange,
      { snapRatios: tallSnap }
    )
    expect(ratioOf(toTwoThirds)).toBeCloseTo(2 / 3)
    expect(toTwoThirds.width).toBeCloseTo(1000)
  })
})

describe("applyRatio", () => {
  const source: Dimensions = { width: 1000, height: 1000 }

  it("re-fits to an exact ratio, preserving the center", () => {
    const rect = { x: 300, y: 300, width: 400, height: 400 } // center (500, 500)
    const next = applyRatio(rect, 16 / 9, source)
    expect(ratioOf(next)).toBeCloseTo(16 / 9)
    expect(next.x + next.width / 2).toBeCloseTo(500)
    expect(next.y + next.height / 2).toBeCloseTo(500)
  })

  it("only shrinks, so a wider-than-source ratio still fits", () => {
    const rect = { x: 200, y: 200, width: 600, height: 600 }
    const next = applyRatio(rect, 4, source)
    expect(next.width).toBeLessThanOrEqual(rect.width + 1e-6)
    expect(next.height).toBeLessThanOrEqual(rect.height + 1e-6)
    expect(next.x).toBeGreaterThanOrEqual(-1e-6)
    expect(next.x + next.width).toBeLessThanOrEqual(source.width + 1e-6)
    expect(next.y + next.height).toBeLessThanOrEqual(source.height + 1e-6)
  })

  it("only shrinks, so a taller-than-source ratio still fits", () => {
    const rect = { x: 200, y: 200, width: 600, height: 600 }
    const next = applyRatio(rect, 0.25, source)
    expect(next.width).toBeLessThanOrEqual(rect.width + 1e-6)
    expect(next.height).toBeLessThanOrEqual(rect.height + 1e-6)
    expect(next.x + next.width).toBeLessThanOrEqual(source.width + 1e-6)
    expect(next.y + next.height).toBeLessThanOrEqual(source.height + 1e-6)
  })
})

describe("toNormalizedPoint", () => {
  // A 400×300 image box offset 100px right and 50px down on the page.
  const box = { left: 100, top: 50, width: 400, height: 300 }

  it("maps a pointer inside the box to a 0–1 coordinate", () => {
    expect(toNormalizedPoint({ x: 300, y: 200 }, box)).toEqual({
      x: 0.5,
      y: 0.5,
    })
    expect(toNormalizedPoint({ x: 100, y: 50 }, box)).toEqual({ x: 0, y: 0 })
    expect(toNormalizedPoint({ x: 500, y: 350 }, box)).toEqual({ x: 1, y: 1 })
  })

  it("clamps pointers outside the box into [0, 1]", () => {
    expect(toNormalizedPoint({ x: 0, y: 0 }, box)).toEqual({ x: 0, y: 0 })
    expect(toNormalizedPoint({ x: 9999, y: 9999 }, box)).toEqual({
      x: 1,
      y: 1,
    })
  })
})

describe("moveRect", () => {
  const source: Dimensions = { width: 1000, height: 1000 }

  it("repositions without resizing", () => {
    const moved = moveRect(
      { x: 100, y: 100, width: 400, height: 400 },
      50,
      -30,
      source
    )
    expect(moved).toEqual({ x: 150, y: 70, width: 400, height: 400 })
  })

  it("clamps to the image edges", () => {
    const moved = moveRect(
      { x: 700, y: 700, width: 400, height: 400 },
      500,
      500,
      source
    )
    expect(moved.x).toBe(600)
    expect(moved.y).toBe(600)
  })
})

describe("croppedDimensions / dimensionsAtLeast", () => {
  it("rounds the rectangle size", () => {
    expect(
      croppedDimensions({ x: 0, y: 0, width: 199.6, height: 100.2 })
    ).toEqual({
      width: 200,
      height: 100,
    })
  })

  it("compares both axes against a threshold", () => {
    expect(
      dimensionsAtLeast(
        { width: 800, height: 600 },
        { width: 800, height: 600 }
      )
    ).toBe(true)
    expect(
      dimensionsAtLeast(
        { width: 799, height: 600 },
        { width: 800, height: 600 }
      )
    ).toBe(false)
  })
})

describe("formatAspectRatio", () => {
  it("prefers a clean w:h label", () => {
    expect(formatAspectRatio(16 / 9)).toBe("16:9")
    expect(formatAspectRatio(4 / 3)).toBe("4:3")
    expect(formatAspectRatio(3 / 2)).toBe("3:2")
    expect(formatAspectRatio(1)).toBe("1:1")
  })

  it("falls back to a decimal rather than an awkward whole-number pair", () => {
    expect(formatAspectRatio(2.35)).toBe("2.35:1")
  })
})

const hotspotAt = (x: number, y: number): ImageHotspot => ({
  _type: "sanity.imageHotspot",
  x,
  y,
  width: 0.4,
  height: 0.4,
})

describe("focal point ↔ hotspot", () => {
  const source: Dimensions = { width: 1000, height: 1000 }
  // A crop covering the right half of the source, whose center is at source
  // x = 0.75.
  const rightHalf: PixelRect = { x: 500, y: 0, width: 500, height: 1000 }

  it("treats a centered focal point as the center of the crop", () => {
    // A centered focal point becomes the source-relative center of the crop, not
    // the center of the source. This is the fix: { 0.5, 0.5 } means crop center.
    const hotspot = focalPointToHotspot(
      { x: 0.5, y: 0.5 },
      rightHalf,
      source,
      hotspotAt(0, 0)
    )
    expect(hotspot.x).toBeCloseTo(0.75)
    expect(hotspot.y).toBeCloseTo(0.5)
  })

  it("re-projects so the builder renders the focal point at the crop center", () => {
    // The image URL builder computes fp-x = (hotspot.x - crop.left) / cropWidth.
    // A centered focal point must yield fp-x = 0.5.
    const hotspot = focalPointToHotspot(
      { x: 0.5, y: 0.5 },
      rightHalf,
      source,
      hotspotAt(0, 0)
    )
    const cropLeft = rightHalf.x / source.width
    const cropWidth = rightHalf.width / source.width
    expect((hotspot.x - cropLeft) / cropWidth).toBeCloseTo(0.5)
  })

  it("round-trips a focal point through a hotspot and back", () => {
    const hotspot = focalPointToHotspot(
      { x: 0.3, y: 0.7 },
      rightHalf,
      source,
      hotspotAt(0, 0)
    )
    const point = hotspotToFocalPoint(hotspot, rightHalf, source)
    expect(point.x).toBeCloseTo(0.3)
    expect(point.y).toBeCloseTo(0.7)
  })

  it("clamps a hotspot that sits outside the crop to the nearest edge", () => {
    // Source x = 0.2 is left of the right-half crop, so it maps below 0 and
    // clamps to the crop's near edge.
    const point = hotspotToFocalPoint(hotspotAt(0.2, 0.5), rightHalf, source)
    expect(point.x).toBe(0)
    expect(point.y).toBeCloseTo(0.5)
  })

  it("preserves a focal region that already fits inside the crop", () => {
    expect(
      focalPointToHotspot(
        { x: 0.5, y: 0.5 },
        rightHalf,
        source,
        hotspotAt(0, 0)
      )
    ).toMatchObject({
      _type: "sanity.imageHotspot",
      width: 0.4,
      height: 0.4,
    })
  })

  it("shrinks a whole-image focal region to fit the crop", () => {
    // A 1×1 region spans the whole source, larger than any real crop. Clamping it
    // to the crop's source-relative size keeps the focal ellipse inside the crop.
    const quarter: PixelRect = { x: 250, y: 250, width: 500, height: 500 }
    const wholeImage: ImageHotspot = {
      _type: "sanity.imageHotspot",
      x: 0.5,
      y: 0.5,
      width: 1,
      height: 1,
    }
    const hotspot = focalPointToHotspot(
      { x: 0.5, y: 0.5 },
      quarter,
      source,
      wholeImage
    )
    expect(hotspot.width).toBeCloseTo(0.5)
    expect(hotspot.height).toBeCloseTo(0.5)
  })
})
