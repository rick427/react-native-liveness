package com.livenesscamera

import android.media.Image
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin

// Vision Camera v4.5+ removed VisionCameraProxyHolder and made FrameProcessorPlugin
// a no-arg constructor. The proxy/options are no longer passed at construction time.
class LivenessCameraPlugin : FrameProcessorPlugin() {

  private val faceDetector = FaceDetection.getClient(
    FaceDetectorOptions.Builder()
      .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
      .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
      .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
      .setContourMode(FaceDetectorOptions.CONTOUR_MODE_NONE)
      .build()
  )

  /**
   * Convert Vision Camera's Orientation to ML Kit rotation degrees.
   * Uses toString() comparison to stay resilient across VC patch versions
   * where the Orientation API (toDegrees / toSurfaceRotation) may vary.
   */
  private fun orientationDegrees(frame: Frame): Int {
    val name = frame.orientation.toString().uppercase()
    return when {
      name.contains("LANDSCAPE_LEFT") -> 90
      name.contains("PORTRAIT_UPSIDE_DOWN") -> 180
      name.contains("LANDSCAPE_RIGHT") -> 270
      else -> 0 // PORTRAIT
    }
  }

  override fun callback(frame: Frame, arguments: Map<String, Any>?): Any {
    val mediaImage: Image = frame.image
    val inputImage = InputImage.fromMediaImage(mediaImage, orientationDegrees(frame))

    return try {
      // Tasks.await blocks the frame-processor thread synchronously.
      // ML Kit face detection is fast (~5–10 ms) so this is acceptable.
      val faces = Tasks.await(faceDetector.process(inputImage))

      if (faces.isEmpty()) {
        return mapOf("detected" to false)
      }

      val face = faces.first()
      val box = face.boundingBox

      mapOf(
        "detected" to true,
        "bounds" to mapOf(
          "x" to box.left.toFloat(),
          "y" to box.top.toFloat(),
          "width" to box.width().toFloat(),
          "height" to box.height().toFloat()
        ),
        "yawAngle" to face.headEulerAngleY,
        "pitchAngle" to face.headEulerAngleX,
        "rollAngle" to face.headEulerAngleZ,
        "leftEyeOpenProbability" to (face.leftEyeOpenProbability ?: -1f),
        "rightEyeOpenProbability" to (face.rightEyeOpenProbability ?: -1f),
        "smilingProbability" to (face.smilingProbability ?: -1f)
      )
    } catch (e: Exception) {
      mapOf("detected" to false)
    }
  }
}
