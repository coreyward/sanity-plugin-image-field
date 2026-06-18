# sanity-plugin-image-field

A custom image input for the Sanity Studio that gives you control over image
cropping and dimensions. Unlike Sanity's built-in image field, this plugin lets
you:

- **Constrain aspect ratios** — Force crops into specific ratios (like 16:9 for
  hero images) or ranges (like 4:3 to 16:9 for flexible layouts)
- **Enforce dimension requirements** — Ensure cropped images meet minimum size
  requirements for quality or performance
- **Provide real-time feedback** — Show content editors warnings when crops are
  too small, and block saving when they don't meet requirements

## How it works

This plugin integrates seamlessly with Sanity's existing image system:

- It replaces the UI component in the Studio responsible for uploading images
  with a custom one that has cropping and validation built in
- It can also add custom validators to the field definition that will be
  enforced by the Studio
- Crops and hotspot values are stored on the field in the standard `crop` and
  `hotspot` properties
- Any front-end code using
  [`@sanity/image-url`](https://www.sanity.io/docs/image-url),
  [`@sanity-image/url-builder`](https://github.com/sanity-io/image-url),
  [`sanity-image`](https://github.com/coreyward/sanity-image) or other crop +
  hotspot respecting tooling applies the crop automatically without any
  front-end changes

## Installation

```sh
npm install sanity-plugin-image-field
# or
pnpm add sanity-plugin-image-field
```

This plugin also requires `@sanity/ui`. If you don't already have it:

```sh
npm install @sanity/ui
# or:
pnpm add @sanity/ui
```

## Quick start

The fastest way to get started is using `defineImageField`, which sets up the
field with validation automatically:

```ts
import { defineType } from "sanity"
import { defineImageField } from "sanity-plugin-image-field"

export const page = defineType({
  name: "page",
  type: "document",
  fields: [
    defineImageField({
      name: "hero",
      title: "Hero image",
      // Constrain crop to landscape aspect ratios between 4:3 and 16:9
      aspectRatio: { min: 4 / 3, max: 16 / 9 },
      // Warn editors if crop is smaller than this
      recommendedDimensions: { width: 1600, height: 900 },
      // Block crops smaller than this (and validate at document level)
      requiredDimensions: { width: 800, height: 450 },
      validation: (Rule) => Rule.required(),
    }),
  ],
})
```

## Choosing an approach

This plugin provides a React component (`ImageFieldInput`) that replaces
Sanity's default image input. To use it, you need to:

1. **Specify the component** — Tell Sanity when to use `ImageFieldInput` instead
   of the default
2. **Configure the constraints** — Set aspect ratio and dimension options that
   the component reads

### How to specify the component

You have two ways to tell Sanity to use `ImageFieldInput`:

**1. Per-field (explicit)** Specify `ImageFieldInput` as the input component on
individual image fields where you want to use it:

```ts
import { defineField } from "sanity"
import { ImageFieldInput } from "sanity-plugin-image-field"

defineField({
  name: "hero",
  type: "image",
  components: { input: ImageFieldInput }, // ← Use our component here
  options: {
    imageField: {
      aspectRatio: 16 / 9,
    },
  },
})
```

**2. Studio-wide default (implicit)** Register `imageFieldFormInput` as the
default input component for all image fields in your Sanity config:

```ts
// sanity.config.ts
import { defineConfig } from "sanity"
import { imageFieldFormInput } from "sanity-plugin-image-field"

export default defineConfig({
  // ...
  form: { components: { input: imageFieldFormInput } }, // ← Use for all image fields
})
```

### How configuration works

Regardless of how you specify the component, configuration always happens the
same way: through `options.imageField` on your image field definition. The
`ImageFieldInput` component reads these options to determine how to constrain
cropping:

```ts
defineField({
  name: "hero",
  type: "image",
  options: {
    imageField: {
      // ← Configuration lives here
      aspectRatio: 16 / 9,
      recommendedDimensions: { width: 1600, height: 900 },
      requiredDimensions: { width: 800, height: 450 },
    },
  },
})
```

### The `defineImageField` helper

`defineImageField` is a convenience function that:

- Uses the **per-field** approach to specify `ImageFieldInput`
- Adds your constraints to `options.imageField` automatically
- Builds document-level validation from your dimension requirements and
  configured aspect ratio
- Merges any additional validation you provide

It's compatible with both per-field specification and studio-wide defaults.

### Which approach should you use?

### Use `defineImageField` when:

- You want the simplest setup with built-in validation
- You're adding image fields to individual schemas
- You want document-level validation that prevents saving invalid crops

**This is the recommended approach for most use cases.**

### Use manual per-field configuration when:

- You need fine-grained control over the field definition
- You want to add custom validation logic alongside the image constraints
- You're integrating with existing field configurations
- You prefer the explicit, visible approach of specifying components per field

### Use the studio-wide default when:

- You want ALL image fields in your Studio to use this plugin
- You have many image fields and don't want to configure each one individually
- You want to apply the same constraints globally
- You'll combine it with `defineImageField` where you need document-level
  validation

## Configuration options

All configuration lives under `options.imageField` in your field definition:

````ts
type ImageFieldOptions = {
  /**
   * Allowed crop ratios as width / height.
   *
   * - Single number: fixed ratio
   * - { min, max }: flexible range
   * - number[]: specific ratios to snap between
   *
   * @example
   * ```ts
   * // Fixed ratio (e.g., for hero images that must be exactly 16:9)
   * aspectRatio: 16 / 9
   *
   * // Flexible range (e.g., for cards that can be 4:3 to 16:9)
   * aspectRatio: { min: 4 / 3, max: 16 / 9 }
   *
   * // Specific ratios to snap between
   * aspectRatio: [1 / 1, 4 / 3, 16 / 9]
   * ```
   */
  aspectRatio?: number | { min: number; max: number } | number[]

  /**
   * Shows a non-blocking warning when the crop is smaller than this size.
   * Helps editors maintain quality standards.
   */
  recommendedDimensions?: { width: number; height: number }

  /**
   * Blocks confirmation when the crop is smaller than this size.
   * With `defineImageField`, also adds document-level validation.
   */
  requiredDimensions?: { width: number; height: number }
}
````

## Usage patterns

### 1. Recommended: Using `defineImageField`

This helper creates a fully configured image field with automatic validation:

```ts
import { defineType } from "sanity"
import { defineImageField } from "sanity-plugin-image-field"

export const page = defineType({
  name: "page",
  type: "document",
  fields: [
    defineImageField({
      name: "hero",
      title: "Hero image",
      aspectRatio: { min: 4 / 3, max: 16 / 9 },
      recommendedDimensions: { width: 1600, height: 900 },
      requiredDimensions: { width: 800, height: 450 },
      validation: (Rule) => Rule.required(),
    }),
  ],
})
```

**Benefits:**

- Simplest API — all configuration in one place
- Automatic document-level validation from dimension constraints
- Type-safe and integrates with Sanity's field system

### 2. Manual field configuration

For more control, specify `ImageFieldInput` as the component:

```ts
import { defineField, defineType } from "sanity"
import { ImageFieldInput } from "sanity-plugin-image-field"

export const page = defineType({
  name: "page",
  type: "document",
  fields: [
    defineField({
      name: "hero",
      title: "Hero image",
      type: "image",
      options: {
        hotspot: true, // Enable focal point editor (Sanity's standard option)
        imageField: {
          aspectRatio: { min: 4 / 3, max: 16 / 9 },
          recommendedDimensions: { width: 1600, height: 900 },
          requiredDimensions: { width: 800, height: 450 },
        },
      },
      components: { input: ImageFieldInput },
    }),
  ],
})
```

**Benefits:**

- Full control over field definition
- Can add custom validation logic
- Integrates with existing field configurations

**Note:** This approach doesn't automatically add document-level validation for
dimensions. Add it manually if needed, or use `defineImageField`.

### 3. Form-level default

Apply this input to all image fields in your Studio:

```ts
// sanity.config.ts
import { defineConfig } from "sanity"
import { imageFieldFormInput } from "sanity-plugin-image-field"

export default defineConfig({
  // ... other config
  form: { components: { input: imageFieldFormInput } },
})
```

Then configure individual fields through `options.imageField`:

```ts
defineField({
  name: "hero",
  type: "image",
  options: {
    imageField: {
      aspectRatio: 16 / 9,
      requiredDimensions: { width: 800, height: 450 },
    },
  },
})
```

**Benefits:**

- Consistent behavior across all image fields
- Don't need to specify the component on each field
- Combine with `defineImageField` where you need validation

## Editor experience

### Upload

Content editors can upload images by:

- Using the file picker
- Dragging and dropping an image onto the field
- Pasting an image from the clipboard
- Selecting an existing asset from the Media library or other configured sources

The field honors any `options.accept` format restrictions you set.

### Cropping

When an aspect ratio constraint is configured, the crop editor opens
automatically after upload. The editor:

- Defaults to the largest crop that fits your constraint
- Shows live pixel dimensions with warnings for size requirements
- Blocks confirmation while the crop is below the required size
- Supports keyboard controls (arrow keys to move, Shift+arrow to resize)
- Supports modifier keys:
  - **Shift** while dragging a corner to lock the current aspect ratio
  - **Option/Alt** while dragging to resize about the center
- When using an array of aspect ratios, snaps to the nearest ratio as you drag
  (never showing in-between ratios)

### Focal point

When you enable `options.hotspot: true`, editors can set a focal point for the
image. This is stored in Sanity's standard `hotspot` field and works with
front-end tools that support cover-mode framing. The focal point marker is
positioned relative to the crop area.

### Confirmed state

After cropping, editors see:

- The cropped image preview
- Buttons to re-crop, replace, select a different asset, or remove the image
- Any dimension warnings based on your configuration

## How cropping works with Sanity

This plugin uses Sanity's standard, non-destructive cropping system:

- **Storage format** — Crops are stored as `{ top, bottom, left, right }` insets
  (0-1 range) on the standard `crop` field
- **Original preservation** — Your original images are never modified
- **Automatic application** — Front-end code using
  [`@sanity/image-url`](https://www.sanity.io/docs/image-url),
  [`@sanity-image/url-builder`](https://github.com/sanity-io/image-url), or
  [`sanity-image`](https://github.com/coreyward/sanity-image) applies the crop
  automatically
- **Dimension calculation** — Cropped dimensions are computed from the original
  asset's metadata, so no additional API calls are needed

### SVG handling

SVGs are handled specially since Sanity does not support crop transformations on
SVG images:

- Uploads work normally
- The crop dialog is not shown for SVG images
- Aspect ratio and dimension validation are not performed on SVG images, even
  when the SVG has dimensions (from `viewBox` or `width`/`height` attributes)
- The asset reference is still stored normally

## Playground

A runnable Sanity Studio is available in the `playground/` directory. To try it:

```sh
# Build the package (or run `pnpm dev` to watch for changes)
pnpm build

# Configure the playground with your Sanity project
cp playground/.env.example playground/.env
# Edit playground/.env and set SANITY_STUDIO_PROJECT_ID

# Start the playground
pnpm playground:dev
```

## Future work

- **SVG validation** — Add validation for SVG images that have dimensions (from
  `viewBox` or `width`/`height` attributes) to check aspect ratio and minimum
  dimensions. Currently, all SVG images bypass validation since Sanity does not
  support crop transformations on SVGs.

## License

MIT
