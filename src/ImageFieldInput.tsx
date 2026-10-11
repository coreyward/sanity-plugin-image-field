import { useEffect, useRef, useState } from "react"
import {
  Box,
  Button,
  Card,
  Flex,
  Inline,
  Spinner,
  Stack,
  Text,
} from "@sanity/ui"
import { Menu, MenuButton, MenuItem } from "@sanity/ui/menu"
import {
  CropIcon,
  ImageIcon,
  ImagesIcon,
  TrashIcon,
  UploadIcon,
} from "@sanity/icons"
import {
  type AssetFromSource,
  type AssetSource,
  type FormPatch,
  type ImageCrop,
  type ImageHotspot,
  type ImageSchemaType,
  type ImageValue,
  ObjectInputMembers,
  type ObjectInputProps,
  type ObjectMember,
  set,
  setIfMissing,
  unset,
  useClient,
  useWorkspace,
} from "sanity"
import { dimensionsAtLeast, resolveAspectRatio } from "./cropMath"
import { CropDialog } from "./CropDialog"
import {
  croppedDimensionsFromValue,
  croppedImageUrl,
  isCroppable,
  isImageAssetRef,
  isSvg,
  type SanityImageSource,
  sourceDimensions,
} from "./imageUrl"
import {
  acceptFromAllowedFormats,
  acceptsType,
  assetRefMatchesAllowedFormats,
  describeAllowedFormats,
  isTextEntryTarget,
} from "./upload"
import { type Dimensions, type ResolvedImageFieldConfig } from "./types"

const API_VERSION = "2025-02-19"

type UploadStatus =
  | { status: "idle" }
  | { status: "uploading"; progress: number }
  | { status: "error"; message: string }

/**
 * A custom image input that constrains cropping to a chosen range of aspect
 * ratios. It handles uploads from the file picker and drag-and-drop, shows a
 * ratio-aware crop editor, and saves the result as Sanity's non-destructive
 * crop. Existing image pipelines render it without changes.
 *
 * Extra fields on the image type, such as `alt` or `caption`, render below the
 * asset UI using the form's own field renderers.
 *
 * Set it on an `image` field with `components: { input: ImageFieldInput }`, and
 * configure it through `options.imageField` on that field. With no options set,
 * it is a plain uploader with a free-form cropper.
 */
