import { describe, expect, it } from "vitest"
import { clampRatio, nearestRatio, validateAspectRatio } from "./utils"
import { type AspectRatioRange } from "./types"

const RANGE: AspectRatioRange = { min: 4 / 3, max: 16 / 9 }

describe("validateAspectRatio", () => {
  describe("single number", () => {
    it("accepts a finite, positive ratio", () => {
      expect(() => validateAspectRatio(16 / 9)).not.toThrow()
    })

    it("rejects a non-finite or non-positive ratio", () => {
      expect(() => validateAspectRatio(0)).toThrow(
        "aspectRatio must be a finite number greater than 0."
      )
      expect(() => validateAspectRatio(-1)).toThrow(
        "aspectRatio must be a finite number greater than 0."
      )
      expect(() => validateAspectRatio(Infinity)).toThrow(
        "aspectRatio must be a finite number greater than 0."
      )
    })
  })

  describe("array of ratios", () => {
    it("accepts a non-empty list of positive ratios", () => {
      expect(() => validateAspectRatio([16 / 9, 4 / 3, 1])).not.toThrow()
    })

    it("rejects an empty array", () => {
      expect(() => validateAspectRatio([])).toThrow(
        "aspectRatio must not be an empty array."
      )
    })

    it("rejects an array with a non-finite or non-positive member", () => {
      expect(() => validateAspectRatio([1, 0])).toThrow(
        "aspectRatio array values must be finite numbers greater than 0."
      )
      expect(() => validateAspectRatio([1, NaN])).toThrow(
        "aspectRatio array values must be finite numbers greater than 0."
      )
    })
  })

  describe("range", () => {
    it("accepts a valid range", () => {
      expect(() => validateAspectRatio(RANGE)).not.toThrow()
    })

    it("throws when min or max is not finite", () => {
      expect(() => validateAspectRatio({ min: 1, max: Infinity })).toThrow(
        "aspectRatio min/max must be finite numbers."
      )
      expect(() => validateAspectRatio({ min: NaN, max: 2 })).toThrow(
        "aspectRatio min/max must be finite numbers."
      )
    })

    it("throws when min or max is not greater than 0", () => {
      expect(() => validateAspectRatio({ min: 0, max: 2 })).toThrow(
        "aspectRatio min and max must be greater than 0."
      )
    })

    it("throws when max is smaller than min", () => {
      expect(() => validateAspectRatio({ min: 16 / 9, max: 4 / 3 })).toThrow(
        "aspectRatio max must be greater than or equal to min."
      )
    })
  })
})

describe("clampRatio", () => {
  it("passes ratios already inside the range through unchanged", () => {
    expect(clampRatio(1.5, RANGE)).toBeCloseTo(1.5)
  })

  it("clamps to the nearest bound", () => {
    expect(clampRatio(1, RANGE)).toBeCloseTo(RANGE.min)
    expect(clampRatio(3, RANGE)).toBeCloseTo(RANGE.max)
  })
})

describe("nearestRatio", () => {
  const ratios = [1, 4 / 3, 16 / 9]

  it("returns the closest member", () => {
    expect(nearestRatio(1.01, ratios)).toBe(1)
    expect(nearestRatio(1.35, ratios)).toBe(4 / 3)
    expect(nearestRatio(1.7, ratios)).toBe(16 / 9)
  })

  it("snaps values outside the spread to the nearest extreme", () => {
    expect(nearestRatio(0.2, ratios)).toBe(1)
    expect(nearestRatio(5, ratios)).toBe(16 / 9)
  })

  it("returns the sole member of a one-element list", () => {
    expect(nearestRatio(3, [1.5])).toBe(1.5)
  })
})
