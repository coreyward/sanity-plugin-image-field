import { describe, expect, it } from "vitest"
import {
  type ImageRule,
  type ImageValue,
  type Rule,
  type SchemaValidationValue,
  type ValidationContext,
} from "sanity"
import { defineImageField } from "./defineImageField"

/**
 * A chainable stand-in for Sanity's rule builder. Each method returns a fresh
 * node. The real builder also returns new nodes rather than mutating in place,
 * so the mock matches its behavior. This lets the factory's
 * `rule.custom(fn).warning()` calls and a test's `rule.required()` run without
 * a Studio.
 */
const createMockRule = (): Rule =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  ({
    required: createMockRule,
    custom: createMockRule,
    warning: createMockRule,
  }) as unknown as Rule

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const stubRule = (): ImageRule => ({}) as unknown as ImageRule

const runValidation = (
  field: { validation?: SchemaValidationValue },
  context?: ValidationContext
): SchemaValidationValue => {
  const { validation } = field
  if (typeof validation !== "function") {
    throw new Error("expected defineImageField to attach a validation function")
  }
  return validation(createMockRule(), context)
}

/** The validator signature passed to `rule.custom()` by the field factory. */
type CroppedSizeValidator = (value: ImageValue | undefined) => true | string

/**
 * A rule whose `custom(fn)` records `fn` and still chains. The factory's mock
 * rule discards the function it receives, so the derived cropped-size validators
 * never run. This variant keeps each one in `captured`, in the order the factory
 * registered it: the required (error) rule first, the recommended (warning) rule
 * second.
 */
const createCapturingRule = (captured: CroppedSizeValidator[]): Rule => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const rule = {
    required: () => rule,
    warning: () => rule,
    custom: (fn: CroppedSizeValidator) => {
      captured.push(fn)
      return rule
    },
  } as unknown as Rule
  return rule
}

/**
 * Build a field, run its validation with a capturing rule, and hand back the
 * cropped-size validators the factory registered, in registration order.
 */
const captureValidators = (
  params: Parameters<typeof defineImageField>[0]
): CroppedSizeValidator[] => {
  const field = defineImageField(params)
  const { validation } = field
  if (typeof validation !== "function") {
    throw new Error("expected defineImageField to attach a validation function")
  }
  const captured: CroppedSizeValidator[] = []
  validation(createCapturingRule(captured), undefined)
  return captured
}

/**
 * The cropped-size validator at `index`, asserting it exists so a test can
 * invoke it without a possibly-undefined guard.
 */
const validatorAt = (
  params: Parameters<typeof defineImageField>[0],
  index: number
): CroppedSizeValidator => {
  const validator = captureValidators(params)[index]
  if (!validator) {
    throw new Error(`expected a cropped-size validator at index ${index}`)
  }
  return validator
}

/** An image value carrying a given asset reference and no crop. */
const imageValue = (ref: string): ImageValue => ({
  _type: "image",
  asset: { _type: "reference", _ref: ref },
})

const RASTER_REF = "image-a1b2c3d4e5f6-1200x800-jpg"
const SMALL_RASTER_REF = "image-a1b2c3d4e5f6-100x100-jpg"
const SVG_REF = "image-a1b2c3d4e5f6-svg"

