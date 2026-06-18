import { useCallback, useRef } from "react"
import { useContentWidth } from "./useContentWidth"
import {
  type Direction,
  moveRect,
  type PixelRect,
  resize,
  toNormalizedPoint,
} from "./cropMath"
import { type AspectRatioRange, type Dimensions } from "./types"

type CropAreaProps = {
  imageUrl: string
  sourceDimensions: Dimensions
  range: AspectRatioRange
  /** Ratios to snap to while dragging; absent means continuous (free) dragging. */
  snapRatios?: number[]
  /** The current crop, in source-pixel coordinates. */
  rect: PixelRect
  onChange: (rect: PixelRect) => void
  /**
   * The current focal point, relative to the crop, in `[0, 1]`. `{ 0.5, 0.5 }`
   * is the center of the crop. Pass this with `onFocalPointChange` to show the
   * draggable marker.
   */
  focalPoint?: { x: number; y: number }
  onFocalPointChange?: (point: { x: number; y: number }) => void
  /** The tallest the image is allowed to get, in CSS pixels. */
  maxHeight?: number
}

type Drag =
  | {
      mode: "move"
      startRect: PixelRect
      startPointer: { x: number; y: number }
    }
  | { mode: "resize"; dir: Direction; startRect: PixelRect }

/**
 * The eight resize handles, as direction vectors. Four corners are drawn as
 * dots and four sides as bars. Each handle's position, shape, and cursor are
 * derived from its vector (see {@link Handle}).
 */
