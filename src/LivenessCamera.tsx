import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated as RNAnimated, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
} from 'react-native-vision-camera';
import {
  Circle,
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Svg,
} from 'react-native-svg';
import { useLivenessCamera } from './useLivenessCamera';
import type { LivenessCameraProps, LivenessState } from './types';

// ─── Animated SVG components (Reanimated) ────────────────────────────────────
// createAnimatedComponent from react-native-reanimated properly drives SVG
// presentation attributes (strokeDashoffset, y, rotation) on the UI thread.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_FONT = 'Baloo-Medium';
const CIRCLE_DIAMETER_RATIO = 0.82;
const STROKE_WIDTH = 3;
const K = 0.5523; // cubic bezier ellipse approximation
const SCAN_LINE_HEIGHT = 2; // px — thin line, like a real liveness SDK
const BRACKET_SPAN_DEG = 44; // degrees each corner bracket spans
const BRACKET_STROKE = STROKE_WIDTH + 1;

// ─── Colour helper ────────────────────────────────────────────────────────────
/**
 *  ● White  – no face yet (arc at 0)
 *  ● Yellow – challenge in progress (arc filling)
 *  ● Green  – all challenges passed (confirmed / countdown / capture)
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
      return score > 0.02 ? '#FFD60A' : '#FFFFFF';
  }
}

// ─── SVG path helpers ─────────────────────────────────────────────────────────
/** Cubic bezier circle path — used inside compound evenodd scrim. */
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

/** One corner bracket arc centred at `centerDeg`, spanning `spanDeg`. */
function bracketArcPath(
  cx: number,
  cy: number,
  r: number,
  centerDeg: number,
  spanDeg: number
): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a1 = toRad(centerDeg - spanDeg / 2);
  const a2 = toRad(centerDeg + spanDeg / 2);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2);
  const y2 = cy + r * Math.sin(a2);
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
}

