package com.livenesscamera

import android.media.Image
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin

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
   * Uses toString() to stay resilient across VC patch-version API churn.
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

      // IMPORTANT: All numeric values must be Double, not Float.
      // JSI (Vision Camera's JS bridge) cannot convert Java Float → jsi::Value
      // and throws "Cannot convert Java type class java.lang.Float" at runtime.
      mapOf(
        "detected" to true,
        "bounds" to mapOf(
          "x" to box.left.toDouble(),
          "y" to box.top.toDouble(),
          "width" to box.width().toDouble(),
          "height" to box.height().toDouble()
        ),
        // Pass both buffer dimensions so JS can use the shorter side as the
        // face-size reference (avoids landscape-vs-portrait ratio errors).
        "frameWidth" to mediaImage.width.toDouble(),
        "frameHeight" to mediaImage.height.toDouble(),
        "yawAngle" to face.headEulerAngleY.toDouble(),
        "pitchAngle" to face.headEulerAngleX.toDouble(),
        "rollAngle" to face.headEulerAngleZ.toDouble(),
        "leftEyeOpenProbability" to (face.leftEyeOpenProbability?.toDouble() ?: -1.0),
        "rightEyeOpenProbability" to (face.rightEyeOpenProbability?.toDouble() ?: -1.0),
        "smilingProbability" to (face.smilingProbability?.toDouble() ?: -1.0)
      )
    } catch (e: Exception) {
      mapOf("detected" to false)
    }
  }
}
