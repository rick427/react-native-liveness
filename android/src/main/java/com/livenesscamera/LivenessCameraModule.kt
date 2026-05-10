package com.livenesscamera

import com.facebook.react.bridge.ReactApplicationContext

class LivenessCameraModule(reactContext: ReactApplicationContext) :
  NativeLivenessCameraSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = NativeLivenessCameraSpec.NAME
  }
}
