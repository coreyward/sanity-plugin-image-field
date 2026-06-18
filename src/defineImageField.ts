import { defineField, type ImageDefinition, type ImageValue } from "sanity"
import { ImageFieldInput } from "./ImageFieldInput"
import {
  describeAspectRatio,
  dimensionsAtLeast,
  ratioMatchesConstraint,
  resolveAspectRatio,
} from "./cropMath"
import { validateAspectRatio } from "./utils"
import { croppedDimensionsFromValue } from "./imageUrl"
import {
  type Dimensions,
  type ImageFieldOptions,
  type ResolvedImageFieldConfig,
} from "./types"

/**
 * Parameters for {@link defineImageField}. It is an image field definition
 * without `type` and `components`, which {@link defineImageField} sets. The
 * {@link ImageFieldOptions} constraints are added as top-level props. A
 * `validation` builder is optional. When given, it is merged with the rules
 * derived from the constraints, not replaced by them.
 */
export type DefineImageFieldParams = Omit<
  ImageDefinition,
  "type" | "components"
> &
  ImageFieldOptions

/**
 * Builder for an image field that uses {@link ImageFieldInput}. It sets
 * `components.input` and writes the constraints to `options.imageField`. It also
 * builds document-level `validation` from `requiredDimensions`,
 * `recommendedDimensions`, and `aspectRatio`. {@link ImageFieldInput} on its own
 * does not build that validation. A supplied `validation` is merged with those
 * derived rules, not replaced.
 *
 * The result goes in a `fields: [...]` array.
 *
 * @example
 * ```ts
 * defineType({
 *   name: "page",
 *   type: "document",
 *   fields: [
 *     defineImageField({
 *       name: "hero",
 *       title: "Hero image",
 *       aspectRatio: { min: 4 / 3, max: 16 / 9 },
 *       recommendedDimensions: { width: 1600, height: 900 },
 *       requiredDimensions: { width: 800, height: 450 },
 *       validation: (Rule) => Rule.required(),
 *     }),
 *   ],
 * })
 * ```
 */
export const defineImageField = ({
  aspectRatio,
  recommendedDimensions,
  requiredDimensions,
  options,
  validation,
  ...overrides
}: DefineImageFieldParams) => {
  if (aspectRatio !== undefined) {
    validateAspectRatio(aspectRatio)
  }

  const imageField: ImageFieldOptions = {
    aspectRatio,
    recommendedDimensions,
    requiredDimensions,
  }

  return defineField({
    ...overrides,
    type: "image",
    options: { ...options, imageField },
    components: { input: ImageFieldInput },
    validation: (rule, context) => {
      const rules: ReturnType<typeof rule.required>[] = []

      if (requiredDimensions) {
        rules.push(
          rule.custom((value: ImageValue | undefined) =>
            validateCroppedSize(value, requiredDimensions, "error")
          )
        )
      }

      if (recommendedDimensions) {
        rules.push(
          rule
            .custom((value: ImageValue | undefined) =>
              validateCroppedSize(value, recommendedDimensions, "warning")
            )
            .warning()
        )
      }

      if (aspectRatio !== undefined) {
        const config = resolveAspectRatio(aspectRatio)
        rules.push(
          rule.custom((value: ImageValue | undefined) =>
            validateCropAspectRatio(value, config)
          )
        )
      }

      if (validation) {
        const userRules = validation(rule, context)
        rules.push(...(Array.isArray(userRules) ? userRules : [userRules]))
      }
      return rules
    },
  })
}

/**
 * Check the cropped image dimensions against the given limits. Returns true when
 * there is no asset or when the asset dimensions are unknown. An empty field
 * passes unless a separate `required` rule rejects it.
 */
const validateCroppedSize = (
  value: ImageValue | undefined,
  threshold: Dimensions,
  level: "error" | "warning"
): true | string => {
  const dimensions = croppedDimensionsFromValue(value)
  if (!dimensions || dimensionsAtLeast(dimensions, threshold)) {
    return true
  }
  const verb = level === "warning" ? "should" : "must"
  const suffix = level === "warning" ? " for best results" : ""
  return `Cropped image ${verb} be at least ${threshold.width} × ${threshold.height} px${suffix}`
}

/**
 * Check the cropped image ratio against the field's aspect-ratio constraint.
 * Returns true when there is no asset or when the asset dimensions are unknown.
 * An uncropped value is checked against its source ratio, which nudges the
 * editor to crop when the source is off the constraint.
 */
const validateCropAspectRatio = (
  value: ImageValue | undefined,
  config: ResolvedImageFieldConfig
): true | string => {
  const dimensions = croppedDimensionsFromValue(value)
  if (!dimensions) {
    return true
  }
  if (ratioMatchesConstraint(dimensions.width / dimensions.height, config)) {
    return true
  }
  return `Cropped image must use a ${describeAspectRatio(config)} aspect ratio`
}
