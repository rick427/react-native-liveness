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
- Circle guide with animated scanner — sweeping scan line, rotating corner brackets, confidence progress arc
- Score-driven border colour: white → yellow → green
- Built-in modal via `LivenessCameraModal` — one import, zero wiring
- Configurable animation type, close button style, and font
- Auto photo capture via Vision Camera's `takePhoto()`
- 60 fps preview, ML Kit capped at 20 fps via `runAtTargetFps`
- Optional shutter sound (respects silent mode)
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

The library uses Vision Camera frame processors which run in a worklet context. Add the appropriate plugin to your `babel.config.js`:

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

After updating Babel config, clear the Metro cache:

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

ML Kit and all native dependencies are included automatically via `build.gradle`. No extra steps needed.

---

## Usage

There are two ways to use the library depending on how much control you need.

---

### Option 1 — `LivenessCameraModal` (recommended)

The easiest integration. Pass `visible` / `onClose` and you're done — the modal, close button, and full-screen layout are all handled for you.

```tsx
import { useState } from 'react';
import { LivenessCameraModal } from '@rick427/react-native-liveness';
import type { CaptureResult } from '@rick427/react-native-liveness';

export default function VerificationScreen() {
  const [showLiveness, setShowLiveness] = useState(false);

  const handleCapture = (result: CaptureResult) => {
    console.log('Photo path:', result.photo.path);
    console.log('Liveness score:', result.livenessScore); // 0.0 – 1.0
    setShowLiveness(false);
  };

  return (
    <>
      {/* Trigger however you like */}
      <Button title="Verify Identity" onPress={() => setShowLiveness(true)} />

      <LivenessCameraModal
        visible={showLiveness}
        onClose={() => setShowLiveness(false)}
        onCapture={handleCapture}
        onLivenessConfirmed={() => console.log('Live face confirmed!')}
        onError={(err) => console.error(err)}
      />
    </>
  );
}
```

#### `LivenessCameraModal` props

| Prop | Type | Default | Description |
|---|---|---|---|
| `visible` | `boolean` | **required** | Controls modal visibility. |
| `onClose` | `() => void` | **required** | Called when the × button is pressed or Android back is fired. |
| `onCapture` | `(result: CaptureResult) => void` | **required** | Fired after photo is captured. |
| `animationType` | `'slide' \| 'fade' \| 'none'` | `'slide'` | Modal entrance/exit animation. |
| `closeButtonStyle` | `ViewStyle` | — | Override the close button container style (position, size, colours). |
| `closeButtonIconColor` | `string` | `'#fff'` | Colour of the × icon. |
| `closeButtonIconSize` | `number` | `18` | Size of the × icon in dp. |
| `onLivenessConfirmed` | `() => void` | — | Fired the moment liveness is confirmed, before countdown. |
| `onError` | `(err: Error) => void` | — | Fired on unrecoverable errors. |
| `countdownFrom` | `number` | `3` | Countdown start value. |
| `livenessThreshold` | `number` | `0.75` | Score (0–1) required to confirm liveness. |
| `confirmFrames` | `number` | `10` | Consecutive high-score frames required (~500 ms at 20 fps). |
| `soundEnabled` | `boolean` | `true` | Play native shutter sound on capture. |
| `fontFamily` | `string` | `'Baloo-Medium'` | Font applied to all text inside the component. |

---

### Option 2 — `LivenessCamera` (embedded)

Use this when you want full layout control — embed the camera directly inside your own screen or custom modal.

```tsx
import { LivenessCamera } from '@rick427/react-native-liveness';
import type { CaptureResult } from '@rick427/react-native-liveness';

export default function VerificationScreen() {
  const handleCapture = (result: CaptureResult) => {
    console.log('Photo path:', result.photo.path);
    console.log('Liveness score:', result.livenessScore);
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

#### `LivenessCamera` props

| Prop | Type | Default | Description |
|---|---|---|---|
| `onCapture` | `(result: CaptureResult) => void` | **required** | Fired after photo is captured. |
| `onLivenessConfirmed` | `() => void` | — | Fired the moment liveness is confirmed, before countdown. |
| `onError` | `(err: Error) => void` | — | Fired on unrecoverable errors. |
| `countdownFrom` | `number` | `3` | Countdown start value. |
| `livenessThreshold` | `number` | `0.75` | Score (0–1) required to confirm liveness. |
| `confirmFrames` | `number` | `10` | Consecutive high-score frames required (~500 ms at 20 fps). |
| `soundEnabled` | `boolean` | `true` | Play native shutter sound on capture. |
| `fontFamily` | `string` | `'Baloo-Medium'` | Font applied to all text inside the component. |
| `style` | `ViewStyle` | — | Style for the root container. |

---

### `CaptureResult`

```ts
type CaptureResult = {
  photo: PhotoFile;      // Vision Camera PhotoFile
  livenessScore: number; // rolling average score at time of capture (0–1)
  timestamp: number;     // Date.now() at capture
};
```

---

## Scanner animation

The circle guide layers three animations built entirely with `Animated` + `react-native-svg` — no extra dependencies.

| Layer | Behaviour |
|---|---|
| **Dim base ring** | Always visible; gives a positioning target before any progress starts. |
| **Sweep scan line** | A gradient bar ping-pongs top → bottom inside the circle (1.8 s/leg). Fades out on confirm. |
| **Rotating brackets** | Four corner arcs rotate slowly (1 rev / 6 s), suggesting the circle boundary during scanning. Freeze in place on confirm. |
| **Progress arc** | The circle border draws itself in clockwise from 12 o'clock as `livenessScore / livenessThreshold` builds. White → yellow → green. |

---

## How liveness scoring works

Each camera frame is scored across four signals at up to **20 fps** (ML Kit is throttled via `runAtTargetFps` while the preview renders at 60 fps):

| Signal | Weight | Detail |
|---|---|---|
| Face detected | 20% | ML Kit found a face in the frame. |
| Face size | 20% | Face width is 15–80% of the frame. Soft-edge scoring at boundaries. |
| Head pose | 30% | Yaw < ±25° and pitch < ±25° from frontal. Soft decay outside range. |
| Eyes open | 30% | Average of left/right eye open probability from ML Kit. |

A rolling window of the last 20 frame scores is maintained. Liveness is confirmed once `confirmFrames` consecutive frames all score above `livenessThreshold`. Bad frames **decay** the streak by 2 instead of resetting it, making detection resilient to momentary noise.

---

## Architecture

```
Camera (60 fps preview)
  ↓  [worklet thread — Vision Camera frame processor]
  runAtTargetFps(20) → Native plugin (Swift / Kotlin)
    → ML Kit Face Detection
    → { bounds, yawAngle, pitchAngle, leftEyeOpenProbability, … }
  ↓  [Worklets.createRunOnJS → JS thread, ~20×/sec]
useLivenessCamera hook
  → scoreFrame() — soft-edge signals, weighted sum
  → rolling 20-frame window
  → consecutiveGood++ on pass, decay -2 on fail
  → 10 consecutive frames > threshold → liveness confirmed
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
