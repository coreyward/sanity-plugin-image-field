import { buildSrc, parseImageId } from "@sanity-image/url-builder"
import { type ImageValue } from "sanity"
import { croppedDimensions, cropToPixelRect } from "./cropMath"
import { type Dimensions } from "./types"

/** Identifies a project/dataset so we can build CDN image URLs. */
export type SanityImageSource = {
  projectId: string
  dataset: string
}

/**
 * A Sanity image asset reference string with encoded dimensions.
 * Format: `image-<hash>-<width>x<height>-<format>`
 */
export type ImageAssetRef = `image-${string}-${number}x${number}-${string}`

/**
 * An uploaded asset's original pixel size, read from its reference id
 * (`image-<hash>-<width>x<height>-<format>`). Only pass a ref that has passed
 * `isCroppable`. A reference without encoded dimensions, such as
 * `image-<hash>-svg`, makes `parseImageId` throw.
 */
export const sourceDimensions = (assetRef: ImageAssetRef): Dimensions =>
  parseImageId(assetRef).dimensions

/**
 * Whether a reference is a Sanity SVG image asset. Sanity writes the format into
 * the reference id, and an SVG takes one of two shapes: `image-<hash>-svg`, or
 * `image-<hash>-<w>x<h>-svg` when Sanity read a size from the file's `viewBox`
 * or width and height. Both are vectors that the image API will not transform,
 * so neither can be raster-cropped. The format suffix is what marks a reference
 * an SVG, not the absence of dimensions.
 */
export const isSvg = (ref: string): boolean =>
  /^image-[a-f0-9]+(?:-\d+x\d+)?-svg$/.test(ref)

/**
 * Whether a reference is a raster image this input can crop. It must carry
 * encoded `<w>x<h>` dimensions and must not be an SVG. A dimensioned SVG
 * (`image-<hash>-<w>x<h>-svg`) has the same `<w>x<h>-<format>` tail as a raster
 * id and parses cleanly, so the `isSvg` check is what keeps it out.
 */
export const isCroppable = (
  assetRef?: string | null
): assetRef is ImageAssetRef =>
  Boolean(assetRef && /-\d+x\d+-\w+$/.test(assetRef) && !isSvg(assetRef))

/**
 * Whether a reference is a Sanity image asset this input supports: either a
 * raster id (`image-<hash>-<w>x<h>-<fmt>`) or an SVG (`image-<hash>-svg`). The
 * select-existing path uses this to reject unsupported references, such as a
 * Media Library global reference or a non-image asset.
 */
export const isImageAssetRef = (ref: string): boolean => {
  if (isSvg(ref)) {
    return true
  }
  try {
    const { assetId, format } = parseImageId(ref)
    return Boolean(assetId && format)
  } catch {
    return false
  }
}

/**
 * The cropped pixel size implied by an image value's stored crop, or the full
 * size when there's no crop. Returns null when the asset has no dimensions.
 * Shared by the input preview and the schema-level dimension validation.
 */
export const croppedDimensionsFromValue = (
  value: ImageValue | undefined
): Dimensions | null => {
  if (!isCroppable(value?.asset?._ref)) {
    return null
  }

  const source = sourceDimensions(value.asset._ref)

  if (!value.crop) {
    return source
  }

  return croppedDimensions(cropToPixelRect(value.crop, source))
}

/** The base CDN path (with trailing slash) for a project/dataset's images. */
const cdnBaseUrl = (source: SanityImageSource) =>
  `https://cdn.sanity.io/images/${source.projectId}/${source.dataset}/`

/** The CDN URL for the uncropped source image. */
export const sourceImageUrl = (assetRef: string, source: SanityImageSource) => {
  const { assetId, dimensions, format } = parseImageId(assetRef)
  const filename = `${assetId}-${dimensions.width}x${dimensions.height}.${format}`

  return `${cdnBaseUrl(source)}${filename}`
}

/**
 * A CDN URL for the cropped image. `buildSrc` applies the crop and fits the
 * width. The caller passes `displayWidth` to cap the delivered width so the
 * preview stays small.
 */
export const croppedImageUrl = (
  value: ImageValue,
  source: SanityImageSource,
  displayWidth: number
): string | null => {
  const assetRef = value.asset?._ref
  if (!assetRef) {
    return null
  }

  // The image API does not transform SVGs, so serve the original file from the
  // CDN with no crop or width. This covers both SVG shapes: the text between
  // `image-` and `-svg` is the CDN filename stem, which is the bare hash for
  // `image-<hash>-svg` and `<hash>-<w>x<h>` for the dimensioned form.
  if (isSvg(assetRef)) {
    const assetId = assetRef.slice("image-".length, -"-svg".length)
    return `${cdnBaseUrl(source)}${assetId}.svg`
  }

  const { src } = buildSrc({
    baseUrl: cdnBaseUrl(source),
    id: assetRef,
    width: Math.round(displayWidth),
    crop: value.crop,
  })

  return src
}