const HANDLES: Direction[] = [
  { dx: -1, dy: -1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
]

const HANDLE_SIZE = 14 // corner dot diameter, px
const BAR_LENGTH = 22 // side bar long edge, px
const BAR_THICKNESS = 8 // side bar short edge, px
const HOTSPOT_SIZE = 22 // focal-point marker diameter, px
const KEYBOARD_STEP = 0.02 // fraction of the source moved or resized per arrow press

const CROP_ARIA_LABEL =
  "Crop selection. Use arrow keys to move, hold Shift with arrow keys to resize."

/**
 * The pointer-drag lifecycle, built on pointer capture. The crop frame, the
 * resize handles, and the hotspot marker all use this hook. It works for touch
 * as well as mouse.
 *
 * `start` captures the pointer and stores the caller's drag state. `onMove` runs
 * on every move during a drag. Cleanup is bound to lostpointercapture rather
 * than pointerup because a touch gesture often ends with a pointercancel
 * instead, on scroll, palm rejection, or context menu. lostpointercapture fires
 * after all of those, so a canceled touch ends the drag rather than leaving it
 * active.
 */
function usePointerDrag<T>(
  onMove: (state: T, event: React.PointerEvent) => void
) {
  const dragRef = useRef<T | null>(null)

  const start = useCallback(
    (
      event: React.PointerEvent,
      state: T,
      { stopPropagation = false }: { stopPropagation?: boolean } = {}
    ) => {
      event.preventDefault()
      if (stopPropagation) {
        // Prevent a press on a handle or marker from also starting a crop move
        // on the frame underneath it.
        event.stopPropagation()
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = state
    },
    []
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const state = dragRef.current
      if (state === null) {
        return
      }
      onMove(state, event)
    },
    [onMove]
  )

  const handleLostPointerCapture = useCallback(() => {
    dragRef.current = null
  }, [])

  return { start, handlePointerMove, handleLostPointerCapture }
}

/**
 * The interactive cropping surface. It shows a scaled-down preview of the source
 * image with a draggable, ratio-constrained crop rectangle, and a focal-point
 * marker when enabled. The geometry is computed in source-pixel space (see
 * cropMath) and only scaled for display, so the result is independent of display
 * resolution.
 */
export const CropArea = ({
  imageUrl,
  sourceDimensions,
  range,
  snapRatios,
  rect,
  onChange,
  focalPoint,
  onFocalPointChange,
  maxHeight = 460,
}: CropAreaProps) => {
  const frameRef = useRef<HTMLDivElement>(null)
  const imageBoxRef = useRef<HTMLDivElement>(null)
  const frameWidth = useContentWidth(frameRef)

  const scale = displayScale(sourceDimensions, frameWidth, maxHeight)
  const displayWidth = sourceDimensions.width * scale
  const displayHeight = sourceDimensions.height * scale

  const cropBox = {
    left: rect.x * scale,
    top: rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  }

  const pointerToSource = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const box = imageBoxRef.current?.getBoundingClientRect()
      if (!box || scale === 0) {
        return { x: 0, y: 0 }
      }
      return {
        x: (event.clientX - box.left) / scale,
        y: (event.clientY - box.top) / scale,
      }
    },
    [scale]
  )

  const pointerToFocal = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const box = imageBoxRef.current?.getBoundingClientRect()
      if (!box || cropBox.width === 0 || cropBox.height === 0) {
        return { x: 0, y: 0 }
      }
      return toNormalizedPoint(
        { x: event.clientX, y: event.clientY },
        {
          left: box.left + cropBox.left,
          top: box.top + cropBox.top,
          width: cropBox.width,
          height: cropBox.height,
        }
      )
    },
    [cropBox.left, cropBox.top, cropBox.width, cropBox.height]
  )

  const onCropMove = useCallback(
    (drag: Drag, event: React.PointerEvent) => {
      const pointer = pointerToSource(event)
      const next =
        drag.mode === "move"
          ? moveRect(
              drag.startRect,
              pointer.x - drag.startPointer.x,
              pointer.y - drag.startPointer.y,
              sourceDimensions
            )
          : // Modifier keys are read at move time so they can change mid-drag.
            // Shift locks the ratio; Option/Alt resizes from center. With
            // snapRatios, the crop snaps to the nearest allowed ratio.
            resize(drag.startRect, drag.dir, pointer, sourceDimensions, range, {
              lockRatio: event.shiftKey,
              mirror: event.altKey,
              snapRatios,
            })
      onChange(next)
    },
    [onChange, pointerToSource, range, snapRatios, sourceDimensions]
  )

  const cropDrag = usePointerDrag<Drag>(onCropMove)

  const onFocalMove = useCallback(
    (_active: boolean, event: React.PointerEvent) => {
      if (!onFocalPointChange) {
        return
      }
      onFocalPointChange(pointerToFocal(event))
    },
    [onFocalPointChange, pointerToFocal]
  )

  const focalDrag = usePointerDrag<boolean>(onFocalMove)

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const stepX = sourceDimensions.width * KEYBOARD_STEP
    const stepY = sourceDimensions.height * KEYBOARD_STEP

    if (event.shiftKey) {
      // Shift+Arrow resizes the crop from the south-east corner with the ratio
      // locked, so the north-west corner stays fixed. Vertical steps are scaled
      // by the ratio so one press moves the south edge by a single step. resize
      // applies the bounds, the minimum size, and ratio snapping when snapRatios
      // is set.
      const ratio = rect.width / rect.height
      const widthSteps = new Map<string, number>([
        ["ArrowRight", stepX],
        ["ArrowLeft", -stepX],
        ["ArrowDown", stepY * ratio],
        ["ArrowUp", -stepY * ratio],
      ])
      const widthStep = widthSteps.get(event.key)
      if (widthStep === undefined) {
        return
      }
      event.preventDefault()
      const east = rect.x + rect.width
      const south = rect.y + rect.height
      onChange(
        resize(
          rect,
          { dx: 1, dy: 1 },
          { x: east + widthStep, y: south },
          sourceDimensions,
          range,
          { lockRatio: true, snapRatios }
        )
      )
      return
    }

    const moves = new Map<string, [number, number]>([
      ["ArrowLeft", [-stepX, 0]],
      ["ArrowRight", [stepX, 0]],
      ["ArrowUp", [0, -stepY]],
      ["ArrowDown", [0, stepY]],
    ])
    const delta = moves.get(event.key)
    if (!delta) {
      return
    }
    event.preventDefault()
    onChange(moveRect(rect, delta[0], delta[1], sourceDimensions))
  }

  return (
    <div
      ref={frameRef}
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <div
        ref={imageBoxRef}
        style={{
          position: "relative",
          width: displayWidth,
          height: displayHeight,
          maxWidth: "100%",
        }}
      >
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "fill",
          }}
        />

        {scale > 0 && (
          <>
            {/*
              Darken everything outside the crop with a large box-shadow on a
              rectangle positioned at the crop. The shadow extends far in every
              direction, so the wrapper clips it (overflow: hidden, sized to the
              image box) to keep the darkening within the image and off the rest
              of the dialog. pointerEvents is none, so it does not intercept a
              crop drag.
            */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  ...cropBox,
                  boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
                }}
              />
            </div>

            {/* The frame is unclipped so edge handles stay visible. */}
            {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/prefer-tag-over-role */}
            <div
              role="group"
              aria-label={CROP_ARIA_LABEL}
              tabIndex={0}
              onPointerDown={(event) => {
                cropDrag.start(event, {
                  mode: "move",
                  startRect: rect,
                  startPointer: pointerToSource(event),
                })
              }}
              onPointerMove={cropDrag.handlePointerMove}
              onLostPointerCapture={cropDrag.handleLostPointerCapture}
              onKeyDown={handleKeyDown}
              style={{
                position: "absolute",
                ...cropBox,
                cursor: "move",
                outline: "1px solid rgba(255, 255, 255, 0.9)",
              }}
            >
              <ThirdsGuides />
              {HANDLES.map((dir) => (
                <Handle
                  key={`${dir.dx},${dir.dy}`}
                  dir={dir}
                  onPointerDown={(event) => {
                    cropDrag.start(
                      event,
                      { mode: "resize", dir, startRect: rect },
                      { stopPropagation: true }
                    )
                  }}
                  onPointerMove={cropDrag.handlePointerMove}
                  onLostPointerCapture={cropDrag.handleLostPointerCapture}
                />
              ))}
            </div>
            {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/prefer-tag-over-role */}

            {focalPoint && onFocalPointChange && (
              <HotspotMarker
                left={cropBox.left + focalPoint.x * cropBox.width}
                top={cropBox.top + focalPoint.y * cropBox.height}
                onPointerDown={(event) => {
                  focalDrag.start(event, true, { stopPropagation: true })
                }}
                onPointerMove={focalDrag.handlePointerMove}
                onLostPointerCapture={focalDrag.handleLostPointerCapture}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Display pixels per source pixel: the largest scale that fits the image within
 * both the available width and the height cap. Zero before the frame has been
 * measured.
 */
const displayScale = (
  sourceDimensions: Dimensions,
  frameWidth: number,
  maxHeight: number
) => {
  if (frameWidth === 0) {
    return 0
  }
  return Math.min(
    frameWidth / sourceDimensions.width,
    maxHeight / sourceDimensions.height
  )
}

const ThirdsGuides = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      backgroundImage: `
          linear-gradient(to right, transparent 33.33%, rgba(255, 255, 255, 0.35) 33.33%, rgba(255, 255, 255, 0.35) calc(33.33% + 1px), transparent calc(33.33% + 1px), transparent 66.66%, rgba(255, 255, 255, 0.35) 66.66%, rgba(255, 255, 255, 0.35) calc(66.66% + 1px), transparent calc(66.66% + 1px)),
          linear-gradient(to bottom, transparent 33.33%, rgba(255, 255, 255, 0.35) 33.33%, rgba(255, 255, 255, 0.35) calc(33.33% + 1px), transparent calc(33.33% + 1px), transparent 66.66%, rgba(255, 255, 255, 0.35) 66.66%, rgba(255, 255, 255, 0.35) calc(66.66% + 1px), transparent calc(66.66% + 1px))
        `,
    }}
  />
)

