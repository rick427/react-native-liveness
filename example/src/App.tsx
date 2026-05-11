import React, { useState } from 'react';
import {
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LivenessCamera } from 'react-native-liveness';
import type { CaptureResult } from 'react-native-liveness';

export default function App() {
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [active, setActive] = useState(false);

  const handleCapture = (captureResult: CaptureResult) => {
    setResult(captureResult);
    setActive(false);
  };

  const handleError = (err: Error) => {
    console.error('[LivenessCamera] error:', err.message);
    setActive(false);
  };

  if (active) {
    return (
      <View style={styles.fullScreen}>
        <LivenessCamera
          style={styles.fullScreen}
          onCapture={handleCapture}
          onLivenessConfirmed={() => console.log('Liveness confirmed!')}
          onError={handleError}
          countdownFrom={3}
          livenessThreshold={0.75}
          confirmFrames={15}
          soundEnabled
        />
        <SafeAreaView style={styles.cancelRow} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setActive(false)}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Liveness Check</Text>
      <Text style={styles.subtitle}>
        Face the front camera. The library will detect liveness, count down, and
        auto-capture.
      </Text>

      {result ? (
        <View style={styles.resultCard}>
          <Image
            source={{ uri: `file://${result.photo.path}` }}
            style={styles.previewImage}
            resizeMode="cover"
          />
          <Text style={styles.scoreLabel}>
            Liveness score:{' '}
            <Text style={styles.scoreValue}>
              {(result.livenessScore * 100).toFixed(1)}%
            </Text>
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setResult(null)}
          >
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => setActive(true)}
        >
          <Text style={styles.primaryButtonText}>Start Liveness Check</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
    maxWidth: 300,
  },
  primaryButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  resultCard: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  previewImage: {
    width: 240,
    height: 320,
    borderRadius: 16,
    marginBottom: 8,
  },
  scoreLabel: {
    color: '#ccc',
    fontSize: 16,
    marginBottom: 8,
  },
  scoreValue: {
    color: '#4CAF50',
    fontWeight: '700',
  },
  cancelRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'flex-start',
    padding: 16,
  },
  cancelButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  cancelText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
});
