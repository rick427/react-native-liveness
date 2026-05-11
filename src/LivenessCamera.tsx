import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
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

// ─── Animated SVG components ─────────────────────────────────────────────────
// Created once at module level so React never recreates the component class.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_FONT = 'Baloo-Medium';
const CIRCLE_DIAMETER_RATIO = 0.82;
const STROKE_WIDTH = 3;
const K = 0.5523; // cubic bezier ellipse approximation
const SCAN_LINE_HEIGHT = 44; // px — height of the sweep bar
const BRACKET_SPAN_DEG = 44; // degrees each corner bracket spans
const BRACKET_STROKE = STROKE_WIDTH + 1;

// ─── Colour helper ────────────────────────────────────────────────────────────
/**
 *  ● White  – no face / scanning (score < 0.4)
 *  ● Yellow – face detected, confidence building
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
  livenessThreshold,
}: {
  width: number;
  height: number;
  state: LivenessState;
  score: number;
  livenessThreshold: number;
}) {
  // ── Animation values (must be declared before any early return) ────────────
  const scanAnim = useRef(new Animated.Value(0)).current;
  const scanOpacity = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const bracketAnim = useRef(new Animated.Value(0)).current;

  const scanLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const bracketLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // ── Start scan line + bracket rotation on mount ───────────────────────────
  useEffect(() => {
    // Scan line: ping-pong top → bottom → top, 1.8 s each leg
    scanLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 1800,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
      ])
    );
    scanLoopRef.current.start();

    // Brackets: one full rotation every 6 s — slow, atmospheric
    bracketLoopRef.current = Animated.loop(
      Animated.timing(bracketAnim, {
        toValue: 360,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    bracketLoopRef.current.start();

    return () => {
      scanLoopRef.current?.stop();
      bracketLoopRef.current?.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── On confirmed: stop scan + brackets, fade out scan line ────────────────
  useEffect(() => {
    const isActive = state === 'scanning';
    if (!isActive) {
      scanLoopRef.current?.stop();
      bracketLoopRef.current?.stop();
      Animated.timing(scanOpacity, {
        toValue: 0,
        duration: 350,
        useNativeDriver: false,
      }).start();
    }
  }, [state, scanOpacity]);

  // ── Drive progress arc from live score ────────────────────────────────────
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: Math.min(score, livenessThreshold),
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [score, livenessThreshold, progressAnim]);

  // ── Guard — render nothing until dimensions are known ─────────────────────
  if (width === 0 || height === 0) return null;

  // ── Geometry ──────────────────────────────────────────────────────────────
  const cx = width / 2;
  const cy = height * 0.42;
  const r = (width * CIRCLE_DIAMETER_RATIO) / 2;
  const circumference = 2 * Math.PI * r;
  const color = getCircleColor(state, score);

  // Scrim: full-screen dark rect with transparent circle hole
  const scrimD = `M0 0H${width}V${height}H0Z ${circlePath(cx, cy, r)}`;

  // Scan line Y: sweeps from just inside top to just inside bottom of circle
  const scanLineY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [cy - r + 2, cy + r - SCAN_LINE_HEIGHT - 2],
  });

  // Progress arc: strokeDashoffset goes from full (no arc) → 0 (full arc)
  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, livenessThreshold],
    outputRange: [circumference, 0],
    extrapolate: 'clamp',
  });

  // Bracket group rotation — centred on the circle
  const bracketTransform = bracketAnim.interpolate({
    inputRange: [0, 360],
    outputRange: [`rotate(0, ${cx}, ${cy})`, `rotate(360, ${cx}, ${cy})`],
  });

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

        {/* Vertical gradient for the scan bar — fades at top and bottom */}
        <LinearGradient id="scan-gradient" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#fff" stopOpacity="0" />
          <Stop offset="0.25" stopColor="#fff" stopOpacity="0.65" />
          <Stop offset="0.75" stopColor="#fff" stopOpacity="0.65" />
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
          y={scanLineY}
          width={r * 2}
          height={SCAN_LINE_HEIGHT}
          fill="url(#scan-gradient)"
          opacity={scanOpacity}
        />
      </G>

      {/* ── Rotating corner brackets ─────────────────────────────────────── */}
      <AnimatedG transform={bracketTransform}>
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
      {/* Rotated -90° so it starts at 12 o'clock and goes clockwise */}
      <AnimatedCircle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        transform={`rotate(-90, ${cx}, ${cy})`}
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

// ─── LivenessCamera ───────────────────────────────────────────────────────────
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
        livenessThreshold={livenessThreshold}
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
