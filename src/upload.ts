import { parseImageId } from "@sanity-image/url-builder"
import type { AllowedImageFormat, ImageFormat } from "./types"

type MimeType = `image/${string}`

const FORMAT_ALIASES = new Map<string, ImageFormat>([
  ["jpeg", "jpg"],
  ["tif", "tiff"],
])

const FORMAT_MIME_TYPES: Record<ImageFormat, MimeType[]> = {
  avif: ["image/avif"],
  gif: ["image/gif"],
  jpg: ["image/jpeg"],
  png: ["image/png"],
  svg: ["image/svg+xml"],
  tiff: ["image/tiff"],
  webp: ["image/webp"],
}

/**
 * Extra file extensions to list in the accept string for formats that have more
 * than one common spelling. The MIME type already covers both spellings, but
 * some native file pickers match by extension, so listing every variant keeps
 * each spelling selectable. Both members of a pair are listed regardless of
 * which the author configured, since the alias collapses them to one format.
 */
const FORMAT_EXTENSIONS: Partial<Record<ImageFormat, string[]>> = {
  jpg: [".jpg", ".jpeg"],
  tiff: [".tif", ".tiff"],
}

const isImageFormat = (value: string): value is ImageFormat =>
  value in FORMAT_MIME_TYPES

/**
 * Resolve an authored format to its canonical {@link ImageFormat}. Aliases such
 * as `jpeg` map to `jpg`. Throws if the format is not supported.
 */
const resolveImageFormat = (format: string): ImageFormat => {
  const resolved = FORMAT_ALIASES.get(format) ?? format
  if (!isImageFormat(resolved)) {
    throw new Error(
      `Unsupported image format "${format}". Allowed formats are ${Object.keys(
        FORMAT_MIME_TYPES
      ).join(", ")}.`
    )
  }
  return resolved
}

/**
 * Resolve an authored format list to canonical formats and remove duplicates.
 */
export const normalizeAllowedFormats = (
  allowedFormats: readonly AllowedImageFormat[] | undefined
): ImageFormat[] => {
  if (!allowedFormats) {
    return []
  }

  return Array.from(new Set(allowedFormats.map(resolveImageFormat)))
}

/** Turn allowed file extensions into a browser/file-source accept string. */
export const acceptFromAllowedFormats = (
  allowedFormats: readonly AllowedImageFormat[] | undefined
): string | undefined => {
  const normalized = normalizeAllowedFormats(allowedFormats)
  if (normalized.length === 0) {
    return undefined
  }

  const tokens: string[] = []
  for (const format of normalized) {
    tokens.push(...FORMAT_MIME_TYPES[format])
    const extensions = FORMAT_EXTENSIONS[format]
    if (extensions) {
      tokens.push(...extensions)
    }
  }
  return tokens.join(",")
}

/** Read the encoded file format suffix from a Sanity image asset reference. */
export const imageFormatFromAssetRef = (assetRef: string): string => {
  const { format } = parseImageId(assetRef)
  return FORMAT_ALIASES.get(format) ?? format
}

/** Whether a Sanity image asset reference matches the configured formats. */
export const assetRefMatchesAllowedFormats = (
  assetRef: string | undefined,
  allowedFormats: readonly AllowedImageFormat[] | undefined
): boolean => {
  const normalized = normalizeAllowedFormats(allowedFormats)
  if (normalized.length === 0 || !assetRef) {
    return true
  }

  const format = imageFormatFromAssetRef(assetRef)
  return normalized.some((allowed) => allowed === format)
}

/** Human-friendly list of allowed formats for validation and upload messages. */
export const describeAllowedFormats = (
  allowedFormats: readonly AllowedImageFormat[]
): string => {
  const formats = normalizeAllowedFormats(allowedFormats).flatMap((format) =>
    format === "jpg" ? ["JPEG", "JPG"] : format.toUpperCase()
  )

  if (formats.length <= 1) {
    return formats[0] ?? "the configured"
  }
  if (formats.length === 2) {
    return `${formats[0]} or ${formats[1]}`
  }

  return `${formats.slice(0, -1).join(", ")}, or ${formats.at(-1)}`
}

/**
 * Whether a file's MIME type passes an `accept` string. This is Sanity's
 * `options.accept`, for example `"image/png,image/jpeg"` or `"image/*"`. The
 * browser applies `accept` only to the file picker. Drag-drop and paste do not
 * go through the picker, so every upload path is checked here instead.
 *
 * The list is comma-separated. A MIME type matches an explicit type
 * (`image/png`), a type glob (`image/*`), or the catch-all (`*` / `*​/​*`).
 * Matching ignores case. An empty `accept` matches every type.
 */
export const acceptsType = (mimeType: string, accept: string): boolean => {
  const type = mimeType.trim().toLowerCase()
  const patterns = accept
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

  if (patterns.length === 0) {
    return true
  }

  return patterns.some((pattern) => {
    if (pattern === "*" || pattern === "*/*") {
      return true
    }
    if (pattern.endsWith("/*")) {
      return type.startsWith(pattern.slice(0, -1))
    }
    return type === pattern
  })
}

/**
 * Whether an event target is a text-entry control: `<input>`, `<textarea>`, or
 * a `contenteditable` element. Paste-to-upload uses this to skip pastes aimed at
 * the field's `alt` and `caption` inputs, which sit in the same container.
 */
export const isTextEntryTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
    return true
  }
  // `isContentEditable` reflects inherited contenteditable in real browsers but
  // is not implemented in jsdom, where it is `undefined`. The attribute checks
  // run last so the return value is a boolean in that case.
  const attribute = target.getAttribute("contenteditable")
  return target.isContentEditable || attribute === "" || attribute === "true"
}