export const ImageFieldInput = ({
  value,
  onChange,
  path,
  members,
  readOnly,
  schemaType,
  ...renderObjectProps
}: ObjectInputProps<ImageValue, ImageSchemaType>) => {
  const client = useClient({ apiVersion: API_VERSION })
  const { projectId, dataset } = client.config()
  const assetSources = useWorkspace().form.image.assetSources

  const imageFieldOptions = schemaType.options?.imageField
  const allowedFormats = imageFieldOptions?.allowedFormats
  const aspectRatio = imageFieldOptions?.aspectRatio
  const hasAspectConstraint = aspectRatio !== undefined
  const hotspotEnabled = Boolean(schemaType.options?.hotspot)
  const resolved = resolveAspectRatio(aspectRatio)
  const config: ResolvedImageFieldConfig = {
    aspectRatioRange: resolved.aspectRatioRange,
    snapRatios: resolved.snapRatios,
    recommendedDimensions: imageFieldOptions?.recommendedDimensions,
    requiredDimensions: imageFieldOptions?.requiredDimensions,
  }
  const accept =
    acceptFromAllowedFormats(allowedFormats) ??
    schemaType.options?.accept ??
    "image/*"

  const [upload, setUpload] = useState<UploadStatus>({ status: "idle" })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingAsset, setPendingAsset] = useState<string | null>(null)
  const [draggingOver, setDraggingOver] = useState(false)
  const [browsingSource, setBrowsingSource] = useState<AssetSource | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const subscription = useRef<{ unsubscribe: () => void } | null>(null)

  useEffect(() => () => subscription.current?.unsubscribe(), [])

  const assetRef = value?.asset?._ref
  const assetCrop = value?.crop
  const assetHotspot = value?.hotspot
  const activeAssetRef = pendingAsset ?? assetRef
  const dialogSource =
    activeAssetRef && isCroppable(activeAssetRef)
      ? sourceDimensions(activeAssetRef)
      : null
  const imageSource: SanityImageSource | null =
    projectId && dataset ? { projectId, dataset } : null

  const customFieldMembers = members.filter(isCustomFieldMember)

  /**
   * Commit an asset reference to the document. The optional extra patches are
   * appended after the reference patches, in order.
   */
  const commitAsset = (ref: string, extraPatches: FormPatch[] = []) => {
    onChange([
      setIfMissing({ _type: "image" }),
      set({ _type: "reference", _ref: ref }, ["asset"]),
      ...extraPatches,
    ])
    setUpload({ status: "idle" })
  }

  /**
   * Handle an asset reference, whether just uploaded or picked from an existing
   * source. SVGs commit immediately, editable raster images open the crop
   * dialog, and non-editable raster images commit after the up-front size check.
   */
  const applyAsset = (selectedAssetRef: string) => {
    if (!assetRefMatchesAllowedFormats(selectedAssetRef, allowedFormats)) {
      setUpload({
        status: "error",
        message: `That image format isn't accepted here. Choose ${describeAllowedFormats(allowedFormats ?? [])}.`,
      })
      return
    }

    if (isSvg(selectedAssetRef)) {
      commitAsset(selectedAssetRef, [unset(["crop"])])
      return
    }

    const dimensions = isCroppable(selectedAssetRef)
      ? sourceDimensions(selectedAssetRef)
      : null
    const openEditor =
      Boolean(dimensions) && (hasAspectConstraint || hotspotEnabled)

    if (openEditor) {
      setPendingAsset(selectedAssetRef)
      setUpload({ status: "idle" })
      setDialogOpen(true)
      return
    }

    if (
      dimensions &&
      config.requiredDimensions &&
      !dimensionsAtLeast(dimensions, config.requiredDimensions)
    ) {
      setUpload({
        status: "error",
        message: `That image is too small. It must be at least ${config.requiredDimensions.width} × ${config.requiredDimensions.height} px.`,
      })
      return
    }

    commitAsset(selectedAssetRef, [unset(["crop"])])
  }

  const uploadFile = (file: File) => {
    if (!acceptsType(file.type, accept)) {
      setUpload({
        status: "error",
        message:
          "That file type isn't accepted here. Choose a supported image.",
      })
      return
    }

    setUpload({ status: "uploading", progress: 0 })
    subscription.current?.unsubscribe()
    subscription.current = client.observable.assets
      .upload("image", file, { filename: file.name })
      .subscribe({
        next: (event) => {
          if (event.type === "progress") {
            setUpload({ status: "uploading", progress: event.percent })
          } else {
            applyAsset(event.body.document._id)
          }
        },
        error: () => {
          setUpload({
            status: "error",
            message: "Upload failed. Please try again.",
          })
        },
      })
  }

  /**
   * Handle a selection from an asset source. If the selection is an image
   * asset, apply it to the document. Otherwise, show an error message.
   */
  const selectAsset = (assets: AssetFromSource[]) => {
    setBrowsingSource(null)
    const chosen = assets.at(0)
    if (
      chosen?.kind === "assetDocumentId" &&
      typeof chosen.value === "string" &&
      isImageAssetRef(chosen.value)
    ) {
      applyAsset(chosen.value)
      return
    }
    setUpload({
      status: "error",
      message: "That selection can't be used here. Choose an uploaded image.",
    })
  }

  /**
   * Confirming a pending asset commits the asset reference before the crop and
   * hotspot patches. Re-cropping an existing image writes only crop metadata.
   */
  const confirmCropAndHotspot = ({
    crop,
    hotspot,
  }: {
    crop: ImageCrop
    hotspot?: ImageHotspot
  }) => {
    const assetPatches = pendingAsset
      ? [
          setIfMissing({ _type: "image" }),
          set({ _type: "reference", _ref: pendingAsset }, ["asset"]),
        ]
      : []
    onChange([
      ...assetPatches,
      set(crop, ["crop"]),
      ...(hotspot ? [set(hotspot, ["hotspot"])] : []),
    ])
    setPendingAsset(null)
    setDialogOpen(false)
  }

  const removeImage = () => {
    // Clear the asset reference and its crop/hotspot metadata, but keep sibling
    // fields such as `alt` and `caption`. When no sibling fields remain and this
    // is not an array element, clear the whole object so it does not become an
    // empty `{ _type }`.
    const keys = Object.keys(value ?? {})
    const hasMemberFields = keys.some((key) => !RESERVED_KEYS.has(key))
    const isArrayElement = typeof path.at(-1) !== "string"
    const removeKeys = ["asset", "media"]
      .concat(keys.filter((key) => ASSET_BOUND_KEYS.has(key)))
      .map((key) => unset([key]))
    onChange(hasMemberFields || isArrayElement ? removeKeys : unset())
    setUpload({ status: "idle" })
  }

  const onFilePicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      uploadFile(file)
    }
    event.target.value = ""
  }

  /**
   * Paste an image from the clipboard. The custom `alt` and `caption` fields
   * share the outer Stack, so a paste into one of them also fires this handler.
   * `isTextEntryTarget` excludes those targets. The candidate filter uses
   * `acceptsType` so it honors `options.accept`, the same check the other
   * upload paths run. A paste that carries no accepted image is left alone,
   * because the handler fires on every paste over the field.
   */
  const handlePaste = (event: React.ClipboardEvent) => {
    if (readOnly || upload.status === "uploading") {
      return
    }
    if (isTextEntryTarget(event.target)) {
      return
    }
    const file = Array.from(event.clipboardData.files).find((item) =>
      acceptsType(item.type, accept)
    )
    if (!file) {
      return
    }
    event.preventDefault()
    uploadFile(file)
  }

  const dropHandlers = useDropHandlers({
    disabled: readOnly || upload.status === "uploading",
    dragDepth,
    setDraggingOver,
    onFile: uploadFile,
  })

  if (!imageSource) {
    return (
      <Card padding={4} radius={2} tone="critical" border>
        <Text size={1}>
          Image input unavailable: missing project configuration.
        </Text>
      </Card>
    )
  }

  return (
    <Stack gap={3} {...dropHandlers} onPaste={handlePaste}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        hidden
        aria-label="Upload image"
        onChange={onFilePicked}
      />

      {upload.status === "uploading" ? (
        <UploadingCard progress={upload.progress} />
      ) : value?.asset ? (
        <ConfirmedPreview
          value={value}
          imageSource={imageSource}
          config={config}
          croppable={Boolean(assetRef && isCroppable(assetRef))}
          readOnly={readOnly}
          draggingOver={draggingOver}
          onEditCrop={() => {
            setDialogOpen(true)
          }}
          onReplace={() => fileInputRef.current?.click()}
          onRemove={removeImage}
          selectAffordance={
            <SelectExistingButton
              sources={assetSources}
              disabled={readOnly}
              fontSize={1}
              onBrowse={setBrowsingSource}
            />
          }
        />
      ) : (
        <EmptyDropzone
          readOnly={readOnly}
          draggingOver={draggingOver}
          onUploadClick={() => fileInputRef.current?.click()}
          selectAffordance={
            <SelectExistingButton
              sources={assetSources}
              disabled={readOnly}
              onBrowse={setBrowsingSource}
            />
          }
        />
      )}

      {upload.status === "error" && (
        <Card padding={3} radius={2} tone="critical" border>
          <Text size={1}>{upload.message}</Text>
        </Card>
      )}

      {customFieldMembers.length > 0 && (
        <ObjectInputMembers
          members={customFieldMembers}
          {...renderObjectProps}
        />
      )}

      {browsingSource && (
        <browsingSource.component
          assetSource={browsingSource}
          action="select"
          assetType="image"
          accept={accept}
          selectionType="single"
          selectedAssets={[]}
          dialogHeaderTitle="Select image"
          onClose={() => {
            setBrowsingSource(null)
          }}
          onSelect={selectAsset}
        />
      )}

      {dialogOpen && activeAssetRef && dialogSource && (
        <CropDialog
          // Key on the asset so swapping the image remounts the editor.
          key={activeAssetRef}
          assetRef={activeAssetRef}
          imageSource={imageSource}
          sourceDimensions={dialogSource}
          config={config}
          initialCrop={pendingAsset ? undefined : assetCrop}
          hotspotEnabled={hotspotEnabled}
          initialHotspot={pendingAsset ? undefined : assetHotspot}
          onConfirm={confirmCropAndHotspot}
          onClose={() => {
            setPendingAsset(null)
            setDialogOpen(false)
          }}
        />
      )}
    </Stack>
  )
}

