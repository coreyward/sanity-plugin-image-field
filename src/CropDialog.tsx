import { useState } from "react"
import { Box, Button, Card, Dialog, Flex, Stack, Text } from "@sanity/ui"
import {
  CheckmarkCircleIcon,
  ErrorOutlineIcon,
  ResetIcon,
  WarningOutlineIcon,
} from "@sanity/icons"
import { type ImageCrop, type ImageHotspot } from "sanity"
import {
  applyRatio,
  croppedDimensions,
  cropToPixelRect,
  defaultCrop,
  dimensionsAtLeast,
  focalPointToHotspot,
  formatAspectRatio,
  hotspotToFocalPoint,
  type PixelRect,
  pixelRectToCrop,
} from "./cropMath"
import { nearestRatio } from "./utils"
import { CropArea } from "./CropArea"
import { type SanityImageSource, sourceImageUrl } from "./imageUrl"
import { type Dimensions, type ResolvedImageFieldConfig } from "./types"

type CropDialogProps = {
  assetRef: string
  imageSource: SanityImageSource
  sourceDimensions: Dimensions
  config: ResolvedImageFieldConfig
  initialCrop?: ImageCrop
  hotspotEnabled?: boolean
  initialHotspot?: ImageHotspot
  onConfirm: (result: { crop: ImageCrop; hotspot?: ImageHotspot }) => void
  onClose: () => void
}

/**
 * The default hotspot stored when focal-point editing is enabled and no hotspot
 * exists yet: centered, with a minimal footprint. Width and height are
 * normalized fractions of the image's coordinate space, not pixels. The render
 * path reads only x/y and ignores the size, so these values only keep the stored
 * hotspot well-formed for tools that draw the focal ellipse. They are 0.01
 * rather than 1 because a width of 1 spans the whole image, which is valid only
 * when the focal region can fill the available rectangle. A focal point is a
 * small target, so it defaults to a small dot.
 */
const CENTERED_HOTSPOT: ImageHotspot = {
  _type: "sanity.imageHotspot",
  x: 0.5,
  y: 0.5,
  width: 0.01,
  height: 0.01,
}

/**
 * The modal crop editor. It opens on the existing crop when re-cropping, or on
 * the largest valid crop on first upload. It shows the current dimensions and
 * disables confirmation while the crop is under the required size. With
 * `hotspotEnabled`, it also edits a focal point.
 */
export const CropDialog = ({
  assetRef,
  imageSource,
  sourceDimensions,
  config,
  initialCrop,
  hotspotEnabled,
  initialHotspot,
  onConfirm,
  onClose,
}: CropDialogProps) => {
  const {
    aspectRatioRange,
    snapRatios,
    recommendedDimensions,
    requiredDimensions,
  } = config

  const [rect, setRect] = useState<PixelRect>(() => {
    if (!initialCrop) {
      return defaultCrop(sourceDimensions, aspectRatioRange, snapRatios)
    }
    // Snap a stored crop to an allowed ratio on open, so a snap-set field never
    // shows an in-between ratio.
    const loaded = cropToPixelRect(initialCrop, sourceDimensions)
    return snapRatios
      ? applyRatio(
          loaded,
          nearestRatio(loaded.width / loaded.height, snapRatios),
          sourceDimensions
        )
      : loaded
  })

  const [focalPoint, setFocalPoint] = useState(() =>
    initialHotspot
      ? hotspotToFocalPoint(initialHotspot, rect, sourceDimensions)
      : { x: 0.5, y: 0.5 }
  )

  const dimensions = croppedDimensions(rect)
  const belowRequired =
    requiredDimensions && !dimensionsAtLeast(dimensions, requiredDimensions)
  const belowRecommended =
    recommendedDimensions &&
    !dimensionsAtLeast(dimensions, recommendedDimensions)

  return (
    <Dialog
      id="aspect-ratio-crop-dialog"
      header="Crop image"
      width={2}
      onClose={onClose}
      footer={
        <Flex padding={3} justify="space-between" align="center" gap={3}>
          <Button
            mode="bleed"
            icon={ResetIcon}
            text="Reset crop"
            fontSize={1}
            onClick={() => {
              setRect(
                defaultCrop(sourceDimensions, aspectRatioRange, snapRatios)
              )
            }}
          />
          <Flex gap={2}>
            <Button mode="ghost" text="Cancel" onClick={onClose} />
            <Button
              tone="primary"
              text="Confirm crop"
              disabled={belowRequired}
              onClick={() => {
                onConfirm({
                  crop: pixelRectToCrop(rect, sourceDimensions),
                  hotspot: hotspotEnabled
                    ? focalPointToHotspot(
                        focalPoint,
                        rect,
                        sourceDimensions,
                        initialHotspot ?? CENTERED_HOTSPOT
                      )
                    : undefined,
                })
              }}
            />
          </Flex>
        </Flex>
      }
    >
      <Stack gap={3} padding={3}>
        <CropArea
          imageUrl={sourceImageUrl(assetRef, imageSource)}
          sourceDimensions={sourceDimensions}
          range={aspectRatioRange}
          snapRatios={snapRatios}
          rect={rect}
          onChange={setRect}
          focalPoint={hotspotEnabled ? focalPoint : undefined}
          onFocalPointChange={hotspotEnabled ? setFocalPoint : undefined}
        />

        <Flex justify="space-between" align="center" gap={3} wrap="wrap">
          <Text size={1} muted>
            Allowed aspect ratio: {describeAspectRatio(config)}
          </Text>
          <Text size={1} weight="medium">
            {dimensions.width} × {dimensions.height} px
          </Text>
        </Flex>

        {hotspotEnabled && (
          <Text size={1} muted>
            Drag the circle to set the focal point. It governs how cover-mode
            crops frame the image downstream, not this preview.
          </Text>
        )}

        <DimensionStatusMessage
          requiredDimensions={requiredDimensions}
          recommendedDimensions={recommendedDimensions}
          belowRequired={belowRequired}
          belowRecommended={belowRecommended}
        />
      </Stack>
    </Dialog>
  )
}

