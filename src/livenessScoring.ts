import type { FaceData, FeedbackMessage } from './types';

// ─── Thresholds ───────────────────────────────────────────────────────────────
const FACE_SIZE_MIN = 0.15;
const FACE_SIZE_MAX = 0.8;

// ─── Challenge step ───────────────────────────────────────────────────────────
export type ChallengeStep = {
  /** Text shown to the user while this step is active. */
  instruction: FeedbackMessage;
  /** How many consecutive ML Kit frames must pass the check to complete the step. */
  framesRequired: number;
  /** Returns true when the face satisfies this step's condition. */
  check: (face: FaceData, frameWidth: number) => boolean;
};

/**
 * Sequential liveness challenges.
 * Each step completes when `framesRequired` consecutive frames pass `check`.
 * The progress arc fills 1/N per step, then turns green at the end.
 */
export const CHALLENGE_STEPS: readonly ChallengeStep[] = [
  {
    instruction: 'Position your face in the circle',
    framesRequired: 5,
    check: (face, fw) => {
      if (!face.detected || fw === 0) return false;
      const ratio = face.bounds.width / fw;
      return (
        ratio >= FACE_SIZE_MIN &&
        ratio <= FACE_SIZE_MAX &&
        Math.abs(face.yawAngle) < 20 &&
        Math.abs(face.pitchAngle) < 20
      );
    },
  },
  {
    instruction: 'Turn your head slightly',
    framesRequired: 4,
    check: (face) => face.detected && Math.abs(face.yawAngle) > 15,
  },
  {
    instruction: 'Now look straight ahead',
    framesRequired: 5,
    check: (face) =>
      face.detected &&
      Math.abs(face.yawAngle) < 10 &&
      Math.abs(face.pitchAngle) < 15,
  },
  {
    instruction: 'Now blink',
    framesRequired: 2,
    check: (face) => {
      if (!face.detected) return false;
      const l = face.leftEyeOpenProbability;
      const r = face.rightEyeOpenProbability;
      // -1 means ML Kit couldn't classify — don't count as a blink
      return l >= 0 && l < 0.3 && r >= 0 && r < 0.3;
    },
  },
] as const;
