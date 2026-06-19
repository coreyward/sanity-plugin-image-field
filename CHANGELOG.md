# Changelog

## 0.0.4 - 2026-06-19

- Updated Sanity-related dependencies from `6.0.0` to `6.1.0`.
- Refreshed the playground dependency set to match the Sanity `6.1.0` upgrade.
- Updated the package lockfile for the new dependency resolution.
- Address security vulnerabilities by overriding transitive dependencies.

## 0.0.3 - 2026-06-19

- Added an `allowedFormats` option for restricting accepted image file types.
- Applied format restrictions during image selection and upload validation.
- Exposed the new option through `defineImageField` and package TypeScript
  types.
- Updated README and playground schema examples to document `allowedFormats`.

## 0.0.2 - 2026-06-19

- Added aspect ratio validation for image field configuration.
- Improved `defineImageField` TypeScript types to reject unsupported
  `options.imageField` configuration.
- Expanded README documentation with setup, usage, and configuration guidance.
- Includes the initial Sanity Studio image input with configurable aspect ratios
  and minimum cropped dimension enforcement.

## 0.0.1 - 2026-06-18

- Initial release of sanity-plugin-image-field.
- Fully featured Sanity Studio image input with configurable aspect ratios.
