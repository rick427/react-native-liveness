package com.livenesscamera

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

class LivenessCameraPackage : ReactPackage {

  companion object {
    init {
      // Register the frame processor plugin under the name "detectLiveness".
      // JS side calls VisionCameraProxy.initFrameProcessorPlugin('detectLiveness').
      // Lambda ignores proxy/options — FrameProcessorPlugin is no-arg in VC v4.5+.
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("detectLiveness") { _, _ ->
        LivenessCameraPlugin()
      }
    }
  }

  override fun createNativeModules(
    reactContext: ReactApplicationContext
  ): MutableList<NativeModule> = mutableListOf()

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): MutableList<ViewManager<*, *>> = mutableListOf()
}
