import type { ModalProps, ViewStyle } from 'react-native';
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
  | 'Position your face in the circle'
  | 'Move closer'
  | 'Move farther away'
  | 'Look straight ahead'
  | 'Hold still...'
  | 'Stay still'
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
   * Per-frame score (0–1) a frame must reach to count as a good frame.
   * Defaults to 0.65. Scored on face presence, size, and head pose only —
   * eye openness is not used (passive detection, no gestures required).
   */
  livenessThreshold?: number;

  /**
   * Number of consecutive good frames required to confirm liveness.
   * Defaults to 7 (~350ms at 20fps).
   */
  confirmFrames?: number;

  /**
   * Style applied to the root container.
   */
  style?: ViewStyle;

  /**
   * Whether to play a shutter sound on capture. Defaults to true.
   */
  soundEnabled?: boolean;

  /**
   * Font family applied to all text inside the component.
   * Defaults to 'Baloo-Medium'. Set to undefined to use the system font.
   */
  fontFamily?: string;
};

export type LivenessCameraModalProps = Omit<LivenessCameraProps, 'style'> & {
  /**
   * Controls modal visibility — pass your own boolean state.
   */
  visible: boolean;

  /**
   * Called when the close button is pressed or the Android back button fires.
   * Use this to set your visible state to false.
   */
  onClose: () => void;

  /**
   * Modal entrance/exit animation. Defaults to 'slide'.
   */
  animationType?: ModalProps['animationType'];

  /**
   * Override styles on the close button container.
   * Useful for adjusting position or size to match your design system.
   */
  closeButtonStyle?: ViewStyle;

  /**
   * Colour of the × icon inside the close button. Defaults to '#fff'.
   */
  closeButtonIconColor?: string;

  /**
   * Size of the × icon in dp. Defaults to 18.
   */
  closeButtonIconSize?: number;
};
