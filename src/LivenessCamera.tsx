import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import {
  Canvas,
  Circle,
  FillType,
  Group,
  Paint,
  Path,
  Skia,
} from '@shopify/react-native-skia';
import { useLivenessCamera } from './useLivenessCamera';
import type { LivenessCameraProps, LivenessState } from './types';

const OVAL_H_RATIO = 0.55;
const OVAL_V_RATIO = 0.72;
const STROKE_WIDTH = 3;

function getOvalColor(state: LivenessState): string {
  switch (state) {
    case 'confirmed':
    case 'countdown':
    case 'capturing':
    case 'done':
      return '#4CAF50';
    default:
      return '#FFFFFF';
  }
}

function OvalOverlay({
  width,
  height,
  state,
}: {
  width: number;
  height: number;
  state: LivenessState;
}) {
  if (width === 0 || height === 0) return null;

  const cx = width / 2;
  const cy = height / 2;
  const rx = (width * OVAL_H_RATIO) / 2;
  const ry = (height * OVAL_V_RATIO) / 2;
  const color = getOvalColor(state);

  const path = Skia.Path.Make();
  path.addRect(Skia.XYWHRect(0, 0, width, height));
  path.addOval(Skia.XYWHRect(cx - rx, cy - ry, rx * 2, ry * 2));
  path.setFillType(FillType.EvenOdd);

  const ovalPath = Skia.Path.Make();
  ovalPath.addOval(Skia.XYWHRect(cx - rx, cy - ry, rx * 2, ry * 2));

  const showDot =
    state === 'confirmed' || state === 'countdown' || state === 'capturing';

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Path path={path} color="rgba(0,0,0,0.55)" />
      <Group>
        <Path
          path={ovalPath}
          style="stroke"
          strokeWidth={STROKE_WIDTH}
          color={color}
        />
        {showDot && (
          <Circle cx={cx} cy={cy - ry - 8} r={5} color={color}>
            <Paint color={color} />
          </Circle>
        )}
      </Group>
    </Canvas>
  );
}

function CountdownBubble({ value }: { value: number }) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSequence(
      withSpring(1.2, { damping: 6, stiffness: 200 }),
      withSpring(1.0, { damping: 8, stiffness: 150 })
    );
    opacity.value = withTiming(1, { duration: 150 });

    return () => {
      opacity.value = withTiming(0, { duration: 200 });
    };
  }, [value, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.countdownBubble, animatedStyle]}>
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
  const [containerSize, setContainerSize] = React.useState({
    width: 0,
    height: 0,
  });

  const { frameProcessor, livenessState, countdown, feedback } =
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
    bottom: '14%',
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
