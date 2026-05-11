import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Camera, Frame } from 'react-native-vision-camera';
import { runAtTargetFps, useFrameProcessor } from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import { useLivenessPlugin } from './LivenessDetector';
import { getFeedback, rollingAverage, scoreFrame } from './livenessScoring';
import type {
  CaptureResult,
  FaceData,
  FeedbackMessage,
  LivenessState,
} from './types';

const WINDOW_SIZE = 20;
// How many frames to decay consecutiveGood by on a bad frame.
// Decay (not hard reset) means one noisy frame won't erase all progress.
const CONSECUTIVE_DECAY = 2;

type Options = {
  livenessThreshold: number;
  confirmFrames: number;
  countdownFrom: number;
  soundEnabled: boolean;
  cameraRef: React.RefObject<Camera | null>;
  onCapture: (result: CaptureResult) => void;
  onLivenessConfirmed?: () => void;
  onError?: (error: Error) => void;
};

type LivenessCameraState = {
  livenessState: LivenessState;
  livenessScore: number;
  countdown: number | null;
  feedback: FeedbackMessage;
};

export function useLivenessCamera(options: Options) {
  const {
    livenessThreshold,
    confirmFrames,
    countdownFrom,
    soundEnabled,
    cameraRef,
    onCapture,
    onLivenessConfirmed,
    onError,
  } = options;

  const plugin = useLivenessPlugin();

  // Mutable refs — updated every frame, never cause re-renders
  const frameScores = useRef<number[]>([]);
  const consecutiveGood = useRef(0);
  const frameWidth = useRef(0);
  const stateRef = useRef<LivenessState>('scanning');
  const isCaptured = useRef(false);

  // Feedback debouncing: only update the displayed text after the same message
  // has been stable for FEEDBACK_DEBOUNCE_MS. Prevents rapid flickering when
  // ML Kit oscillates between two states on consecutive frames.
  const FEEDBACK_DEBOUNCE_MS = 400;
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFeedback = useRef<FeedbackMessage>(
    'Position your face in the circle'
  );

  const [state, setState] = useState<LivenessCameraState>({
    livenessState: 'scanning',
    livenessScore: 0,
    countdown: null,
    feedback: 'Position your face in the circle',
  });

  const setLivenessState = useCallback((next: LivenessState) => {
    stateRef.current = next;
    setState((prev) => ({ ...prev, livenessState: next }));
  }, []);

  // ─── Capture ──────────────────────────────────────────────────────────────

  const capture = useCallback(async () => {
    if (isCaptured.current || !cameraRef.current) return;
    isCaptured.current = true;

    setLivenessState('capturing');

    try {
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        enableShutterSound: soundEnabled,
      });
      const score = rollingAverage(frameScores.current);

      setLivenessState('done');
      onCapture({ photo, livenessScore: score, timestamp: Date.now() });
    } catch (err) {
      setLivenessState('error');
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [cameraRef, onCapture, onError, soundEnabled, setLivenessState]);

  // ─── Countdown ────────────────────────────────────────────────────────────

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

  // ─── Per-frame face handler (runs on JS thread, called from worklet) ──────

  const handleFaceData = useCallback(
    (face: FaceData | null, width: number) => {
      if (
        stateRef.current === 'capturing' ||
        stateRef.current === 'done' ||
        stateRef.current === 'error'
      ) {
        return;
      }

      frameWidth.current = width;

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

      const { total } = scoreFrame(safeFace, width);

      frameScores.current.push(total);
      if (frameScores.current.length > WINDOW_SIZE) {
        frameScores.current.shift();
      }

      const avgScore = rollingAverage(frameScores.current);

      // Decay on bad frames instead of hard reset — one noisy ML Kit result
      // won't wipe out progress the user has already built up.
      if (total >= livenessThreshold) {
        consecutiveGood.current += 1;
      } else {
        consecutiveGood.current = Math.max(
          0,
          consecutiveGood.current - CONSECUTIVE_DECAY
        );
      }

      const isLive =
        consecutiveGood.current >= confirmFrames &&
        avgScore >= livenessThreshold;

      // Debounce the feedback text: only apply a new message after it has been
      // stable for FEEDBACK_DEBOUNCE_MS, preventing rapid label flickering.
      const newFeedback = getFeedback(safeFace, width, isLive);
      if (newFeedback !== pendingFeedback.current) {
        pendingFeedback.current = newFeedback;
        if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
        feedbackTimer.current = setTimeout(() => {
          setState((prev) => ({
            ...prev,
            feedback: pendingFeedback.current,
          }));
        }, FEEDBACK_DEBOUNCE_MS);
      }

      setState((prev) => ({ ...prev, livenessScore: avgScore }));

      if (isLive && stateRef.current === 'scanning') {
        setLivenessState('confirmed');
        onLivenessConfirmed?.();
        startCountdown();
      }
    },
    [
      confirmFrames,
      livenessThreshold,
      onLivenessConfirmed,
      setLivenessState,
      startCountdown,
    ]
  );

  // ─── Frame processor ──────────────────────────────────────────────────────

  const handleFaceDataJS = useMemo(
    () => Worklets.createRunOnJS(handleFaceData),
    [handleFaceData]
  );

  const frameProcessor = useFrameProcessor(
    (frame: Frame) => {
      'worklet';
      // Camera preview renders at full fps (60). ML Kit only needs ~20fps —
      // running it on every frame would block the render thread unnecessarily.
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
      frameScores.current = [];
      consecutiveGood.current = 0;
      isCaptured.current = false;
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
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
