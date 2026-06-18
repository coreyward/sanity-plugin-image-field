import { defineConfig } from "sanity"
import { structureTool } from "sanity/structure"
import { imageFieldFormInput } from "sanity-plugin-image-field"
import { schemaTypes } from "./schemas"

// Set these in a `.env` file (or your shell) before running `sanity dev`:
//   SANITY_STUDIO_PROJECT_ID=your-project-id
//   SANITY_STUDIO_DATASET=production
export default defineConfig({
  name: "default",
  title: "Image Field Playground",
  projectId: process.env.SANITY_STUDIO_PROJECT_ID ?? "",
  dataset: process.env.SANITY_STUDIO_DATASET ?? "production",
  plugins: [structureTool()],
  schema: { types: schemaTypes },
  // Make ImageFieldInput the default input for every `image` field in the
  // Studio. Remove this to opt in per field with `components: { input }` or
  // `defineImageField` instead — see schemas/exampleImage.ts.
  form: { components: { input: imageFieldFormInput } },
})
