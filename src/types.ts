/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CsiPacket {
  packetId: number;
  timestamp: number; // in milliseconds
  rssi: number; // in dBm
  amplitudes: number[]; // amplitude per subcarrier (length depends on channel bandwidth, e.g., 64 or 128)
  phases: number[]; // phase per subcarrier in radians
  noise: number; // noise floor in dBm
  antennaId: number; // antenna index (e.g., 0 or 1 for 2x2 MIMO)
  frequencyBand: 2.4 | 5; // GHz
}

export interface DspConfig {
  movingAverageEnabled: boolean;
  movingAverageWindow: number;
  kalmanFilterEnabled: boolean;
  kalmanQ: number; // Process noise covariance
  kalmanR: number; // Measurement noise covariance
  butterworthEnabled: boolean;
  butterworthCutoff: number; // Cutoff frequency relative to Nyquist (0.01 - 0.99)
  pcaEnabled: boolean;
  selectedSubcarrierIndex: number;
  subcarrierSelectionMode: 'average' | 'single' | 'pca';
}

export interface RoomWall {
  id: string;
  x1: number; // in meters
  y1: number;
  x2: number;
  y2: number;
}

export interface RoomConfig {
  width: number; // meters
  height: number; // meters
  routerX: number; // meters
  routerY: number;
  receiverX: number; // meters
  receiverY: number;
  walls: RoomWall[];
}

export interface TrackingState {
  x: number; // meters
  y: number;
  isMoving: boolean;
  dopplerShift: number; // Hz
  activity: 'stationary' | 'walking' | 'standing' | 'sitting' | 'running' | 'multiple_movements' | 'unknown';
  confidence: number; // 0 to 1
  pathHistory: Array<{ x: number; y: number; timestamp: number }>;
}

export interface DiagnosticLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: 'driver' | 'dsp' | 'ai' | 'websocket' | 'system';
}

export interface RecordedSession {
  id: string;
  name: string;
  description: string;
  recordedAt: string;
  packetCount: number;
  durationMs: number;
  packets: CsiPacket[];
}
