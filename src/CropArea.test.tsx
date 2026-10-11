import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen } from "@testing-library/react"
import { CropArea } from "./CropArea"
import { FREE_ASPECT_RATIO_RANGE, moveRect, type PixelRect } from "./cropMath"
import { renderWithUi } from "./test/render"

const source = { width: 1200, height: 800 }
const imageUrl = "https://cdn.example/image.jpg"
const range = FREE_ASPECT_RATIO_RANGE

// Fraction of the source moved or resized per arrow press, matching KEYBOARD_STEP
// in CropArea.
const STEP = 0.02

// A starting crop inset from every edge, so arrow moves in any direction stay
// inside the source without clamping.
const rect: PixelRect = { x: 300, y: 200, width: 400, height: 300 }

// The crop surface only mounts when scale > 0, and scale is 0 until the frame
// width is measured by a ResizeObserver. The global stub in test/setup.ts never
// fires, so install one that synchronously reports a 600px content width when
// observe() is called. With a 1200-wide source that yields scale 0.5, which
// mounts the crop group and runs the keyboard handler.
const previousResizeObserver = globalThis.ResizeObserver

beforeEach(() => {
  type ResizeCallback = (
    entries: Array<{ contentRect: { width: number } }>
  ) => void
  class SyncResizeObserver {
    callback: ResizeCallback
    constructor(callback: ResizeCallback) {
      this.callback = callback
    }
    observe() {
      this.callback([{ contentRect: { width: 600 } }])
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", SyncResizeObserver)
})

afterEach(() => {
  vi.stubGlobal("ResizeObserver", previousResizeObserver)
})

const getGroup = () => screen.getByRole("group", { name: /Crop selection/ })

describe("CropArea", () => {
  describe("arrow keys move the crop", () => {
    const stepX = source.width * STEP
    const stepY = source.height * STEP

    const cases: Array<{ key: string; deltaX: number; deltaY: number }> = [
      { key: "ArrowRight", deltaX: stepX, deltaY: 0 },
      { key: "ArrowLeft", deltaX: -stepX, deltaY: 0 },
      { key: "ArrowUp", deltaX: 0, deltaY: -stepY },
      { key: "ArrowDown", deltaX: 0, deltaY: stepY },
    ]

    cases.forEach(({ key, deltaX, deltaY }) => {
      it(`translates the crop on ${key} with width unchanged`, () => {
        const onChange = vi.fn<(rect: PixelRect) => void>()
        renderWithUi(
          <CropArea
            imageUrl={imageUrl}
            sourceDimensions={source}
            range={range}
            rect={rect}
            onChange={onChange}
          />
        )

        fireEvent.keyDown(getGroup(), { key })

        expect(onChange).toHaveBeenCalledTimes(1)
        expect(onChange).toHaveBeenCalledWith(
          moveRect(rect, deltaX, deltaY, source)
        )
      })
    })
  })

  describe("Shift+arrow resizes with a locked ratio", () => {
    const cases: Array<{ key: string; grows: boolean }> = [
      { key: "ArrowRight", grows: true },
      { key: "ArrowDown", grows: true },
      { key: "ArrowLeft", grows: false },
      { key: "ArrowUp", grows: false },
    ]

    cases.forEach(({ key, grows }) => {
      it(`${grows ? "grows" : "shrinks"} the crop on Shift+${key}`, () => {
        const onChange = vi.fn<(rect: PixelRect) => void>()
        renderWithUi(
          <CropArea
            imageUrl={imageUrl}
            sourceDimensions={source}
            range={range}
            rect={rect}
            onChange={onChange}
          />
        )

        fireEvent.keyDown(getGroup(), { key, shiftKey: true })

        expect(onChange).toHaveBeenCalledTimes(1)
        const next = onChange.mock.calls[0]?.[0]
        if (!next) {
          throw new Error("expected onChange to receive the resized rect")
        }
        expect(Math.sign(next.width - rect.width)).toBe(grows ? 1 : -1)
        expect(next.width / next.height).toBeCloseTo(rect.width / rect.height)
      })
    })
  })

  it("ignores a non-arrow key", () => {
    const onChange = vi.fn<(rect: PixelRect) => void>()
    renderWithUi(
      <CropArea
        imageUrl={imageUrl}
        sourceDimensions={source}
        range={range}
        rect={rect}
        onChange={onChange}
      />
    )

    fireEvent.keyDown(getGroup(), { key: "a" })

    expect(onChange).not.toHaveBeenCalled()
  })

  describe("render structure", () => {
    it("renders the crop group and its eight resize handles", () => {
      const { container } = renderWithUi(
        <CropArea
          imageUrl={imageUrl}
          sourceDimensions={source}
          range={range}
          rect={rect}
          onChange={vi.fn<(rect: PixelRect) => void>()}
        />
      )

      const group = getGroup()
      // The handles are the group's direct element children, after the thirds
      // guide overlay.
      const directChildren = Array.from(group.children)
      const handles = directChildren.filter((child) =>
        child.getAttribute("style")?.includes("translate(-50%, -50%)")
      )
      expect(handles).toHaveLength(8)
      expect(container.querySelectorAll('[title="Focal point"]')).toHaveLength(
        0
      )
    })

    it("renders the focal marker when focalPoint and onFocalPointChange are given", () => {
      renderWithUi(
        <CropArea
          imageUrl={imageUrl}
          sourceDimensions={source}
          range={range}
          rect={rect}
          onChange={vi.fn<(rect: PixelRect) => void>()}
          focalPoint={{ x: 0.5, y: 0.5 }}
          onFocalPointChange={vi.fn<
            (point: { x: number; y: number }) => void
          >()}
        />
      )

      expect(screen.getByTitle("Focal point")).toBeInTheDocument()
    })

    it("omits the focal marker without focal props", () => {
      renderWithUi(
        <CropArea
          imageUrl={imageUrl}
          sourceDimensions={source}
          range={range}
          rect={rect}
          onChange={vi.fn<(rect: PixelRect) => void>()}
        />
      )

      expect(screen.queryByTitle("Focal point")).not.toBeInTheDocument()
    })
  })
})