const UploadingCard = ({ progress }: { progress: number }) => (
  <Card padding={5} radius={2} border>
    <Flex direction="column" align="center" gap={3}>
      <Spinner muted />
      <Text size={1} muted>
        Uploading… {Math.round(progress)}%
      </Text>
    </Flex>
  </Card>
)

const EmptyDropzone = ({
  readOnly,
  draggingOver,
  onUploadClick,
  selectAffordance,
}: {
  readOnly?: boolean
  draggingOver: boolean
  onUploadClick: () => void
  selectAffordance: React.ReactNode
}) => (
  <Card
    padding={5}
    radius={2}
    border
    tone={draggingOver ? "primary" : "default"}
    style={{ borderStyle: "dashed" }}
  >
    <Flex direction="column" align="center" gap={4}>
      <Text size={4} muted>
        <ImageIcon />
      </Text>
      <Stack gap={2}>
        <Text size={1} muted align="center">
          {draggingOver
            ? "Drop the image to upload"
            : "Drag and drop an image here, or"}
        </Text>
      </Stack>
      <Inline gap={2}>
        <Button
          icon={UploadIcon}
          text="Upload"
          mode="ghost"
          disabled={readOnly}
          onClick={onUploadClick}
        />
        {selectAffordance}
      </Inline>
    </Flex>
  </Card>
)

