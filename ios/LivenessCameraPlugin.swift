import VisionCamera
import MLKitFaceDetection
import MLKitVision
import UIKit
import AVFoundation

@objc(LivenessCameraPlugin)
public class LivenessCameraPlugin: FrameProcessorPlugin {

  private var faceDetector: FaceDetector

  public override init(
    proxy: VisionCameraProxyHolder,
    options: [AnyHashable: Any]? = [:]
  ) {
    let detectorOptions = FaceDetectorOptions()
    detectorOptions.performanceMode = .fast
    detectorOptions.classificationMode = .all   // gives eye/smile probabilities
    detectorOptions.landmarkMode = .none
    detectorOptions.contourMode = .none
    detectorOptions.isTrackingEnabled = false
    self.faceDetector = FaceDetector.faceDetector(options: detectorOptions)
    super.init(proxy: proxy, options: options)
  }

  public override func callback(
    _ frame: Frame,
    withArguments arguments: [AnyHashable: Any]?
  ) -> Any {
    // Vision Camera frames arrive rotated 90° — swap width/height for ML Kit
    let image = VisionImage(buffer: frame.buffer)
    image.orientation = imageOrientation(from: frame.orientation)

    do {
      let faces = try faceDetector.results(in: image)
      guard let face = faces.first else {
        return ["detected": false]
      }

      return [
        "detected": true,
        "bounds": [
          "x": face.frame.origin.x,
          "y": face.frame.origin.y,
          "width": face.frame.size.width,
          "height": face.frame.size.height,
        ],
        "yawAngle": face.headEulerAngleY,
        "pitchAngle": face.headEulerAngleX,
        "rollAngle": face.headEulerAngleZ,
        "leftEyeOpenProbability": face.leftEyeOpenProbability,
        "rightEyeOpenProbability": face.rightEyeOpenProbability,
        "smilingProbability": face.smilingProbability,
      ]
    } catch {
      return ["detected": false]
    }
  }

  // MARK: - Helpers

  private func imageOrientation(
    from orientation: UIImage.Orientation
  ) -> UIImage.Orientation {
    // Vision Camera already exposes the correct UIImage.Orientation from
    // frame.orientation in v4; return it directly for ML Kit.
    return orientation
  }
}
