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
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("detectLiveness") { proxy, options ->
        LivenessCameraPlugin(proxy, options)
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