const ConfirmedPreview = ({
  value,
  imageSource,
  config,
  croppable,
  readOnly,
  draggingOver,
  onEditCrop,
  onReplace,
  onRemove,
  selectAffordance,
}: {
  value: ImageValue
  imageSource: SanityImageSource
  config: ResolvedImageFieldConfig
  croppable?: boolean
  readOnly?: boolean
  draggingOver: boolean
  onEditCrop: () => void
  onReplace: () => void
  onRemove: () => void
  selectAffordance: React.ReactNode
}) => {
  const previewUrl = croppedImageUrl(value, imageSource, 640)
  const dimensions = croppedDimensionsFromValue(value)
  const dimensionIssue = dimensions
    ? getDimensionIssue(dimensions, config)
    : undefined

  return (
    <Stack gap={3}>
      <Card
        radius={2}
        border
        tone={draggingOver ? "primary" : "default"}
        style={{ overflow: "hidden" }}
      >
        {previewUrl ? (
          <Flex justify="center">
            <img
              src={previewUrl}
              alt=""
              style={{ display: "block", maxWidth: "100%", maxHeight: 300 }}
            />
          </Flex>
        ) : (
          <Box padding={4}>
            <Text size={1} muted>
              Preview unavailable.
            </Text>
          </Box>
        )}
      </Card>

      <Flex justify="space-between" align="center" gap={3} wrap="wrap">
        {dimensions && (
          <Text size={1} muted>
            {dimensions.width} × {dimensions.height} px
          </Text>
        )}
        <Inline gap={2}>
          {croppable && (
            <Button
              icon={CropIcon}
              text="Edit crop"
              mode="ghost"
              fontSize={1}
              disabled={readOnly}
              onClick={onEditCrop}
            />
          )}
          <Button
            icon={ImageIcon}
            text="Replace"
            mode="ghost"
            fontSize={1}
            disabled={readOnly}
            onClick={onReplace}
          />
          {selectAffordance}
          <Button
            icon={TrashIcon}
            text="Remove"
            mode="bleed"
            tone="critical"
            fontSize={1}
            disabled={readOnly}
            onClick={onRemove}
          />
        </Inline>
      </Flex>

      {dimensionIssue && (
        <Card padding={3} radius={2} tone={dimensionIssue.tone} border>
          <Text size={1}>{dimensionIssue.message}</Text>
        </Card>
      )}
    </Stack>
  )
}

/**
 * The control for selecting an existing asset, shared by the empty and confirmed
 * states. It renders nothing for no sources, a plain button for a single source,
 * and a menu of sources otherwise. This matches the native image input.
 */