const cursorForDirection = (dir: Direction): string => {
  if (dir.dx === 0) {
    return "ns-resize"
  }
  if (dir.dy === 0) {
    return "ew-resize"
  }
  return dir.dx === dir.dy ? "nwse-resize" : "nesw-resize"
}

/**
 * A single resize handle, derived from its {@link Direction}. Corners (both
 * components non-zero) are dots. Sides (one component zero) are bars along their
 * edge. Each handle is positioned at 0/50/100% and translated back by half its
 * size, so it is centered on the crop edge.
 */
const Handle = ({
  dir,
  onPointerDown,
  onPointerMove,
  onLostPointerCapture,
}: {
  dir: Direction
  onPointerDown: (event: React.PointerEvent) => void
  onPointerMove: (event: React.PointerEvent) => void
  onLostPointerCapture: (event: React.PointerEvent) => void
}) => {
  const isCorner = dir.dx !== 0 && dir.dy !== 0
  const horizontalBar = dir.dx === 0
  const width = isCorner
    ? HANDLE_SIZE
    : horizontalBar
      ? BAR_LENGTH
      : BAR_THICKNESS
  const height = isCorner
    ? HANDLE_SIZE
    : horizontalBar
      ? BAR_THICKNESS
      : BAR_LENGTH
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onLostPointerCapture={onLostPointerCapture}
      style={{
        position: "absolute",
        left: `${(dir.dx + 1) * 50}%`,
        top: `${(dir.dy + 1) * 50}%`,
        transform: "translate(-50%, -50%)",
        width,
        height,
        borderRadius: isCorner ? "50%" : BAR_THICKNESS / 2,
        background: "#fff",
        boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.4)",
        cursor: cursorForDirection(dir),
        touchAction: "none",
      }}
    />
  )
}

const HotspotMarker = ({
  left,
  top,
  onPointerDown,
  onPointerMove,
  onLostPointerCapture,
}: {
  left: number
  top: number
  onPointerDown: (event: React.PointerEvent) => void
  onPointerMove: (event: React.PointerEvent) => void
  onLostPointerCapture: (event: React.PointerEvent) => void
}) => (
  <div
    title="Focal point"
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onLostPointerCapture={onLostPointerCapture}
    style={{
      position: "absolute",
      left,
      top,
      transform: "translate(-50%, -50%)",
      width: HOTSPOT_SIZE,
      height: HOTSPOT_SIZE,
      borderRadius: "50%",
      border: "2px solid #fff",
      background: "rgba(255, 255, 255, 0.2)",
      boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.5), 0 0 6px rgba(0, 0, 0, 0.5)",
      cursor: "grab",
      touchAction: "none",
    }}
  >
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: 4,
        height: 4,
        borderRadius: "50%",
        background: "#fff",
        boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.5)",
      }}
    />
  </div>
)
