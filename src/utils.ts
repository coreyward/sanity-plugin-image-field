import {
  type AspectRatio,
  type AspectRatioRange,
  type MinimumDimensions,
} from "./types"

/**
 * Validate an authored {@link AspectRatio}, throwing an error when the
 * constraint is invalid. A single ratio must be finite and positive. An array
 * must be non-empty with every member finite and positive. A range adds checks
 * that min and max are finite, positive, and ordered.
 */
export const validateAspectRatio = (input: AspectRatio): void => {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input <= 0) {
      throw new Error("aspectRatio must be a finite number greater than 0.")
    }
    return
  }

  if (Array.isArray(input)) {
    if (input.length === 0) {
      throw new Error("aspectRatio must not be an empty array.")
    }
    if (input.some((ratio) => !Number.isFinite(ratio) || ratio <= 0)) {
      throw new Error(
        "aspectRatio array values must be finite numbers greater than 0."
      )
    }
    return
  }

  if (!Number.isFinite(input.min) || !Number.isFinite(input.max)) {
    throw new Error("aspectRatio min/max must be finite numbers.")
  }
  if (input.min <= 0 || input.max <= 0) {
    throw new Error("aspectRatio min and max must be greater than 0.")
  }
  if (input.max < input.min) {
    throw new Error("aspectRatio max must be greater than or equal to min.")
  }
}

/**
 * Validate an authored {@link MinimumDimensions}, throwing an error when it is
 * invalid. At least one axis must be set, and every axis that is set must be
 * finite and positive. `name` is the option name used in the error message.
 */
export const validateMinimumDimensions = (
  name: string,
  { width, height }: MinimumDimensions
): void => {
  if (width === undefined && height === undefined) {
    throw new Error(`${name} must set width, height, or both.`)
  }
  const axes = [
    ["width", width],
    ["height", height],
  ] as const
  for (const [axis, size] of axes) {
    if (size !== undefined && (!Number.isFinite(size) || size <= 0)) {
      throw new Error(
        `${name}.${axis} must be a finite number greater than 0. Leave out an axis to skip checking it.`
      )
    }
  }
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export const clampRatio = (ratio: number, range: AspectRatioRange) =>
  clamp(ratio, range.min, range.max)

/**
 * The member of `ratios` closest to `ratio`. Snaps a freely-dragged crop to one
 * of the allowed ratios. `ratios` must be non-empty.
 */
export const nearestRatio = (ratio: number, ratios: number[]): number =>
  ratios.reduce((best, candidate) =>
    Math.abs(candidate - ratio) < Math.abs(best - ratio) ? candidate : best
  )
