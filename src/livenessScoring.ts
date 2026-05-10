import type { FaceData, FeedbackMessage } from './types';

const WEIGHTS = {
  faceDetected: 0.2,
  faceSize: 0.2,
  headPose: 0.3,
  eyesOpen: 0.3,
} as const;

const FACE_SIZE_MIN = 0.2;
const FACE_SIZE_MAX = 0.65;
const MAX_YAW_DEG = 20;
const MAX_PITCH_DEG = 20;

export type FrameScore = {
  total: number;
  faceSize: number;
  headPose: number;
  eyesOpen: number;
};

export function scoreFrame(face: FaceData, frameWidth: number): FrameScore {
  if (!face.detected || frameWidth === 0) {
    return { total: 0, faceSize: 0, headPose: 0, eyesOpen: 0 };
  }

  const faceWidthRatio = face.bounds.width / frameWidth;
  const faceSize =
    faceWidthRatio >= FACE_SIZE_MIN && faceWidthRatio <= FACE_SIZE_MAX
      ? 1.0
      : 0.0;

  const yawOK = Math.abs(face.yawAngle) < MAX_YAW_DEG;
  const pitchOK = Math.abs(face.pitchAngle) < MAX_PITCH_DEG;
  const headPose = (yawOK ? 0.5 : 0) + (pitchOK ? 0.5 : 0);

  // ML Kit returns -1 when classification is disabled or unavailable
  const leftEye =
    face.leftEyeOpenProbability >= 0 ? face.leftEyeOpenProbability : 0.5;
  const rightEye =
    face.rightEyeOpenProbability >= 0 ? face.rightEyeOpenProbability : 0.5;
  const eyesOpen = (leftEye + rightEye) / 2;

  const total =
    WEIGHTS.faceDetected * 1.0 +
    WEIGHTS.faceSize * faceSize +
    WEIGHTS.headPose * headPose +
    WEIGHTS.eyesOpen * eyesOpen;

  return { total, faceSize, headPose, eyesOpen };
}

export function rollingAverage(scores: number[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function getFeedback(
  face: FaceData,
  frameWidth: number,
  livenessConfirmed: boolean
): FeedbackMessage {
  if (livenessConfirmed) return 'Liveness confirmed';
  if (!face.detected) return 'Position your face in the oval';

  const faceWidthRatio = face.bounds.width / frameWidth;
  if (faceWidthRatio < FACE_SIZE_MIN) return 'Move closer';
  if (faceWidthRatio > FACE_SIZE_MAX) return 'Move farther away';

  const yawBad = Math.abs(face.yawAngle) >= MAX_YAW_DEG;
  const pitchBad = Math.abs(face.pitchAngle) >= MAX_PITCH_DEG;
  if (yawBad || pitchBad) return 'Look straight ahead';

  const leftEye =
    face.leftEyeOpenProbability >= 0 ? face.leftEyeOpenProbability : 1;
  const rightEye =
    face.rightEyeOpenProbability >= 0 ? face.rightEyeOpenProbability : 1;
  if (leftEye < 0.4 || rightEye < 0.4) return 'Open your eyes';

  return 'Hold still...';
}
