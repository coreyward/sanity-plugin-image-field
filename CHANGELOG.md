# Changelog

## 0.1.0 - 2026-10-10

- **Breaking:** the `@sanity/ui` peer dependency is now `^4.0.0`. Studios on
  `@sanity/ui` 3 must upgrade it before installing this version.
- Updated `@sanity/icons` to v5, the version `sanity` and `@sanity/ui` 4 use.
  Studios no longer bundle a second copy of the icon set.
- Updated `@sanity-image/url-builder` to `1.2.0`.
- Replaced tsup with tsdown for builds. The published files and exports are
  unchanged.
- Added repository and author metadata to `package.json`, and npm badges to the
  README.
- Updated development dependencies, including React 19.3, Sanity 6.18, Vitest 5,
  oxlint and Prettier. These do not affect the published package.

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
