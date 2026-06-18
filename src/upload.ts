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