describe("defineImageField", () => {
  it("throws for an inverted aspect ratio range", () => {
    expect(() =>
      defineImageField({
        name: "hero",
        aspectRatio: { min: 16 / 9, max: 4 / 3 },
      })
    ).toThrow("aspectRatio max must be greater than or equal to min.")
  })

  it("throws for an empty aspect ratio array", () => {
    expect(() => defineImageField({ name: "hero", aspectRatio: [] })).toThrow(
      "aspectRatio must not be an empty array."
    )
  })

  it("accepts the single-number and array aspect-ratio forms", () => {
    expect(() =>
      defineImageField({ name: "hero", aspectRatio: 16 / 9 })
    ).not.toThrow()
    expect(() =>
      defineImageField({ name: "hero", aspectRatio: [16 / 9, 4 / 3, 1] })
    ).not.toThrow()
  })

  describe("validation", () => {
    it("derives one rule per constraint", () => {
      const field = defineImageField({
        name: "hero",
        requiredDimensions: { width: 800, height: 450 },
        recommendedDimensions: { width: 1600, height: 900 },
      })
      expect(runValidation(field)).toHaveLength(2)
    })

    it("attaches no rules when nothing is constrained", () => {
      const field = defineImageField({ name: "hero" })
      expect(runValidation(field)).toHaveLength(0)
    })

    it("merges a user-supplied rule with the derived rules", () => {
      const userRule = stubRule()
      const field = defineImageField({
        name: "hero",
        requiredDimensions: { width: 800, height: 450 },
        validation: () => userRule,
      })
      const rules = runValidation(field)
      expect(rules).toContain(userRule)
      expect(rules).toHaveLength(2)
    })

    it("accepts a user builder that returns an array of rules", () => {
      const first = stubRule()
      const second = stubRule()
      const field = defineImageField({
        name: "hero",
        validation: () => [first, second],
      })
      const rules = runValidation(field)
      expect(rules).toContain(first)
      expect(rules).toContain(second)
      expect(rules).toHaveLength(2)
    })

    it("threads the validation context to the user builder", () => {
      let received: ValidationContext | undefined
      const field = defineImageField({
        name: "hero",
        validation: (rule, context) => {
          received = context
          return rule.required()
        },
      })
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const context = { sentinel: true } as unknown as ValidationContext
      runValidation(field, context)
      expect(received).toBe(context)
    })
  })

  describe("cropped-size validator", () => {
    it("passes an undefined value", () => {
      const validate = validatorAt(
        { name: "hero", requiredDimensions: { width: 800, height: 450 } },
        0
      )
      expect(validate(undefined)).toBe(true)
    })

    it("passes a value at or above the required size", () => {
      const validate = validatorAt(
        { name: "hero", requiredDimensions: { width: 800, height: 450 } },
        0
      )
      expect(validate(imageValue(RASTER_REF))).toBe(true)
    })

    it("rejects a value below the required size with no suffix", () => {
      const validate = validatorAt(
        { name: "hero", requiredDimensions: { width: 800, height: 450 } },
        0
      )
      expect(validate(imageValue(SMALL_RASTER_REF))).toBe(
        "Cropped image must be at least 800 × 450 px"
      )
    })

    it("warns below the recommended size with the best-results suffix", () => {
      const validate = validatorAt(
        { name: "hero", recommendedDimensions: { width: 800, height: 450 } },
        0
      )
      expect(validate(imageValue(SMALL_RASTER_REF))).toBe(
        "Cropped image should be at least 800 × 450 px for best results"
      )
    })

    it("passes an SVG asset because it has no parsed dimensions", () => {
      const validate = validatorAt(
        { name: "hero", requiredDimensions: { width: 800, height: 450 } },
        0
      )
      expect(validate(imageValue(SVG_REF))).toBe(true)
    })

    it("passes a value with no asset", () => {
      const validate = validatorAt(
        { name: "hero", requiredDimensions: { width: 800, height: 450 } },
        0
      )
      const noAsset = { _type: "image" } as ImageValue
      expect(validate(noAsset)).toBe(true)
    })

    it("registers the required validator first and the recommended one second", () => {
      const [required, recommended] = captureValidators({
        name: "hero",
        requiredDimensions: { width: 800, height: 450 },
        recommendedDimensions: { width: 1600, height: 900 },
      })
      if (!required || !recommended) {
        throw new Error("expected required and recommended validators")
      }
      expect(required(imageValue(SMALL_RASTER_REF))).toBe(
        "Cropped image must be at least 800 × 450 px"
      )
      expect(recommended(imageValue(SMALL_RASTER_REF))).toBe(
        "Cropped image should be at least 1600 × 900 px for best results"
      )
    })
  })
})
