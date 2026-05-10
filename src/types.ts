import type { ViewStyle } from 'react-native';
import type { PhotoFile } from 'react-native-vision-camera';

export type FaceData = {
  detected: boolean;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  yawAngle: number;
  pitchAngle: number;
  rollAngle: number;
  leftEyeOpenProbability: number;
  rightEyeOpenProbability: number;
  smilingProbability: number;
};

export type LivenessState =
  | 'idle'
  | 'scanning'
  | 'confirmed'
  | 'countdown'
  | 'capturing'
  | 'done'
  | 'error';

export type FeedbackMessage =
  | 'Position your face in the oval'
  | 'Move closer'
  | 'Move farther away'
  | 'Look straight ahead'
  | 'Hold still...'
  | 'Stay still'
  | 'Open your eyes'
  | 'Liveness confirmed'
  | '';

export type CaptureResult = {
  photo: PhotoFile;
  livenessScore: number;
  timestamp: number;
};

export type LivenessCameraProps = {
  /**
   * Called when liveness is confirmed and photo is captured.
   */
  onCapture: (result: CaptureResult) => void;

  /**
   * Called the moment liveness is confirmed, before the countdown starts.
   */
  onLivenessConfirmed?: () => void;

  /**
   * Called on any unrecoverable error.
   */
  onError?: (error: Error) => void;

  /**
   * Countdown start value. Defaults to 3.
   */
  countdownFrom?: number;

  /**
   * Score (0–1) required to confirm liveness. Defaults to 0.75.
   */
  livenessThreshold?: number;

  /**
   * Number of consecutive high-score frames required before liveness is
   * confirmed. Defaults to 15 (~500ms at 30fps).
   */
  confirmFrames?: number;

  /**
   * Style applied to the root container.
   */
  style?: ViewStyle;

  /**
   * Whether to play a shutter sound on capture. Requires react-native-sound
   * to be installed. Defaults to true.
   */
  soundEnabled?: boolean;
};
