#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/FrameProcessorPluginRegistry.h>
#import <VisionCamera/VisionCameraProxyHolder.h>

// Registers the Swift class "LivenessCameraPlugin" under the JS name "detectLiveness".
// VisionCameraProxy.initFrameProcessorPlugin('detectLiveness') on the JS side
// will resolve to this class.
VISION_EXPORT_FRAME_PROCESSOR(LivenessCameraPlugin, detectLiveness)
