import { useMemo } from 'react';
import { VisionCameraProxy, type Frame } from 'react-native-vision-camera';
import type { FaceData } from './types';

type LivenessPlugin = {
  detectLiveness: (frame: Frame) => FaceData | null;
};

function createPlugin(): LivenessPlugin {
  const plugin = VisionCameraProxy.initFrameProcessorPlugin('detectLiveness', {});

  if (!plugin) {
    throw new Error(
      '[LivenessCamera] Frame Processor Plugin "detectLiveness" not found. ' +
        'Make sure the native module is linked correctly.'
    );
  }

  return {
    detectLiveness: (frame: Frame): FaceData | null => {
      'worklet';
      const result = plugin.call(frame);
      // plugin.call returns a loosely-typed BasicParameterType — cast via unknown
      return result as unknown as FaceData | null;
    },
  };
}

export function useLivenessPlugin(): LivenessPlugin {
  return useMemo(() => createPlugin(), []);
}
