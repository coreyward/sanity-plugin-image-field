import { useLayoutEffect, useState } from "react"

/**
 * Returns the content-box width of the referenced element, updating on resize.
 */
export function useContentWidth(
  ref: React.RefObject<HTMLElement | null>
): number {
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) {
      return undefined
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return
      }
      setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [ref])

  return width
}
