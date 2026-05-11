import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Camera, Frame } from 'react-native-vision-camera';
import { runAtTargetFps, useFrameProcessor } from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import { useLivenessPlugin } from './LivenessDetector';
import { CHALLENGE_STEPS } from './livenessScoring';
import type {
  CaptureResult,
  FaceData,
  FeedbackMessage,
  LivenessState,
} from './types';

const TOTAL_STEPS = CHALLENGE_STEPS.length;

type Options = {
  countdownFrom: number;
  soundEnabled: boolean;
  cameraRef: React.RefObject<Camera | null>;
  onCapture: (result: CaptureResult) => void;
  onLivenessConfirmed?: () => void;
  onError?: (error: Error) => void;
};

type LivenessCameraState = {
  livenessState: LivenessState;
  /** Challenge progress 0–1. Drives the arc. */
  livenessScore: number;
  countdown: number | null;
  feedback: FeedbackMessage;
};

export function useLivenessCamera(options: Options) {
  const {
    countdownFrom,
    soundEnabled,
    cameraRef,
    onCapture,
    onLivenessConfirmed,
    onError,
  } = options;

  const plugin = useLivenessPlugin();

  // ── Step machine refs — mutated every frame, never cause re-renders ────────
  const currentStepIdx = useRef(0);
  const stepFrameCount = useRef(0);
  const stateRef = useRef<LivenessState>('scanning');
  const isCaptured = useRef(false);

  const [state, setState] = useState<LivenessCameraState>({
    livenessState: 'scanning',
    livenessScore: 0,
    countdown: null,
    feedback: CHALLENGE_STEPS[0]!.instruction,
  });

  const setLivenessState = useCallback((next: LivenessState) => {
    stateRef.current = next;
    setState((prev) => ({ ...prev, livenessState: next }));
  }, []);

  // ── Capture ────────────────────────────────────────────────────────────────
  const capture = useCallback(async () => {
    if (isCaptured.current || !cameraRef.current) return;
    isCaptured.current = true;
    setLivenessState('capturing');
    try {
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        enableShutterSound: soundEnabled,
      });
      setLivenessState('done');
      onCapture({ photo, livenessScore: 1, timestamp: Date.now() });
    } catch (err) {
      setLivenessState('error');
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [cameraRef, onCapture, onError, soundEnabled, setLivenessState]);

  // ── Countdown ──────────────────────────────────────────────────────────────
  const startCountdown = useCallback(() => {
    setLivenessState('countdown');
    let tick = countdownFrom;
    setState((prev) => ({ ...prev, countdown: tick }));
    const interval = setInterval(() => {
      tick -= 1;
      if (tick <= 0) {
        clearInterval(interval);
        setState((prev) => ({ ...prev, countdown: null }));
        capture();
      } else {
        setState((prev) => ({ ...prev, countdown: tick }));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [capture, countdownFrom, setLivenessState]);

  // ── Per-frame face handler (runs on JS thread, called from worklet) ────────
  const handleFaceData = useCallback(
    (face: FaceData | null, width: number) => {
      const s = stateRef.current;
      if (
        s === 'confirmed' ||
        s === 'countdown' ||
        s === 'capturing' ||
        s === 'done' ||
        s === 'error'
      )
        return;

      const safeFace: FaceData = face ?? {
        detected: false,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        yawAngle: 0,
        pitchAngle: 0,
        rollAngle: 0,
        leftEyeOpenProbability: -1,
        rightEyeOpenProbability: -1,
        smilingProbability: -1,
      };

      const step = CHALLENGE_STEPS[currentStepIdx.current]!;
      const stepMet = step.check(safeFace, width);

      // Advance or gently decay the frame counter
      if (stepMet) {
        stepFrameCount.current += 1;
      } else {
        stepFrameCount.current = Math.max(0, stepFrameCount.current - 1);
      }

      // Step complete?
      if (stepFrameCount.current >= step.framesRequired) {
        stepFrameCount.current = 0;
        const nextIdx = currentStepIdx.current + 1;

        if (nextIdx >= TOTAL_STEPS) {
          // All challenges done — confirm liveness
          setState((prev) => ({
            ...prev,
            livenessScore: 1,
            feedback: 'Liveness confirmed',
          }));
          setLivenessState('confirmed');
          onLivenessConfirmed?.();
          startCountdown();
        } else {
          // Advance to next challenge
          currentStepIdx.current = nextIdx;
          setState((prev) => ({
            ...prev,
            livenessScore: nextIdx / TOTAL_STEPS,
            feedback: CHALLENGE_STEPS[nextIdx]!.instruction,
          }));
        }
        return;
      }

      // Smooth arc progress within the current step
      const progress =
        (currentStepIdx.current +
          stepFrameCount.current / step.framesRequired) /
        TOTAL_STEPS;
      setState((prev) => ({ ...prev, livenessScore: progress }));
    },
    [onLivenessConfirmed, setLivenessState, startCountdown]
  );

  // ── Frame processor ────────────────────────────────────────────────────────
  const handleFaceDataJS = useMemo(
    () => Worklets.createRunOnJS(handleFaceData),
    [handleFaceData]
  );

  const frameProcessor = useFrameProcessor(
    (frame: Frame) => {
      'worklet';
      runAtTargetFps(20, () => {
        'worklet';
        const face = plugin.detectLiveness(frame);
        handleFaceDataJS(face, frame.width);
      });
    },
    [plugin, handleFaceDataJS]
  );

  useEffect(() => {
    return () => {
      currentStepIdx.current = 0;
      stepFrameCount.current = 0;
      isCaptured.current = false;
    };
  }, []);

  return {
    frameProcessor,
    livenessState: state.livenessState,
    livenessScore: state.livenessScore,
    countdown: state.countdown,
    feedback: state.feedback,
  };
}
