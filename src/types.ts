/** Allowed crop aspect ratios, as `width / height`. */
export type AspectRatioRange = {
  /** Smallest allowed `width / height` ratio — the tallest permitted crop. */
  min: number
  /** Largest allowed `width / height` ratio — the widest permitted crop. */
  max: number
}

/**
 * The aspect-ratio constraint an author sets on a field. It takes one of three
 * forms.
 *
 * - A single `number` is a fixed `width / height` ratio the crop is locked to.
 * - An {@link AspectRatioRange} is a `[min, max]` range the crop stays within.
 * - A `number[]` is a set of ratios the crop snaps to during a drag.
 *
 * `resolveAspectRatio` converts all three into the internal
 * {@link ResolvedImageFieldConfig} the crop math uses. This union is used only
 * in author-facing config.
 */
export type AspectRatio = number | AspectRatioRange | number[]

/** A pixel size. Used for both source images and crop thresholds. */
export type Dimensions = {
  width: number
  height: number
}

/**
 * Per-field settings for {@link ImageFieldInput}, set under `options.imageField`
 * on any Sanity `image` field. The component reads them at runtime. Every
 * property is optional. With none set, the field is a plain uploader with a
 * free-form cropper.
 */
export type ImageFieldOptions = {
  /**
   * The crop aspect ratio(s) the editor may pick: a single fixed `number`, an
   * {@link AspectRatioRange}, or an array of ratios the crop snaps to. Omit to
   * allow any ratio.
   */
  aspectRatio?: AspectRatio
  /**
   * The editor shows a non-blocking warning when the cropped size falls below
   * this. Set it to the size that looks best, not the hard minimum.
   */
  recommendedDimensions?: Dimensions
  /**
   * The crop cannot be confirmed when the cropped size falls below this. Fields
   * built with {@link defineImageField} also fail document validation. Set it to
   * the smallest acceptable size.
   */
  requiredDimensions?: Dimensions
}

/**
 * Internal image-field config with the authored aspect-ratio form resolved to a
 * concrete range and optional snap ratios.
 */
export type ResolvedImageFieldConfig = {
  aspectRatioRange: AspectRatioRange
  /**
   * Ratios the crop snaps to as you drag, present only when the field was given
   * an array of ratios. Absent means continuous (free or range) behavior.
   */
  snapRatios?: number[]
  recommendedDimensions?: Dimensions
  requiredDimensions?: Dimensions
}

/**
 * Adds `imageField` to the options of every Sanity `image` field. `ImageOptions`
 * comes from `@sanity/types`, which `sanity` re-exports. Extending it lets you
 * set `options.imageField` in field config. It also lets the input read
 * `schemaType.options.imageField` without a cast.
 */
declare module "@sanity/types" {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- must be interface
  interface ImageOptions {
    /** Configuration for `sanity-plugin-image-field`'s `ImageFieldInput`. */
    imageField?: ImageFieldOptions
  }
}
