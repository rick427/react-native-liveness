import type { FaceData, FeedbackMessage } from './types';

// Eye openness is intentionally excluded — passive liveness detection does not
// require gestures. Natural blinks are involuntary and must never penalise the
// user. Liveness is confirmed via face presence, size, and frontal pose only.
const WEIGHTS = {
  faceDetected: 0.25,
  faceSize: 0.3,
  headPose: 0.45,
} as const;

// Loosened from 0.20 / 0.65 — gives more room for the user to breathe
const FACE_SIZE_MIN = 0.15;
const FACE_SIZE_MAX = 0.8;
const FACE_SIZE_SOFT_MARGIN = 0.05; // gradient ramp at each edge

// Loosened from 20° — ML Kit head pose is noisy, 25° still rejects clear tilts
const MAX_YAW_DEG = 25;
const MAX_PITCH_DEG = 25;

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

  // Soft-edge face size: smooth ramp into / out of the valid range so a face
  // sitting just outside the threshold doesn't score hard 0.
  let faceSize: number;
  if (faceWidthRatio >= FACE_SIZE_MIN && faceWidthRatio <= FACE_SIZE_MAX) {
    faceSize = 1.0;
  } else if (faceWidthRatio < FACE_SIZE_MIN) {
    faceSize = Math.max(
      0,
      (faceWidthRatio - (FACE_SIZE_MIN - FACE_SIZE_SOFT_MARGIN)) /
        FACE_SIZE_SOFT_MARGIN
    );
  } else {
    faceSize = Math.max(
      0,
      (FACE_SIZE_MAX + FACE_SIZE_SOFT_MARGIN - faceWidthRatio) /
        FACE_SIZE_SOFT_MARGIN
    );
  }

  // Soft-edge head pose: full score inside threshold, linear decay outside
  const yawScore =
    Math.abs(face.yawAngle) <= MAX_YAW_DEG
      ? 1.0
      : Math.max(0, 1 - (Math.abs(face.yawAngle) - MAX_YAW_DEG) / MAX_YAW_DEG);
  const pitchScore =
    Math.abs(face.pitchAngle) <= MAX_PITCH_DEG
      ? 1.0
      : Math.max(
          0,
          1 - (Math.abs(face.pitchAngle) - MAX_PITCH_DEG) / MAX_PITCH_DEG
        );
  const headPose = (yawScore + pitchScore) / 2;

  const total =
    WEIGHTS.faceDetected * 1.0 +
    WEIGHTS.faceSize * faceSize +
    WEIGHTS.headPose * headPose;

  return { total, faceSize, headPose, eyesOpen: 0 };
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
  if (!face.detected) return 'Position your face in the circle';

  const faceWidthRatio = face.bounds.width / frameWidth;
  if (faceWidthRatio < FACE_SIZE_MIN) return 'Move closer';
  if (faceWidthRatio > FACE_SIZE_MAX) return 'Move farther away';

  const yawBad = Math.abs(face.yawAngle) >= MAX_YAW_DEG;
  const pitchBad = Math.abs(face.pitchAngle) >= MAX_PITCH_DEG;
  if (yawBad || pitchBad) return 'Look straight ahead';

  return 'Hold still...';
}