const SelectExistingButton = ({
  sources,
  disabled,
  fontSize,
  onBrowse,
}: {
  sources: AssetSource[]
  disabled?: boolean
  fontSize?: number
  onBrowse: (source: AssetSource) => void
}) => {
  const [firstSource] = sources
  if (!firstSource) {
    return null
  }

  if (sources.length === 1) {
    return (
      <Button
        icon={ImagesIcon}
        text="Select existing"
        mode="ghost"
        fontSize={fontSize}
        disabled={disabled}
        onClick={() => {
          onBrowse(firstSource)
        }}
      />
    )
  }

  return (
    <MenuButton
      id="image-field-select-existing"
      button={
        <Button
          icon={ImagesIcon}
          text="Select existing"
          mode="ghost"
          fontSize={fontSize}
          disabled={disabled}
        />
      }
      menu={
        <Menu>
          {sources.map((source) => (
            <MenuItem
              key={source.name}
              // `title` is deprecated in favor of `i18nKey`, but rendering
              // `i18nKey` needs the i18n `t()` function, which is not wired up
              // here.  ¯\_(⊙︿⊙)_/¯
              // oxlint-disable-next-line typescript/no-deprecated
              text={source.title ?? source.name}
              icon={source.icon}
              fontSize={fontSize}
              onClick={() => {
                onBrowse(source)
              }}
            />
          ))}
        </Menu>
      }
    />
  )
}

/**
 * Fields this input manages itself, which are not rendered as editable members:
 *
 * - the asset reference
 * - the Media Library handle
 * - crop/hotspot metadata
 *
 * User-defined fields such as `alt` or `caption` render normally.
 */
const ASSET_MANAGED_FIELDS = new Set(["asset", "media", "crop", "hotspot"])

const isCustomFieldMember = (member: ObjectMember) =>
  member.kind !== "field" || !ASSET_MANAGED_FIELDS.has(member.name)

/**
 * Keys reserved by the image object for the asset and its metadata. Every other
 * key is a user-defined field, such as `alt` or `caption`, that is retained when
 * the asset is removed. This matches the native image input.
 */
const RESERVED_KEYS = new Set([
  "_type",
  "_key",
  "_upload",
  "asset",
  "crop",
  "hotspot",
  "media",
])
const ASSET_BOUND_KEYS = new Set(["crop", "hotspot", "_upload"])

/**
 * Describes how the cropped size fails to meet the configured limits, if at
 * all. An issue with a required dimension takes priority over a recommended
 * one.
 */
const getDimensionIssue = (
  dimensions: Dimensions,
  config: ResolvedImageFieldConfig
): { tone: "critical" | "caution"; message: string } | undefined => {
  const { requiredDimensions, recommendedDimensions } = config
  if (
    requiredDimensions &&
    !dimensionsAtLeast(dimensions, requiredDimensions)
  ) {
    return {
      tone: "critical",
      message: `Cropped image is below the required ${requiredDimensions.width} × ${requiredDimensions.height} px. Edit the crop to enlarge it.`,
    }
  }
  if (
    recommendedDimensions &&
    !dimensionsAtLeast(dimensions, recommendedDimensions)
  ) {
    return {
      tone: "caution",
      message: `Cropped image is below the recommended ${recommendedDimensions.width} × ${recommendedDimensions.height} px.`,
    }
  }
  return undefined
}

const hasFiles = (event: React.DragEvent) =>
  Array.from(event.dataTransfer.types).includes("Files")

/**
 * Drag-and-drop handlers matching the native image input. A depth counter
 * prevents the highlight from flickering as the pointer crosses child elements.
 * Drops are ignored while the field is read-only or mid-upload.
 */
const useDropHandlers = ({
  disabled,
  dragDepth,
  setDraggingOver,
  onFile,
}: {
  disabled: boolean
  dragDepth: React.RefObject<number>
  setDraggingOver: (value: boolean) => void
  onFile: (file: File) => void
}) => {
  return {
    onDragEnter: (event: React.DragEvent) => {
      if (disabled || !hasFiles(event)) {
        return
      }
      event.preventDefault()
      dragDepth.current += 1
      setDraggingOver(true)
    },
    onDragOver: (event: React.DragEvent) => {
      if (disabled || !hasFiles(event)) {
        return
      }
      event.preventDefault()
      event.dataTransfer.dropEffect = "copy"
    },
    onDragLeave: (event: React.DragEvent) => {
      if (disabled) {
        return
      }
      event.preventDefault()
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) {
        setDraggingOver(false)
      }
    },
    onDrop: (event: React.DragEvent) => {
      if (disabled) {
        return
      }
      event.preventDefault()
      dragDepth.current = 0
      setDraggingOver(false)
      const file = event.dataTransfer.files.item(0)
      if (file) {
        onFile(file)
      }
    },
  }
}