const StatusMessage = ({
  tone,
  icon,
  message,
}: {
  tone: "critical" | "caution" | "positive"
  icon: React.ReactNode
  message: string
}) => (
  <Card tone={tone} padding={3} radius={2} border>
    <Flex gap={3} align="center">
      <Text size={1}>{icon}</Text>
      <Box flex={1}>
        <Text size={1} textOverflow="ellipsis">
          {message}
        </Text>
      </Box>
    </Flex>
  </Card>
)

/**
 * The size status shown beneath the crop. Renders a message when the field
 * sets a required or recommended size: a warning when the crop is too small,
 * or a confirmation when it meets both limits. Renders nothing when no size
 * limits are set. Required limits take priority over recommended ones.
 */
const DimensionStatusMessage = ({
  requiredDimensions,
  recommendedDimensions,
  belowRequired,
  belowRecommended,
}: {
  requiredDimensions?: Dimensions
  recommendedDimensions?: Dimensions
  belowRequired?: boolean
  belowRecommended?: boolean
}) => {
  if (requiredDimensions && belowRequired) {
    return (
      <StatusMessage
        tone="critical"
        icon={<ErrorOutlineIcon />}
        message={`Crop must be at least ${describeDimensions(requiredDimensions)}.`}
      />
    )
  }
  if (recommendedDimensions && belowRecommended) {
    return (
      <StatusMessage
        tone="caution"
        icon={<WarningOutlineIcon />}
        message={`For best results, keep the crop at least ${describeDimensions(
          recommendedDimensions
        )}.`}
      />
    )
  }
  if (requiredDimensions || recommendedDimensions) {
    // Keep the dialog height stable as the crop crosses size thresholds.
    return (
      <StatusMessage
        tone="positive"
        icon={<CheckmarkCircleIcon />}
        message="Crop size looks good."
      />
    )
  }
  return null
}

const describeDimensions = (dimensions: Dimensions) =>
  `${dimensions.width} × ${dimensions.height} px`

/**
 * Build the "Allowed aspect ratio" label. A snap set of three or fewer ratios
 * lists them all, and a larger set shows its extremes and a count. A continuous
 * field shows a single ratio when min equals max, otherwise a range.
 */
const describeAspectRatio = ({
  aspectRatioRange,
  snapRatios,
}: ResolvedImageFieldConfig): string => {
  if (snapRatios) {
    if (snapRatios.length <= 3) {
      return snapRatios.map(formatAspectRatio).join(", ")
    }
    const lo = formatAspectRatio(Math.min(...snapRatios))
    const hi = formatAspectRatio(Math.max(...snapRatios))
    return `${snapRatios.length} ratios (${lo} – ${hi})`
  }
  return aspectRatioRange.min === aspectRatioRange.max
    ? formatAspectRatio(aspectRatioRange.min)
    : `${formatAspectRatio(aspectRatioRange.min)} – ${formatAspectRatio(
        aspectRatioRange.max
      )}`
}
