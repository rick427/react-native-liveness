# react-native-liveness

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

## Prerequisites

Install and link these peer dependencies in your project before using `react-native-liveness`:

| Package | Version | Notes |
|---|---|---|
| `react-native-vision-camera` | `>= 4.0.0` | Required |
| `react-native-worklets-core` | `>= 1.0.0` | Required (also needed by Vision Camera) |
| `react-native-svg` | `>= 13.0.0` | Required |
| `react-native-sound` | `>= 0.11.0` | Optional — for shutter sound |

```sh
npm install react-native-vision-camera react-native-worklets-core react-native-svg
# or
yarn add react-native-vision-camera react-native-worklets-core react-native-svg
```

---

## Installation

```sh
npm install react-native-liveness
# or
yarn add react-native-liveness
```

Then install the peer dependencies if you haven't already:

```sh
npm install react-native-vision-camera react-native-worklets-core react-native-svg
```

### iOS

Add the ML Kit pod (already declared in the podspec, but run pod install):

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

### Shutter sound (optional)

If you have `react-native-sound` installed and want the camera-click sound on capture:

- **iOS** — drag `shutter.mp3` into your Xcode project (make sure *Copy items if needed* and the correct target are checked).
- **Android** — place `shutter.mp3` at `android/app/src/main/res/raw/shutter.mp3`.

If the file is missing, sound is silently skipped — nothing breaks.

---

## Usage

### Drop-in component

```tsx
import { LivenessCamera } from 'react-native-liveness';
import type { CaptureResult } from 'react-native-liveness';

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
| `soundEnabled` | `boolean` | `true` | Play shutter sound on capture (requires `react-native-sound`). |
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
