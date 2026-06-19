import { defineField, defineType } from "sanity"
import { defineImageField, ImageFieldInput } from "sanity-plugin-image-field"

export const exampleImage = defineType({
  name: "exampleImage",
  title: "Example",
  type: "document",
  fields: [
    defineField({ name: "title", type: "string" }),

    // A plain `image` field. The playground sets ImageFieldInput as the global
    // default in sanity.config.ts, so this field renders with the constrained
    // cropper, configured by `options.imageField`. This path uses no wrapper;
    // without the global default, add `components: { input: ImageFieldInput }`
    // here.
    defineField({
      name: "wide",
      title: "Wide banner (16:9 – 21:9)",
      type: "image",
      options: {
        hotspot: true,
        imageField: {
          // Range form: the crop ratio stays between these two bounds.
          aspectRatio: { min: 16 / 9, max: 21 / 9 },
          recommendedDimensions: { width: 1920, height: 820 },
          requiredDimensions: { width: 1280, height: 540 },
        },
      },
      // Extra fields on the image type. The input shows these below the asset
      // UI, like the native image input, so `alt` stays editable here.
      fields: [
        defineField({
          name: "alt",
          title: "Alternative text",
          type: "string",
          description: "Describe the image for screen readers and SEO.",
        }),
        defineField({ name: "caption", title: "Caption", type: "string" }),
      ],
    }),

    // With the wrapper. Single-number form: one fixed ratio.
    defineImageField({
      name: "portrait",
      title: "Portrait (fixed 3:4)",
      aspectRatio: 3 / 4,
      requiredDimensions: { width: 600, height: 800 },
      validation: (Rule) => Rule.required(),
      fields: [
        defineField({
          name: "alt",
          title: "Alternative text",
          type: "string",
          description: "Describe the image for screen readers and SEO.",
        }),
      ],
    }),

    // Wiring up the input by hand. Array form: the crop snaps to the nearest of
    // these ratios as you drag, so it never shows an in-between one.
    defineField({
      name: "manual",
      title: "Manual configuration (snap 16:9 / 4:3 / 1:1)",
      type: "image",
      components: {
        input: ImageFieldInput,
      },
      options: {
        hotspot: true,
        imageField: {
          aspectRatio: [16 / 9, 4 / 3, 1],
          recommendedDimensions: { width: 1000, height: 1000 },
          requiredDimensions: { width: 500, height: 500 },
        },
      },
      validation: (Rule) => Rule.required(),
    }),

    defineImageField({
      name: "jpegImage",
      title: "JPEG image",
      allowedFormats: ["jpeg"],
      aspectRatio: 2 / 3,
    }),

    // A default image: no wrapper, no options.
    defineField({
      name: "defaultConfigImage",
      title: "Default config image",
      type: "image",
    }),
  ],
})
