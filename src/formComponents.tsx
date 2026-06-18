import {
  type ImageSchemaType,
  type ImageValue,
  type InputProps,
  type ObjectInputProps,
} from "sanity"
import { ImageFieldInput } from "./ImageFieldInput"

type SchemaTypeChain = { name: string; type?: SchemaTypeChain | null }

/**
 * True when the input's schema type is, or extends, the built-in `image` type.
 * Lets {@link imageFieldFormInput} pass `props` to {@link ImageFieldInput}
 * without a cast.
 */
const isImageInput = (
  props: InputProps
): props is ObjectInputProps<ImageValue, ImageSchemaType> => {
  for (
    let current: SchemaTypeChain | undefined = props.schemaType;
    current;
    current = current.type ?? undefined
  ) {
    if (current.name === "image") {
      return true
    }
  }
  return false
}

/**
 * A `form.components.input` that makes {@link ImageFieldInput} the default for
 * every `image` field in the Studio. Other field types use the default input.
 * Per-field `options.imageField` configures each image's constraints.
 *
 * @example
 * ```ts
 * // sanity.config.ts
 * import { defineConfig } from "sanity"
 * import { imageFieldFormInput } from "sanity-plugin-image-field"
 *
 * export default defineConfig({
 *   // ...
 *   form: { components: { input: imageFieldFormInput } },
 * })
 * ```
 */
export const imageFieldFormInput = (props: InputProps) =>
  isImageInput(props) ? (
    <ImageFieldInput {...props} />
  ) : (
    props.renderDefault(props)
  )
