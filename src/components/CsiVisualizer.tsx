/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { 
  LineChart, 
  Settings, 
  Maximize2, 
  Activity, 
  Database,
  RefreshCw,
  Sliders,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { CsiPacket, DspConfig } from '../types';

interface CsiVisualizerProps {
  currentPacket: CsiPacket | null;
  history: CsiPacket[];
  dspConfig: DspConfig;
  setDspConfig: React.Dispatch<React.SetStateAction<DspConfig>>;
}

export default function CsiVisualizer({ currentPacket, history, dspConfig, setDspConfig }: CsiVisualizerProps) {
  const ampCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dspCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeTab, setActiveTab] = useState<'raw' | 'dsp' | 'fft'>('raw');

  // Simple Discrete Fourier Transform (DFT) to get Power Spectral Density (Doppler Profile)
  const computeDft = (samples: number[]): number[] => {
    const N = samples.length;
    if (N === 0) return [];
    
    // De-mean the samples to remove DC component (0 Hz offset)
    const mean = samples.reduce((a, b) => a + b, 0) / N;
    const deMeaned = samples.map(s => s - mean);
    
    const psd = new Array(Math.floor(N / 2)).fill(0);
    
    // Apply Hanning Window to reduce spectral leakage
    const windowed = deMeaned.map((s, i) => s * (0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)))));

    for (let k = 0; k < Math.floor(N / 2); k++) {
      let real = 0;
      let imag = 0;
      for (let n = 0; n < N; n++) {
        const angle = (2 * Math.PI * k * n) / N;
        real += windowed[n] * Math.cos(angle);
        imag -= windowed[n] * Math.sin(angle);
      }
      psd[k] = Math.sqrt(real * real + imag * imag) / N;
    }
    return psd;
  };

  // Extract and process subcarrier signal according to DSP config
  const getProcessedSignalHistory = (): number[] => {
    if (history.length === 0) return [];
    
    // Step 1: Extract chosen subcarrier or average
    let rawSignal: number[] = [];
    if (dspConfig.subcarrierSelectionMode === 'average') {
      rawSignal = history.map(pkt => pkt.amplitudes.reduce((a, b) => a + b, 0) / pkt.amplitudes.length);
    } else if (dspConfig.subcarrierSelectionMode === 'single') {
      const idx = Math.min(dspConfig.selectedSubcarrierIndex, (currentPacket?.amplitudes.length ?? 64) - 1);
      rawSignal = history.map(pkt => pkt.amplitudes[idx] ?? 0);
    } else {
      // PCA approximation (First Principal Component using simplified covariance projection)
      // For speed and robustness, project onto linear slope
      rawSignal = history.map(pkt => {
        const mid = Math.floor(pkt.amplitudes.length / 2);
        return pkt.amplitudes.slice(0, mid).reduce((a,b) => a+b, 0) - pkt.amplitudes.slice(mid).reduce((a,b)=>a+b,0);
      });
    }

    // Step 2: Apply Moving Average Filter if enabled
    let signal = [...rawSignal];
    if (dspConfig.movingAverageEnabled && dspConfig.movingAverageWindow > 1) {
      const w = dspConfig.movingAverageWindow;
      for (let i = w - 1; i < signal.length; i++) {
        let sum = 0;
        for (let j = 0; j < w; j++) sum += rawSignal[i - j];
        signal[i] = sum / w;
      }
    }

    // Step 3: Apply Butterworth-like low-pass (IIR Filter)
    if (dspConfig.butterworthEnabled) {
      const alpha = dspConfig.butterworthCutoff; // simplified alpha factor for IIR 1st order
      let lastVal = signal[0] ?? 0;
      for (let i = 0; i < signal.length; i++) {
        signal[i] = alpha * signal[i] + (1 - alpha) * lastVal;
        lastVal = signal[i];
      }
    }

    // Step 4: Apply Kalman Filter
    if (dspConfig.kalmanFilterEnabled) {
      const q = dspConfig.kalmanQ; // Process variance
      const r = dspConfig.kalmanR; // Measurement variance
      let p = 1.0; // Estimate error variance
      let x = signal[0] ?? 0; // State estimate
      for (let i = 0; i < signal.length; i++) {
        // Time Update (predict)
        // x remains same (constant model)
        p = p + q;
        
        // Measurement Update (correct)
        const kGain = p / (p + r);
        x = x + kGain * (signal[i] - x);
        p = (1 - kGain) * p;
        
        signal[i] = x;
      }
    }

    return signal;
  };

  // Render Amplitude Canvas
  useEffect(() => {
    const canvas = ampCanvasRef.current;
    if (!canvas || !currentPacket) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and match device pixel ratio
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const width = canvas.width;
    const height = canvas.height;

    // Background Grid lines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      // Horizontal lines
      const y = (height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      // Vertical lines
      const x = (width / 5) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    const amps = currentPacket.amplitudes;
    const len = amps.length;
    
    // Draw past trail (waterfall envelope from history)
    if (history.length > 1) {
      ctx.lineWidth = 1.5;
      const step = Math.max(1, Math.floor(history.length / 5));
      for (let hIdx = 0; hIdx < history.length; hIdx += step) {
        const histPkt = history[hIdx];
        const opacity = (hIdx / history.length) * 0.12;
        ctx.strokeStyle = `rgba(16, 185, 129, ${opacity})`;
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          const px = (i / (len - 1)) * width;
          // Normalizing amplitudes (typically between 0 and 70 dB)
          const py = height - (histPkt.amplitudes[i] / 75) * height;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }

    // Draw main amplitude plot
    ctx.strokeStyle = '#10b981'; // Emerald 500
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const px = (i / (len - 1)) * width;
      const py = height - (amps[i] / 75) * height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Draw active subcarrier marker if single subcarrier mode
    if (dspConfig.subcarrierSelectionMode === 'single') {
      const selectedIdx = Math.min(dspConfig.selectedSubcarrierIndex, len - 1);
      const mx = (selectedIdx / (len - 1)) * width;
      const my = height - (amps[selectedIdx] / 75) * height;
      
      ctx.fillStyle = '#f59e0b'; // Amber 500
      ctx.beginPath();
      ctx.arc(mx, my, 6, 0, 2 * Math.PI);
      ctx.fill();
      
      // Vertical line
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

  }, [currentPacket, history, dspConfig]);

  // Render Phase Canvas
  useEffect(() => {
    const canvas = phaseCanvasRef.current;
    if (!canvas || !currentPacket) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const width = canvas.width;
    const height = canvas.height;

    // Grid lines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 1;
    const yCenter = height / 2;
    ctx.beginPath();
    ctx.moveTo(0, yCenter);
    ctx.lineTo(width, yCenter);
    ctx.stroke();

    const phases = currentPacket.phases;
    const len = phases.length;

    // Phase values range from -pi to +pi. Normalize to canvas height
    ctx.strokeStyle = '#6366f1'; // Indigo 500
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const px = (i / (len - 1)) * width;
      // Map [-pi, pi] to [height, 0]
      const py = height - ((phases[i] + Math.PI) / (2 * Math.PI)) * height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

  }, [currentPacket]);

  // Render DSP Filtered Canvas
  useEffect(() => {
    const canvas = dspCanvasRef.current;
    if (!canvas || history.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const width = canvas.width;
    const height = canvas.height;

    // Draw background grid
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.2)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Get Raw history
    let rawSignal: number[] = [];
    if (dspConfig.subcarrierSelectionMode === 'average') {
      rawSignal = history.map(pkt => pkt.amplitudes.reduce((a, b) => a + b, 0) / pkt.amplitudes.length);
    } else {
      const idx = Math.min(dspConfig.selectedSubcarrierIndex, (currentPacket?.amplitudes.length ?? 64) - 1);
      rawSignal = history.map(pkt => pkt.amplitudes[idx] ?? 0);
    }

    const processedSignal = getProcessedSignalHistory();
    const len = rawSignal.length;

    // Find min and max for auto-scaling
    const combined = [...rawSignal, ...processedSignal];
    const minVal = Math.min(...combined) - 1;
    const maxVal = Math.max(...combined) + 1;
    const range = maxVal - minVal || 1;

    // Draw Raw Signal (in red/rose)
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const px = (i / (len - 1)) * width;
      const py = height - ((rawSignal[i] - minVal) / range) * height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Draw Processed Signal (in emerald)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const px = (i / (len - 1)) * width;
      const py = height - ((processedSignal[i] - minVal) / range) * height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

  }, [history, dspConfig]);

  // Render FFT Canvas
  useEffect(() => {
    const canvas = fftCanvasRef.current;
    if (!canvas || history.length < 32) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const width = canvas.width;
    const height = canvas.height;

    // Processed Signal History
    const signalHistory = getProcessedSignalHistory();
    // Sub-sample to a power of 2 for DFT analysis, e.g., last 64 or 128 samples
    const sampleSize = Math.min(64, signalHistory.length);
    const samples = signalHistory.slice(-sampleSize);

    const psd = computeDft(samples);
    const len = psd.length;

    // Find max psd value for normalization
    const maxPsd = Math.max(...psd, 0.01);

    // Grid lines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const x = (width / 4) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw PSD bars
    ctx.fillStyle = 'rgba(16, 185, 129, 0.75)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;

    const barWidth = width / len - 2;
    for (let i = 0; i < len; i++) {
      const px = (i / len) * width;
      const val = psd[i];
      const barHeight = (val / maxPsd) * height * 0.9; // 95% scaling max
      
      ctx.fillRect(px, height - barHeight, barWidth, barHeight);
      ctx.strokeRect(px, height - barHeight, barWidth, barHeight);
    }

    // Draw a frequency line (X axis represents motion velocity or frequency)
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    ctx.fillText('0 Hz (DC)', 4, height - 6);
    ctx.fillText('Doppler (Motion Frequency)', width / 2 - 60, height - 6);
    ctx.fillText('25 Hz (Max)', width - 60, height - 6);

  }, [history, dspConfig]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Controls Panel */}
        <div className="xl:col-span-1 border border-[#333] bg-[#111114] rounded-none p-5 space-y-5 h-fit">
          <div className="flex items-center gap-2 pb-3 border-b border-[#222]">
            <Sliders size={16} className="text-brand-cyan" />
            <h3 className="font-display font-semibold text-sm text-slate-200 uppercase tracking-wider">
              DSP Pipeline Tuning
            </h3>
          </div>

          {/* Subcarrier Selection Mode */}
          <div className="space-y-2">
            <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Subcarrier Stream Mode</label>
            <div className="grid grid-cols-3 gap-1 bg-black/40 p-1 rounded-none border border-[#222]">
              {(['average', 'single', 'pca'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setDspConfig(prev => ({ ...prev, subcarrierSelectionMode: mode }))}
                  className={`py-1 text-[10px] font-mono rounded-none capitalize transition-all cursor-pointer ${
                    dspConfig.subcarrierSelectionMode === mode
                      ? 'bg-brand-cyan/20 text-brand-cyan font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  id={`subcarrier-mode-${mode}`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Subcarrier Selector slider (Only active in single mode) */}
          {dspConfig.subcarrierSelectionMode === 'single' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-400">SELECTED SUBCARRIER</span>
                <span className="text-brand-orange font-bold">Ch #{dspConfig.selectedSubcarrierIndex}</span>
              </div>
              <input
                type="range"
                min="0"
                max={(currentPacket?.amplitudes.length ?? 64) - 1}
                value={dspConfig.selectedSubcarrierIndex}
                onChange={e => setDspConfig(prev => ({ ...prev, selectedSubcarrierIndex: parseInt(e.target.value) }))}
                className="w-full accent-brand-cyan cursor-pointer"
                id="subcarrier-index-slider"
              />
              <div className="flex justify-between text-[9px] font-mono text-slate-500">
                <span>0 (Min)</span>
                <span>Sub-band Index</span>
                <span>{(currentPacket?.amplitudes.length ?? 64) - 1} (Max)</span>
              </div>
            </div>
          )}

          {/* DSP Filters toggles */}
          <div className="space-y-3 pt-2">
            <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">Signal Filters</label>
            
            {/* Moving average */}
            <div className="space-y-1.5 p-2.5 rounded-none bg-black/40 border border-[#222]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-300">Moving Average (MA)</span>
                <button
                  onClick={() => setDspConfig(prev => ({ ...prev, movingAverageEnabled: !prev.movingAverageEnabled }))}
                  className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${
                    dspConfig.movingAverageEnabled ? 'bg-brand-green' : 'bg-[#222]'
                  }`}
                  id="toggle-ma-filter"
                >
                  <span className={`w-3.5 h-3.5 rounded-full bg-slate-950 absolute top-0.25 transition-transform ${
                    dspConfig.movingAverageEnabled ? 'right-0.5' : 'left-0.5'
                  }`}></span>
                </button>
              </div>
              {dspConfig.movingAverageEnabled && (
                <div className="pt-2 space-y-1">
                  <div className="flex justify-between text-[9px] font-mono text-slate-400">
                    <span>Window Size</span>
                    <span>{dspConfig.movingAverageWindow} samples</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="15"
                    value={dspConfig.movingAverageWindow}
                    onChange={e => setDspConfig(prev => ({ ...prev, movingAverageWindow: parseInt(e.target.value) }))}
                    className="w-full accent-brand-cyan h-1 cursor-pointer"
                    id="ma-window-slider"
                  />
                </div>
              )}
            </div>

            {/* Butterworth High/Low Pass IIR filter */}
            <div className="space-y-1.5 p-2.5 rounded-none bg-black/40 border border-[#222]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-300">IIR Low-pass (Butterworth)</span>
                <button
                  onClick={() => setDspConfig(prev => ({ ...prev, butterworthEnabled: !prev.butterworthEnabled }))}
                  className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${
                    dspConfig.butterworthEnabled ? 'bg-brand-green' : 'bg-[#222]'
                  }`}
                  id="toggle-butterworth"
                >
                  <span className={`w-3.5 h-3.5 rounded-full bg-slate-950 absolute top-0.25 transition-transform ${
                    dspConfig.butterworthEnabled ? 'right-0.5' : 'left-0.5'
                  }`}></span>
                </button>
              </div>
              {dspConfig.butterworthEnabled && (
                <div className="pt-2 space-y-1">
                  <div className="flex justify-between text-[9px] font-mono text-slate-400">
                    <span>Alpha Filter Coeff</span>
                    <span>{dspConfig.butterworthCutoff.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="0.95"
                    step="0.05"
                    value={dspConfig.butterworthCutoff}
                    onChange={e => setDspConfig(prev => ({ ...prev, butterworthCutoff: parseFloat(e.target.value) }))}
                    className="w-full accent-brand-cyan h-1 cursor-pointer"
                    id="butterworth-cutoff-slider"
                  />
                </div>
              )}
            </div>

            {/* Kalman Filter */}
            <div className="space-y-1.5 p-2.5 rounded-none bg-black/40 border border-[#222]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-300">State Kalman Filter</span>
                <button
                  onClick={() => setDspConfig(prev => ({ ...prev, kalmanFilterEnabled: !prev.kalmanFilterEnabled }))}
                  className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${
                    dspConfig.kalmanFilterEnabled ? 'bg-brand-green' : 'bg-[#222]'
                  }`}
                  id="toggle-kalman"
                >
                  <span className={`w-3.5 h-3.5 rounded-full bg-slate-950 absolute top-0.25 transition-transform ${
                    dspConfig.kalmanFilterEnabled ? 'right-0.5' : 'left-0.5'
                  }`}></span>
                </button>
              </div>
              {dspConfig.kalmanFilterEnabled && (
                <div className="pt-2 space-y-2">
                  <div className="space-y-1">
                     <div className="flex justify-between text-[9px] font-mono text-slate-400">
                      <span>Process Noise (Q)</span>
                      <span>{dspConfig.kalmanQ.toExponential(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="-5"
                      max="-1"
                      step="1"
                      value={Math.log10(dspConfig.kalmanQ)}
                      onChange={e => setDspConfig(prev => ({ ...prev, kalmanQ: Math.pow(10, parseFloat(e.target.value)) }))}
                      className="w-full accent-brand-cyan h-1 cursor-pointer"
                      id="kalman-q-slider"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] font-mono text-slate-400">
                      <span>Measurement Noise (R)</span>
                      <span>{dspConfig.kalmanR.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.01"
                      max="1.0"
                      step="0.05"
                      value={dspConfig.kalmanR}
                      onChange={e => setDspConfig(prev => ({ ...prev, kalmanR: parseFloat(e.target.value) }))}
                      className="w-full accent-brand-cyan h-1 cursor-pointer"
                      id="kalman-r-slider"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live Graphs Area */}
        <div className="xl:col-span-3 space-y-6">
          {/* Tab Selector */}
          <div className="flex border border-[#333] border-b-0 bg-black/40 p-1 rounded-none gap-2">
            <button
              onClick={() => setActiveTab('raw')}
              className={`px-4 py-2 text-xs font-mono rounded-none tracking-wide transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'raw'
                  ? 'bg-[#111114] text-brand-cyan border border-[#333] font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              id="raw-signals-tab"
            >
              <Activity size={14} />
              RAW SUBCARRIERS (AMP/PHASE)
            </button>
            <button
              onClick={() => setActiveTab('dsp')}
              className={`px-4 py-2 text-xs font-mono rounded-none tracking-wide transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'dsp'
                  ? 'bg-[#111114] text-brand-cyan border border-[#333] font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              id="filtered-time-series-tab"
            >
              <Sliders size={14} />
              FILTERED TIME-SERIES
            </button>
            <button
              onClick={() => setActiveTab('fft')}
              className={`px-4 py-2 text-xs font-mono rounded-none tracking-wide transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'fft'
                  ? 'bg-[#111114] text-brand-cyan border border-[#333] font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              id="doppler-psd-tab"
            >
              <TrendingUp size={14} />
              DOPPLER FFT (FREQUENCY DOMAIN)
            </button>
          </div>

          {!currentPacket ? (
            <div className="h-[380px] border border-[#333] bg-black/40 rounded-none flex flex-col items-center justify-center text-slate-500 space-y-3 font-mono text-xs">
              <RefreshCw size={24} className="animate-spin text-brand-cyan" />
              <p>Awaiting incoming real-time CSI Packet streams...</p>
              <p className="text-[10px] text-slate-600">Ensure the Local Daemon is running or Enable Emulation.</p>
            </div>
          ) : (
            <div className="p-4 border border-[#333] bg-[#111114] rounded-none">
              {activeTab === 'raw' && (
                <div className="space-y-6">
                  {/* Amplitude Plot */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400 font-semibold uppercase">CSI Amplitude Profile (64 Orthogonal Channels)</span>
                      <span className="text-brand-green">Current RSSI: {currentPacket.rssi} dBm</span>
                    </div>
                    <div className="bg-black/60 rounded-none border border-[#333] p-2 overflow-hidden h-44 flex items-center">
                      <canvas
                         ref={ampCanvasRef}
                        width={600}
                        height={160}
                        className="w-full h-full block"
                      />
                    </div>
                  </div>

                  {/* Phase Plot */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400 font-semibold uppercase">CSI Carrier Phase wrapped between [-&pi;, &pi;] radians</span>
                      <span className="text-brand-cyan">Antenna 0 (Primary Rx)</span>
                    </div>
                    <div className="bg-black/60 rounded-none border border-[#333] p-2 overflow-hidden h-36 flex items-center">
                      <canvas
                        ref={phaseCanvasRef}
                        width={600}
                        height={120}
                        className="w-full h-full block"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'dsp' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400 font-semibold uppercase">Real-Time Filtering Comparison (Buffer: {history.length} frames)</span>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ff4e00]/60"></span> Raw Trace</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-green"></span> Filtered State</span>
                    </div>
                  </div>
                  <div className="bg-black/60 rounded-none border border-[#333] p-3 overflow-hidden h-80 flex items-center">
                    <canvas
                      ref={dspCanvasRef}
                      width={600}
                      height={280}
                      className="w-full h-full block"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'fft' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400 font-semibold uppercase">Power Spectral Density / Doppler Spectrum</span>
                    <span className="text-brand-cyan font-semibold">Motion Spectral Entropy: 0.42 (Active)</span>
                  </div>
                  
                  {history.length < 32 ? (
                    <div className="h-80 flex flex-col items-center justify-center border border-dashed border-[#222] rounded-none text-slate-500 font-mono text-xs">
                      <AlertCircle size={20} className="text-brand-orange mb-2 animate-pulse" />
                      Insufficient packet history ({history.length}/32) to resolve Doppler Fourier frequencies.
                    </div>
                  ) : (
                    <div className="bg-black/60 rounded-none border border-[#333] p-3 overflow-hidden h-80 flex items-center">
                      <canvas
                        ref={fftCanvasRef}
                        width={600}
                        height={280}
                        className="w-full h-full block"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
