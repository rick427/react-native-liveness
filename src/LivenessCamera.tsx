import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { Ellipse, Path, Svg } from 'react-native-svg';
import { useLivenessCamera } from './useLivenessCamera';
import type { LivenessCameraProps, LivenessState } from './types';

// Oval is sized relative to container WIDTH only, so it stays face-shaped
// on any screen. ry = rx * FACE_RATIO gives a natural portrait face oval.
const OVAL_WIDTH_RATIO = 0.72; // oval width = 72 % of container width
const FACE_RATIO = 1.35; // height-to-width ratio of the oval (~3:4 face)
const STROKE_WIDTH = 3;
// Cubic bezier approximation constant for a smooth ellipse
const K = 0.5523;

/**
 * Returns the stroke colour for the oval guide.
 *
 *  ● White  – no face / scanning (score < 0.4)
 *  ● Yellow – face detected, confidence building (0.4 ≤ score < threshold)
 *  ● Green  – liveness confirmed / countdown / capture
 *  ● Red    – error
 */
function getOvalColor(state: LivenessState, score: number): string {
  switch (state) {
    case 'error':
      return '#FF3B30';
    case 'confirmed':
    case 'countdown':
    case 'capturing':
    case 'done':
      return '#4CAF50';
    default:
      return score >= 0.4 ? '#FFD60A' : '#FFFFFF';
  }
}

/**
 * Returns an SVG path string tracing an ellipse (cx, cy, rx, ry) using
 * cubic bezier curves. Used inside a compound path with fillRule="evenodd"
 * to punch a transparent hole through the dark scrim.
 */
function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return [
    `M ${cx + rx} ${cy}`,
    `C ${cx + rx} ${cy - ry * K} ${cx + rx * K} ${cy - ry} ${cx} ${cy - ry}`,
    `C ${cx - rx * K} ${cy - ry} ${cx - rx} ${cy - ry * K} ${cx - rx} ${cy}`,
    `C ${cx - rx} ${cy + ry * K} ${cx - rx * K} ${cy + ry} ${cx} ${cy + ry}`,
    `C ${cx + rx * K} ${cy + ry} ${cx + rx} ${cy + ry * K} ${cx + rx} ${cy}`,
    'Z',
  ].join(' ');
}

function OvalOverlay({
  width,
  height,
  state,
  score,
}: {
  width: number;
  height: number;
  state: LivenessState;
  score: number;
}) {
  if (width === 0 || height === 0) return null;

  const cx = width / 2;
  // Shift centre slightly above midpoint so the face sits naturally in frame
  const cy = height * 0.45;
  const rx = (width * OVAL_WIDTH_RATIO) / 2;
  const ry = rx * FACE_RATIO;
  const color = getOvalColor(state, score);

  // Compound path: outer rect + oval. evenodd fill rule makes the oval transparent.
  const scrimD = `M0 0H${width}V${height}H0Z ${ellipsePath(cx, cy, rx, ry)}`;

  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
      <Path d={scrimD} fill="rgba(0,0,0,0.55)" fillRule="evenodd" />
      <Ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="none"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
      />
    </Svg>
  );
}

function CountdownBubble({ value }: { value: number }) {
  // key={countdown} in the parent remounts this component on every tick,
  // so [] deps are correct — each mount runs a fresh animation.
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.spring(scale, {
          toValue: 1.2,
          stiffness: 200,
          damping: 6,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1.0,
          stiffness: 150,
          damping: 8,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View
      style={[styles.countdownBubble, { opacity, transform: [{ scale }] }]}
    >
      <Text style={styles.countdownText}>{value}</Text>
    </Animated.View>
  );
}

export function LivenessCamera({
  onCapture,
  onLivenessConfirmed,
  onError,
  countdownFrom = 3,
  livenessThreshold = 0.75,
  confirmFrames = 15,
  soundEnabled = true,
  style,
}: LivenessCameraProps) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const cameraRef = useRef<Camera>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const { frameProcessor, livenessState, livenessScore, countdown, feedback } =
    useLivenessCamera({
      livenessThreshold,
      confirmFrames,
      countdownFrom,
      soundEnabled,
      cameraRef,
      onCapture,
      onLivenessConfirmed,
      onError,
    });

  const handleLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      setContainerSize({ width, height });
    },
    []
  );

  useEffect(() => {
    if (!hasPermission) {
      requestPermission().catch(() => {
        onError?.(new Error('Camera permission denied'));
      });
    }
  }, [hasPermission, requestPermission, onError]);

  if (!hasPermission) {
    return (
      <View style={[styles.root, style, styles.centered]}>
        <Text style={styles.permissionText}>Camera permission required</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.root, style, styles.centered]}>
        <Text style={styles.permissionText}>No front camera found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, style]} onLayout={handleLayout}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={livenessState !== 'done' && livenessState !== 'error'}
        frameProcessor={frameProcessor}
        photo
        pixelFormat="yuv"
      />
      <OvalOverlay
        width={containerSize.width}
        height={containerSize.height}
        state={livenessState}
        score={livenessScore}
      />
      {livenessState !== 'done' && (
        <View style={styles.feedbackContainer}>
          <Text style={styles.feedbackText}>{feedback}</Text>
        </View>
      )}
      {livenessState === 'countdown' && countdown !== null && (
        <View style={styles.countdownContainer}>
          <CountdownBubble key={countdown} value={countdown} />
        </View>
      )}
      {livenessState === 'capturing' && (
        <View style={styles.captureFlash} pointerEvents="none" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  feedbackContainer: {
    position: 'absolute',
    bottom: '12%',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  feedbackText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  countdownContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownBubble: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    color: '#fff',
    fontSize: 52,
    fontWeight: '700',
    lineHeight: 60,
  },
  captureFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    opacity: 0.4,
  },
});
