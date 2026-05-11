# @rick427/react-native-liveness

[![npm version](https://img.shields.io/npm/v/@rick427/react-native-liveness?style=flat-square&color=brightgreen)](https://www.npmjs.com/package/@rick427/react-native-liveness)
[![npm downloads](https://img.shields.io/npm/dm/@rick427/react-native-liveness?style=flat-square&color=blue)](https://www.npmjs.com/package/@rick427/react-native-liveness)
[![CI](https://img.shields.io/github/actions/workflow/status/rick427/react-native-liveness/ci.yml?style=flat-square&label=CI)](https://github.com/rick427/react-native-liveness/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow?style=flat-square)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android-lightgrey?style=flat-square)](https://github.com/rick427/react-native-liveness)

A React Native library for real-time **liveness detection** using the device's front camera. Powered by [Vision Camera v4](https://github.com/mrousavy/react-native-vision-camera) and **ML Kit Face Detection** — no server required, fully on-device.

The library scores each camera frame against a set of liveness signals (face size, head pose, eye openness), confirms liveness after a sustained high-score window, then automatically counts down **3 → 2 → 1**, plays a shutter sound, and captures the photo.

---

## Features

- Real-time passive liveness detection (no gestures required)
- On-device ML — works fully offline (ML Kit)
- Face guide oval with live feedback hints
- Animated countdown (React Native built-in `Animated`)
- Auto photo capture via Vision Camera's `takePhoto()`
- Optional shutter sound
- Fully typed TypeScript API

---

## Installation

```sh
npm install @rick427/react-native-liveness
# or
yarn add @rick427/react-native-liveness
```

### Peer dependencies

Install these if you don't already have them:

| Package | Version |
|---|---|
| `react-native-vision-camera` | `>= 4.0.0` |
| `react-native-svg` | `>= 13.0.0` |
| `react-native-worklets-core` | `>= 1.0.0` |

```sh
npm install react-native-vision-camera react-native-svg react-native-worklets-core
```

### Configure worklets Babel plugin

The library uses Vision Camera frame processors which run in a worklet context. Add the appropriate plugin to your `babel.config.js` depending on which package you have installed:

```js
// babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'], // or 'babel-preset-expo'
  plugins: [
    ['react-native-worklets-core/plugin'], // if using react-native-worklets-core
    // ['react-native-worklets/plugin'],   // if using react-native-worklets
  ],
};
```

> **Already have worklets configured?** Just confirm the relevant plugin line is present — no further changes needed.

After updating the Babel config, clear the Metro cache:

```sh
npx react-native start --reset-cache
# or with Expo
npx expo start --clear
```

### iOS

```sh
cd ios && pod install
```

Add `NSCameraUsageDescription` to your `Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>Camera access is required for liveness verification.</string>
```

### Android

The ML Kit dependency is included in `build.gradle` automatically. No extra steps needed.

---

## Usage

### Drop-in component

```tsx
import { LivenessCamera } from '@rick427/react-native-liveness';
import type { CaptureResult } from '@rick427/react-native-liveness';

export default function VerificationScreen() {
  const handleCapture = (result: CaptureResult) => {
    console.log('Photo path:', result.photo.path);
    console.log('Liveness score:', result.livenessScore); // 0.0 – 1.0
  };

  return (
    <LivenessCamera
      style={{ flex: 1 }}
      onCapture={handleCapture}
      onLivenessConfirmed={() => console.log('Live face confirmed!')}
      onError={(err) => console.error(err)}
    />
  );
}
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `onCapture` | `(result: CaptureResult) => void` | **required** | Fired after photo is taken. |
| `onLivenessConfirmed` | `() => void` | — | Fired the moment liveness is confirmed, before the countdown. |
| `onError` | `(err: Error) => void` | — | Fired on unrecoverable errors. |
| `countdownFrom` | `number` | `3` | Countdown start value. |
| `livenessThreshold` | `number` | `0.75` | Score (0–1) required per frame to be considered live. |
| `confirmFrames` | `number` | `15` | Consecutive high-score frames required (~500 ms at 30 fps). |
| `soundEnabled` | `boolean` | `true` | Play the native system shutter sound on capture. Respects silent mode. |
| `style` | `ViewStyle` | — | Style for the root container. |

### CaptureResult

```ts
type CaptureResult = {
  photo: PhotoFile;      // Vision Camera PhotoFile
  livenessScore: number; // rolling average score at time of capture (0–1)
  timestamp: number;     // Date.now() at capture
};
```

---

## How liveness scoring works

Each camera frame is scored across four signals:

| Signal | Weight | Detail |
|---|---|---|
| Face detected | 20% | ML Kit found a face in the frame |
| Face size | 20% | Face width is 20%–65% of the frame (not too far, not too close) |
| Head pose | 30% | Yaw < ±20° and pitch < ±20° from frontal |
| Eyes open | 30% | Average of left/right eye open probability from ML Kit |

A rolling window of the last 20 frame scores is maintained. Liveness is confirmed once `confirmFrames` consecutive frames all score above `livenessThreshold`.

---

## Architecture

```
Camera frame (30fps)
  ↓  [worklet thread — Vision Camera frame processor]
Native plugin (Swift / Kotlin)
  → ML Kit Face Detection
  → { bounds, yawAngle, pitchAngle, leftEyeOpenProbability, … }
  ↓  [runOnJS → JS thread]
useLivenessCamera hook
  → scoreFrame() per frame
  → rolling 20-frame window
  → 15 consecutive frames > threshold → liveness confirmed
  ↓
Countdown 3 → 2 → 1  (React Native Animated)
  ↓
camera.takePhoto() → onCapture({ photo, livenessScore, timestamp })
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and pull request guidelines.

---

## License

MIT © [Richard](https://github.com/rick427)
