import { type ImageCrop, type ImageHotspot } from "sanity"
import { clamp, clampRatio, nearestRatio } from "./utils"
import {
  type AspectRatio,
  type AspectRatioRange,
  type Dimensions,
} from "./types"

/**
 * A crop rectangle in source-image pixels, with `(0, 0)` at the top-left. Every
 * function in this module keeps the rectangle inside the image bounds:
 * `[0, source.width]` by `[0, source.height]`.
 */
export type PixelRect = {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Which edge or corner is being dragged. Each component is `-1`, `0`, or `+1`.
 *
 * On each axis, `+1` drags the far edge (east or south) and `-1` drags the near
 * edge (west or north). `0` leaves the axis free: it holds its current size while
 * the ratio stays in range, and grows evenly from the center when the ratio is
 * forced to change. Corners set both components (`se` is `{ dx: 1, dy: 1 }`);
 * sides set one and leave the other `0` (`e` is `{ dx: 1, dy: 0 }`).
 */
export type Direction = { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }

/**
 * The smallest a crop edge can shrink to during a drag, in source pixels. This
 * only stops the rectangle collapsing to nothing; warning about an undersized
 * crop is handled separately by the dimension checks.
 */
const MIN_CROP_SIZE = 24

/**
 * The aspect-ratio range used when a field sets no constraint. It is wide enough
 * to admit any real image ratio, so the editor behaves as a free-form cropper.
 */
export const FREE_ASPECT_RATIO_RANGE: AspectRatioRange = {
  min: 0.01,
  max: 100,
}

/**
 * Resolve an author-supplied {@link AspectRatio} into the internal form the crop
 * math uses: an `aspectRatioRange`, plus `snapRatios` for the array form.
 *
 * A single number becomes a range with equal bounds. A range passes through
 * unchanged. An array becomes a range spanning its smallest and largest members,
 * with its values sorted and de-duplicated as `snapRatios`. `undefined` falls
 * back to {@link FREE_ASPECT_RATIO_RANGE}.
 */
export const resolveAspectRatio = (
  input: AspectRatio | undefined
): { aspectRatioRange: AspectRatioRange; snapRatios?: number[] } => {
  if (input === undefined) {
    return { aspectRatioRange: FREE_ASPECT_RATIO_RANGE }
  }
  if (typeof input === "number") {
    return { aspectRatioRange: { min: input, max: input } }
  }
  if (Array.isArray(input)) {
    const snapRatios = Array.from(new Set(input)).toSorted((a, b) => a - b)
    return {
      aspectRatioRange: {
        min: Math.min(...snapRatios),
        max: Math.max(...snapRatios),
      },
      snapRatios,
    }
  }
  return { aspectRatioRange: { min: input.min, max: input.max } }
}

/**
 * The largest centered crop the source can hold at the given aspect ratio. Fills
 * the full width when possible, and falls back to the full height when the image
 * is too short to fit that width.
 */
const largestRectForRatio = (source: Dimensions, ratio: number): PixelRect => {
  let width = source.width
  let height = width / ratio
  if (height > source.height) {
    height = source.height
    width = height * ratio
  }
  return {
    x: (source.width - width) / 2,
    y: (source.height - height) / 2,
    width,
    height,
  }
}

/**
 * The crop shown when an image is first uploaded: the largest crop that fits the
 * aspect-ratio constraint.
 *
 * With `snapRatios`, it targets the allowed ratio nearest the image's natural
 * ratio. Otherwise it clamps the natural ratio into the range, which uses the
 * whole image when that ratio already fits.
 */
export const defaultCrop = (
  source: Dimensions,
  range: AspectRatioRange,
  snapRatios?: number[]
): PixelRect => {
  const sourceRatio = source.width / source.height
  const ratio = snapRatios
    ? nearestRatio(sourceRatio, snapRatios)
    : clampRatio(sourceRatio, range)
  return largestRectForRatio(source, ratio)
}

/** Move a crop without resizing it, keeping it inside the image. */
export const moveRect = (
  rect: PixelRect,
  deltaX: number,
  deltaY: number,
  source: Dimensions
): PixelRect => ({
  ...rect,
  x: clamp(rect.x + deltaX, 0, source.width - rect.width),
  y: clamp(rect.y + deltaY, 0, source.height - rect.height),
})

/**
 * Resize a crop by dragging an edge or corner toward `pointer`, in the direction
 * `dir` (see {@link Direction}). `pointer` is in source pixels.
 *
 * The opposite edge stays fixed while the dragged edge follows the pointer; on a
 * free axis, the midpoint stays fixed instead. A side handle fixes the dragged
 * dimension from the pointer and holds the perpendicular dimension at its current
 * size, so the ratio follows the dragged edge. The perpendicular axis only
 * changes when that ratio is clamped to the range or snapped to a different
 * member, at which point it grows centered to realize the new ratio. The result
 * is constrained in this order: it stays inside the image, its ratio stays within
 * `range`, and it does not shrink below the minimum size. Width is computed first
 * and then reconciled against the available height, so the result is always a
 * valid rectangle.
 *
 * Options:
 * - `lockRatio` holds the crop's current ratio, even on a corner. Without it, a
 *   corner takes its ratio from the pointer.
 * - `mirror` anchors both axes to the center, so the crop grows evenly outward.
 * - `snapRatios` snaps the ratio to its nearest member on every move, so a
 *   snapping crop never shows an in-between ratio mid-drag.
 *
 * With no options, a corner drag is the standard opposite-corner resize.
 */
export const resize = (
  rect: PixelRect,
  dir: Direction,
  pointer: { x: number; y: number },
  source: Dimensions,
  range: AspectRatioRange,
  opts: { lockRatio?: boolean; mirror?: boolean; snapRatios?: number[] } = {}
): PixelRect => {
  const { lockRatio = false, mirror = false, snapRatios } = opts

  // An axis is "centered" when the crop grows evenly outward from its midpoint:
  // either `dir` leaves the axis free (component 0), or `mirror` centers both
  // axes regardless of direction.
  const centeredX = mirror || dir.dx === 0
  const centeredY = mirror || dir.dy === 0

  // The anchor is the point that stays fixed as the crop resizes: a `+1` axis
  // anchors its near edge, a `-1` axis its far edge, a centered axis its midpoint.
  const anchorX = centeredX
    ? rect.x + rect.width / 2
    : dir.dx > 0
      ? rect.x
      : rect.x + rect.width
  const anchorY = centeredY
    ? rect.y + rect.height / 2
    : dir.dy > 0
      ? rect.y
      : rect.y + rect.height

  const pointerX = clamp(pointer.x, 0, source.width)
  const pointerY = clamp(pointer.y, 0, source.height)

  // Room available from the anchor to the image edge, in the drag direction. A
  // centered axis grows both ways at once, so it is capped at twice the distance
  // to the nearer edge.
  const availWidth = centeredX
    ? 2 * Math.min(anchorX, source.width - anchorX)
    : dir.dx > 0
      ? source.width - anchorX
      : anchorX
  const availHeight = centeredY
    ? 2 * Math.min(anchorY, source.height - anchorY)
    : dir.dy > 0
      ? source.height - anchorY
      : anchorY

  // The size the pointer implies on each axis. A centered axis extends to both
  // sides of the anchor, so it is twice the pointer's distance from it.
  const desiredWidth = (centeredX ? 2 : 1) * Math.abs(pointerX - anchorX)
  const desiredHeight = (centeredY ? 2 : 1) * Math.abs(pointerY - anchorY)

  // The ratio the gesture implies.
  // - lockRatio (or a fixed ratio) holds the crop's current ratio.
  // - A side handle fixes one dimension from the pointer and holds the
  //   perpendicular dimension at its current size, so the ratio follows the
  //   dragged edge. When that ratio leaves the range or snaps to a different
  //   member, the perpendicular axis adjusts to realize it.
  // - A corner reads the ratio from the pointer on both axes.
  const askedRatio = lockRatio
    ? rect.width / rect.height
    : dir.dx === 0
      ? desiredHeight === 0
        ? range.max
        : rect.width / desiredHeight
      : dir.dy === 0
        ? desiredWidth / rect.height
        : desiredHeight === 0
          ? range.max
          : desiredWidth / desiredHeight
  // With a snap set, snap to the nearest allowed ratio on every move so the crop
  // never shows an in-between ratio. Otherwise clamp the ratio to the range.
  const ratio = snapRatios
    ? nearestRatio(askedRatio, snapRatios)
    : clampRatio(askedRatio, range)

  // Derive the width first. An active horizontal axis follows the pointer
  // directly; when only the vertical axis is active, the width comes from the
  // pointer's height via the ratio.
  const targetWidth = dir.dx !== 0 ? desiredWidth : desiredHeight * ratio

  let width = Math.min(targetWidth, availWidth)
  let height = width / ratio
  if (height > availHeight) {
    height = availHeight
    width = height * ratio
  }

  // Apply the minimum size without breaking the ratio or the bounds. The minimum
  // is itself capped by the available space, so a valid rectangle always exists,
  // even for a tiny image.
  const minWidth = Math.min(MIN_CROP_SIZE, availWidth, availHeight * ratio)
  if (width < minWidth) {
    width = minWidth
    height = width / ratio
  }

  // Place the top-left corner relative to the anchors: a centered axis stays
  // centered on its anchor; a `+1` axis grows away from the anchor, a `-1` axis
  // grows back toward it.
  return {
    x: centeredX ? anchorX - width / 2 : dir.dx > 0 ? anchorX : anchorX - width,
    y: centeredY
      ? anchorY - height / 2
      : dir.dy > 0
        ? anchorY
        : anchorY - height,
    width,
    height,
  }
}

/**
 * Re-fit a rectangle to an exact aspect ratio, keeping its center and staying
 * inside the image. It only shrinks the longer axis to reach the ratio, so the
 * result still fits the source, then clamps the position back into bounds.
 *
 * Used to bring a stored crop onto an allowed ratio when the editor opens. During
 * a drag, {@link resize} does the snapping instead, since it keeps the dragged
 * edge's anchor fixed.
 */
export const applyRatio = (
  rect: PixelRect,
  ratio: number,
  source: Dimensions
): PixelRect => {
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  const width = Math.min(rect.width, rect.height * ratio)
  const height = width / ratio
  return {
    x: clamp(centerX - width / 2, 0, source.width - width),
    y: clamp(centerY - height / 2, 0, source.height - height),
    width,
    height,
  }
}

/**
 * Convert a pointer in client coordinates into a focal-point coordinate in
 * `[0, 1]`, measured against the rendered image box and clamped to that box.
 *
 * This is the focal point's coordinate space, the inverse of positioning the
 * marker at `hotspot * displaySize`. It is separate from the source-pixel crop
 * geometry above.
 */
export const toNormalizedPoint = (
  pointer: { x: number; y: number },
  box: { left: number; top: number; width: number; height: number }
): { x: number; y: number } => ({
  x: clamp((pointer.x - box.left) / box.width, 0, 1),
  y: clamp((pointer.y - box.top) / box.height, 0, 1),
})

/**
 * Convert a stored hotspot into a focal point relative to the crop, in `[0, 1]`,
 * where `{ 0.5, 0.5 }` is the center of the crop. The stored x/y are
 * source-relative, so this re-projects them into the cropped frame the same way
 * the image URL builder does, then clamps the result so the point stays inside
 * the crop.
 */
export const hotspotToFocalPoint = (
  hotspot: { x: number; y: number },
  rect: PixelRect,
  source: Dimensions
): { x: number; y: number } => ({
  x: clamp((hotspot.x * source.width - rect.x) / rect.width, 0, 1),
  y: clamp((hotspot.y * source.height - rect.y) / rect.height, 0, 1),
})

/**
 * Convert a crop-relative focal point back into a source-relative hotspot, the
 * form Sanity stores and the image URL builder reads. The builder re-projects
 * these x/y through the crop, so a centered focal point renders at the center of
 * the cropped image. `base` supplies the hotspot's `_type` and the focal
 * region's size.
 *
 * The focal region (width/height) is clamped to the crop's source-relative size.
 * The image URL builder ignores these dimensions, but other tools draw them as an
 * ellipse, and a region larger than the crop would spill past the cropped image.
 * Sanity's whole-image default of 1 always exceeds a real crop, so it is shrunk
 * to fit the crop; a region already inside the crop is left unchanged, and an
 * uncropped full-frame image keeps its region as-is.
 */
export const focalPointToHotspot = (
  point: { x: number; y: number },
  rect: PixelRect,
  source: Dimensions,
  base: ImageHotspot
): ImageHotspot => ({
  ...base,
  x: (rect.x + point.x * rect.width) / source.width,
  y: (rect.y + point.y * rect.height) / source.height,
  width: Math.min(base.width, rect.width / source.width),
  height: Math.min(base.height, rect.height / source.height),
})

/**
 * Convert a pixel crop rectangle into Sanity's non-destructive crop format:
 * fractional insets from each edge of the source. Stored on the image value, so
 * any consumer using the image URL builder renders the crop automatically.
 */
export const pixelRectToCrop = (
  rect: PixelRect,
  source: Dimensions
): ImageCrop => ({
  _type: "sanity.imageCrop",
  top: Math.max(0, rect.y / source.height),
  left: Math.max(0, rect.x / source.width),
  right: Math.max(0, (source.width - rect.x - rect.width) / source.width),
  bottom: Math.max(0, (source.height - rect.y - rect.height) / source.height),
})

/** Convert Sanity's fractional crop insets back into a pixel rectangle. */
export const cropToPixelRect = (
  crop: ImageCrop,
  source: Dimensions
): PixelRect => ({
  x: crop.left * source.width,
  y: crop.top * source.height,
  width: (1 - crop.left - crop.right) * source.width,
  height: (1 - crop.top - crop.bottom) * source.height,
})

/** The cropped image's pixel size, rounded to whole pixels for display and comparison. */
export const croppedDimensions = (rect: PixelRect): Dimensions => ({
  width: Math.round(rect.width),
  height: Math.round(rect.height),
})

/** Whether dimensions clear a minimum on both axes. */
export const dimensionsAtLeast = (
  dimensions: Dimensions,
  threshold: Dimensions
) =>
  dimensions.width >= threshold.width && dimensions.height >= threshold.height

/**
 * Format an aspect ratio for display. Prefers a whole-number `w:h` label with a
 * small denominator (e.g. `16:9`), and falls back to a decimal (e.g. `2.35:1`)
 * when no small pair is close enough. The denominator cap is what keeps 2.35
 * from rendering as `47:20`.
 */
export const formatAspectRatio = (ratio: number): string => {
  for (let height = 1; height <= 16; height++) {
    const width = ratio * height
    const rounded = Math.round(width)
    if (rounded >= 1 && Math.abs(width - rounded) < 0.02) {
      return `${rounded}:${height}`
    }
  }
  return `${ratio.toFixed(2)}:1`
}
