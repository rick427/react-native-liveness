import VisionCamera
import MLKitFaceDetection
import MLKitVision
import UIKit
import AVFoundation

@objc(LivenessCameraPlugin)
public class LivenessCameraPlugin: FrameProcessorPlugin {

  private var faceDetector: FaceDetector

  // VC v4.5+ removed VisionCameraProxyHolder — use the no-arg init instead.
  public override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]? = [:]) {
    let opts = FaceDetectorOptions()
    opts.performanceMode = .fast
    opts.classificationMode = .all
    opts.landmarkMode = .none
    opts.contourMode = .none
    opts.isTrackingEnabled = false
    self.faceDetector = FaceDetector.faceDetector(options: opts)
    super.init(proxy: proxy, options: options)
  }

  public override func callback(
    _ frame: Frame,
    withArguments arguments: [AnyHashable: Any]?
  ) -> Any {
    let image = VisionImage(buffer: frame.buffer)
    image.orientation = uiOrientation(from: frame)

    do {
      let faces = try faceDetector.results(in: image)
      guard let face = faces.first else {
        return ["detected": false]
      }

      // face.frame is in the coordinate space of the INPUT buffer (before rotation).
      // Report the buffer dimensions so JS can pick the right reference axis.
      let bufW = Double(CVPixelBufferGetWidth(frame.buffer))
      let bufH = Double(CVPixelBufferGetHeight(frame.buffer))

      return [
        "detected": true,
        "bounds": [
          "x": Double(face.frame.origin.x),
          "y": Double(face.frame.origin.y),
          "width": Double(face.frame.size.width),
          "height": Double(face.frame.size.height),
        ],
        "frameWidth": bufW,
        "frameHeight": bufH,
        "yawAngle": Double(face.headEulerAngleY),
        "pitchAngle": Double(face.headEulerAngleX),
        "rollAngle": Double(face.headEulerAngleZ),
        "leftEyeOpenProbability": Double(face.leftEyeOpenProbability),
        "rightEyeOpenProbability": Double(face.rightEyeOpenProbability),
        "smilingProbability": Double(face.smilingProbability),
      ]
    } catch {
      return ["detected": false]
    }
  }

  // MARK: - Orientation helper

  /// Map Vision Camera's frame orientation to the UIImage.Orientation that
  /// ML Kit needs so it sees an upright face regardless of device rotation.
  private func uiOrientation(from frame: Frame) -> UIImage.Orientation {
    switch frame.orientation {
    case .portrait:           return .right
    case .portraitUpsideDown: return .left
    case .landscapeLeft:      return .up
    case .landscapeRight:     return .down
    @unknown default:         return .right
    }
  }
}