// ─── CircleOverlay ────────────────────────────────────────────────────────────
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
  // ── Shared values — all hooks before any early return ─────────────────────
  // scanProgress 0=top 1=bottom, ping-pongs continuously
  const scanProgress = useSharedValue(0);
  const scanOpacity = useSharedValue(1);
  // bracketRot drives the slow bracket rotation in degrees
  const bracketRot = useSharedValue(0);
  // livenessProgress tracks smoothed score for the arc
  const livenessProgress = useSharedValue(0);

  // ── Geometry — computed before useAnimatedProps (safe when 0) ─────────────
  const cx = width / 2;
  const cy = height * 0.42;
  const r = (width * CIRCLE_DIAMETER_RATIO) / 2;
  const circumference = 2 * Math.PI * r;
  const color = getCircleColor(state, score);

  // ── Animated props — UI-thread worklets, deps rebuilt when geometry changes
  const scanAnimProps = useAnimatedProps(
    () => ({
      // Map 0→1 progress onto the pixel range inside the circle
      y: cy - r + 2 + scanProgress.value * (2 * r - SCAN_LINE_HEIGHT - 4),
      opacity: scanOpacity.value,
    }),
    [cy, r]
  );

  const bracketAnimProps = useAnimatedProps(
    () => ({
      // react-native-svg accepts numeric rotation + origin instead of a string
      rotation: bracketRot.value % 360,
      originX: cx,
      originY: cy,
    }),
    [cx, cy]
  );

  // score is already 0–1 challenge progress — arc fills directly
  const progressAnimProps = useAnimatedProps(
    () => ({
      strokeDashoffset: circumference * (1 - livenessProgress.value),
    }),
    [circumference]
  );

  // ── Start scan line + bracket rotation on mount ───────────────────────────
  useEffect(() => {
    scanProgress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2400, easing: Easing.linear }),
        withTiming(0, { duration: 2400, easing: Easing.linear })
      ),
      -1,
      false
    );
    bracketRot.value = withRepeat(
      withTiming(360, { duration: 6000, easing: Easing.linear }),
      -1,
      false
    );
    return () => {
      cancelAnimation(scanProgress);
      cancelAnimation(bracketRot);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── On liveness confirmed: freeze brackets, fade scan line out ────────────
  useEffect(() => {
    if (state !== 'scanning') {
      cancelAnimation(scanProgress);
      cancelAnimation(bracketRot);
      scanOpacity.value = withTiming(0, { duration: 350 });
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drive progress arc from challenge progress (0–1) ─────────────────────
  useEffect(() => {
    livenessProgress.value = withTiming(score, { duration: 220 });
  }, [score]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Guard — render nothing until dimensions are known ─────────────────────
  if (width === 0 || height === 0) return null;

  // Scrim: full-screen rect with transparent circle cutout (evenodd rule)
  const scrimD = `M0 0H${width}V${height}H0Z ${circlePath(cx, cy, r)}`;

  // 4 corner brackets at NE / SE / SW / NW diagonal positions
  const bracketD = [45, 135, 225, 315]
    .map((deg) => bracketArcPath(cx, cy, r, deg, BRACKET_SPAN_DEG))
    .join(' ');

  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
      {/* ── Definitions ─────────────────────────────────────────────────── */}
      <Defs>
        {/* Clip path: restrict scan line to circle area */}
        <ClipPath id="liveness-circle-clip">
          <Circle cx={cx} cy={cy} r={r} />
        </ClipPath>

        {/* Horizontal gradient — line fades in from left, out to right */}
        <LinearGradient id="scan-gradient" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#fff" stopOpacity="0" />
          <Stop offset="0.08" stopColor="#fff" stopOpacity="0.55" />
          <Stop offset="0.92" stopColor="#fff" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#fff" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {/* ── Dark scrim with transparent circle cutout ────────────────────── */}
      <Path d={scrimD} fill="rgba(0,0,0,0.55)" fillRule="evenodd" />

      {/* ── Dim base ring — always shows the circle boundary ─────────────── */}
      <Circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1}
      />

      {/* ── Scan line — sweeps top → bottom, clipped to circle ───────────── */}
      <G clipPath="url(#liveness-circle-clip)">
        <AnimatedRect
          x={cx - r}
          width={r * 2}
          height={SCAN_LINE_HEIGHT}
          fill="url(#scan-gradient)"
          animatedProps={scanAnimProps}
        />
      </G>

      {/* ── Rotating corner brackets ─────────────────────────────────────── */}
      <AnimatedG animatedProps={bracketAnimProps}>
        <Path
          d={bracketD}
          fill="none"
          stroke={color}
          strokeWidth={BRACKET_STROKE}
          strokeLinecap="round"
          opacity={0.85}
        />
      </AnimatedG>

      {/* ── Progress arc — draws in as liveness confidence builds ────────── */}
      {/* transform rotates -90° so arc starts at 12 o'clock, goes clockwise */}
      <AnimatedCircle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeDasharray={circumference}
        strokeLinecap="round"
        transform={`rotate(-90, ${cx}, ${cy})`}
        animatedProps={progressAnimProps}
      />
    </Svg>
  );
}

// ─── CountdownBubble ──────────────────────────────────────────────────────────
function CountdownBubble({
  value,
  fontFamily,
}: {
  value: number;
  fontFamily: string;
}) {
  const scale = useRef(new RNAnimated.Value(0)).current;
  const opacity = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.sequence([
        RNAnimated.spring(scale, {
          toValue: 1.2,
          stiffness: 200,
          damping: 6,
          useNativeDriver: true,
        }),
        RNAnimated.spring(scale, {
          toValue: 1.0,
          stiffness: 150,
          damping: 8,
          useNativeDriver: true,
        }),
      ]),
      RNAnimated.timing(opacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      RNAnimated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <RNAnimated.View
      style={[styles.countdownBubble, { opacity, transform: [{ scale }] }]}
    >
      <Text style={[styles.countdownText, { fontFamily }]}>{value}</Text>
    </RNAnimated.View>
  );
}

// ─── LivenessCamera ───────────────────────────────────────────────────────────
export function LivenessCamera({
  onCapture,
  onLivenessConfirmed,
  onError,
  countdownFrom = 3,
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

// ─── Styles ───────────────────────────────────────────────────────────────────
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
