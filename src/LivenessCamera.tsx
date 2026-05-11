import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
} from 'react-native-vision-camera';
import { Circle, Path, Svg } from 'react-native-svg';
import { useLivenessCamera } from './useLivenessCamera';
import type { LivenessCameraProps, LivenessState } from './types';

const DEFAULT_FONT = 'Baloo-Medium';

// Circle diameter = 82 % of container width — large enough to fit any face
// comfortably without the user needing to fiddle with distance.
const CIRCLE_DIAMETER_RATIO = 0.82;
const STROKE_WIDTH = 3;
// Cubic bezier approximation constant for a smooth circle path
const K = 0.5523;

/**
 * Returns the stroke colour for the circle guide.
 *
 *  ● White  – no face / scanning (score < 0.4)
 *  ● Yellow – face detected, confidence building (0.4 ≤ score < threshold)
 *  ● Green  – liveness confirmed / countdown / capture
 *  ● Red    – error
 */
function getCircleColor(state: LivenessState, score: number): string {
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
 * Returns an SVG path string tracing a circle at (cx, cy) with radius r
 * using cubic bezier curves. Used inside a compound path with
 * fillRule="evenodd" to punch a transparent hole through the dark scrim.
 */
function circlePath(cx: number, cy: number, r: number): string {
  return [
    `M ${cx + r} ${cy}`,
    `C ${cx + r} ${cy - r * K} ${cx + r * K} ${cy - r} ${cx} ${cy - r}`,
    `C ${cx - r * K} ${cy - r} ${cx - r} ${cy - r * K} ${cx - r} ${cy}`,
    `C ${cx - r} ${cy + r * K} ${cx - r * K} ${cy + r} ${cx} ${cy + r}`,
    `C ${cx + r * K} ${cy + r} ${cx + r} ${cy + r * K} ${cx + r} ${cy}`,
    'Z',
  ].join(' ');
}

function CircleOverlay({
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
  const cy = height * 0.42;
  const r = (width * CIRCLE_DIAMETER_RATIO) / 2;
  const color = getCircleColor(state, score);

  const scrimD = `M0 0H${width}V${height}H0Z ${circlePath(cx, cy, r)}`;

  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
      <Path d={scrimD} fill="rgba(0,0,0,0.55)" fillRule="evenodd" />
      <Circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
      />
    </Svg>
  );
}

function CountdownBubble({
  value,
  fontFamily,
}: {
  value: number;
  fontFamily: string;
}) {
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
      <Text style={[styles.countdownText, { fontFamily }]}>{value}</Text>
    </Animated.View>
  );
}

export function LivenessCamera({
  onCapture,
  onLivenessConfirmed,
  onError,
  countdownFrom = 3,
  livenessThreshold = 0.75,
  confirmFrames = 10,
  soundEnabled = true,
  fontFamily = DEFAULT_FONT,
  style,
}: LivenessCameraProps) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const format = useCameraFormat(device, [{ fps: 60 }]);
  const fps = Math.min(format?.maxFps ?? 30, 60);
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
        <Text style={[styles.permissionText, { fontFamily }]}>
          Camera permission required
        </Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.root, style, styles.centered]}>
        <Text style={[styles.permissionText, { fontFamily }]}>
          No front camera found
        </Text>
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
        format={format}
        fps={fps}
      />
      <CircleOverlay
        width={containerSize.width}
        height={containerSize.height}
        state={livenessState}
        score={livenessScore}
      />
      {livenessState !== 'done' && (
        <View style={styles.feedbackContainer}>
          <Text style={[styles.feedbackText, { fontFamily }]}>{feedback}</Text>
        </View>
      )}
      {livenessState === 'countdown' && countdown !== null && (
        <View style={styles.countdownContainer}>
          <CountdownBubble
            key={countdown}
            value={countdown}
            fontFamily={fontFamily}
          />
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
    lineHeight: 60,
  },
  captureFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    opacity: 0.4,
  },
});
