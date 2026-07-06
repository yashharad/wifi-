/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  BrainCircuit, 
  Database, 
  Play, 
  Folder, 
  Settings, 
  Plus, 
  Check, 
  LineChart as LineIcon, 
  Activity,
  Award,
  BookOpen,
  Copy,
  ChevronRight
} from 'lucide-react';
import { TrackingState } from '../types';

interface AiTrainingProps {
  trackingState: TrackingState;
  addLog: (level: 'info' | 'warn' | 'error' | 'debug', msg: string, source: 'driver' | 'dsp' | 'ai' | 'websocket' | 'system') => void;
}

export default function AiTrainingTemplate({ trackingState, addLog }: AiTrainingProps) {
  const [activeTab, setActiveTab] = useState<'collect' | 'train' | 'code'>('collect');
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectedClass, setCollectedClass] = useState<string>('walking');
  const [copiedCode, setCopiedCode] = useState(false);

  // Sample counts
  const [samples, setSamples] = useState<Record<string, number>>({
    stationary: 120,
    walking: 245,
    standing: 95,
    sitting: 80,
    running: 0
  });

  const [epoch, setEpoch] = useState(0);
  const [isTraining, setIsTraining] = useState(false);
  const [trainLogs, setTrainLogs] = useState<string[]>([]);
  const [trainMetrics, setTrainMetrics] = useState<{ epoch: number; loss: number; valAcc: number }[]>([]);

  // Simulated feature values
  const [currentFeatures, setCurrentFeatures] = useState({
    meanAmp: 34.2,
    stdAmp: 1.15,
    specEntropy: 0.28,
    dopplerShift: 0.05
  });

  useEffect(() => {
    if (!trackingState) return;
    // Calculate live simulated features based on tracking state
    const std = trackingState.isMoving 
      ? (trackingState.activity === 'running' ? 8.42 : 3.85) 
      : 0.12;
    const entropy = trackingState.isMoving 
      ? (trackingState.activity === 'running' ? 0.85 : 0.45) 
      : 0.15;
    
    setCurrentFeatures({
      meanAmp: 35 + (trackingState.isMoving ? Math.sin(Date.now() / 200) * 4 : 0),
      stdAmp: std + (trackingState.isMoving ? Math.random() * 0.5 : Math.random() * 0.02),
      specEntropy: entropy,
      dopplerShift: trackingState.dopplerShift
    });
  }, [trackingState]);

  // Handle sample collection simulation
  useEffect(() => {
    if (!isCollecting) return;
    const interval = setInterval(() => {
      setSamples(prev => ({
        ...prev,
        [collectedClass]: prev[collectedClass] + 5
      }));
    }, 100);
    return () => clearInterval(interval);
  }, [isCollecting, collectedClass]);

  const toggleCollection = () => {
    if (isCollecting) {
      addLog('info', `Stopped raw CSI data collection for activity class: ${collectedClass}`, 'ai');
    } else {
      addLog('info', `Starting data collection buffer for activity class: ${collectedClass}. Sniffing packet variance.`, 'ai');
    }
    setIsCollecting(!isCollecting);
  };

  // Simulated Neural Net training run
  const runModelTraining = () => {
    setIsTraining(true);
    setEpoch(0);
    setTrainLogs(['[INFO] Loading training dataset...', '[INFO] Features selected: Mean Amplitude, Amplitude STD, Spectral Entropy, Doppler Shift', '[INFO] Network Architecture: input(4) -> Layer1(64) -> BatchNorm -> ReLU -> Dropout(0.2) -> Layer2(32) -> output(5)', '[INFO] Total training parameters: 2,469']);
    setTrainMetrics([]);

    let currentEpoch = 0;
    const maxEpochs = 20;

    const interval = setInterval(() => {
      if (currentEpoch < maxEpochs) {
        currentEpoch++;
        setEpoch(currentEpoch);

        // Standard gradient descent curves
        const loss = 1.45 * Math.exp(-0.15 * currentEpoch) + 0.05 + Math.random() * 0.02;
        const valAcc = 0.45 + (0.45 * (1 - Math.exp(-0.2 * currentEpoch))) + Math.random() * 0.01;

        setTrainMetrics(prev => [...prev, { epoch: currentEpoch, loss, valAcc }]);
        setTrainLogs(prev => [
          ...prev,
          `Epoch ${currentEpoch}/${maxEpochs} - loss: ${loss.toFixed(4)} - val_accuracy: ${(valAcc * 100).toFixed(1)}%`
        ]);
      } else {
        clearInterval(interval);
        setIsTraining(false);
        setTrainLogs(prev => [...prev, '[SUCCESS] Model optimized! Saving weights into weights/rf_void_mlp.pth', '[INFO] Exporting TorchScript model for deployment.']);
        addLog('info', 'AI Model Training Completed successfully. Validation Accuracy: 93.4%.', 'ai');
      }
    }, 200);
  };

  const pyTorchCode = `import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np

class RFVoidClassifier(nn.Module):
    """
    Multilayer Perceptron for Wi-Fi Passive Sensing Activity Recognition.
    Takes 4-dimensional statistical feature vectors extracted from CSI amplitude and phase.
    """
    def __init__(self, num_classes=5):
        super(RFVoidClassifier, self).__init__()
        self.network = nn.Sequential(
            nn.Linear(4, 64),
            nn.BatchNorm1d(64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, num_classes)
        )
        
    def forward(self, x):
        return self.network(x)

class CsiDataset(Dataset):
    def __init__(self, features, labels):
        self.features = torch.tensor(features, dtype=torch.float32)
        self.labels = torch.tensor(labels, dtype=torch.long)
        
    def __len__(self):
        return len(self.features)
        
    def __getitem__(self, idx):
        return self.features[idx], self.labels[idx]

# Feature extraction utility (matching TypeScript frontend DSP)
def extract_csi_features(amplitude_history, phase_history, sampling_rate=50):
    """
    Extracts statistical and frequency domain features from CSI buffer
    """
    # Mean and STD
    mean_amp = np.mean(amplitude_history)
    std_amp = np.std(amplitude_history)
    
    # Spectral Entropy
    freqs, psd = signal.welch(amplitude_history, fs=sampling_rate)
    psd_norm = psd / np.sum(psd)
    spec_entropy = -np.sum(psd_norm * np.log2(psd_norm + 1e-12))
    
    # Estimating average Doppler Shift from phase derivative
    phase_diff = np.diff(phase_history)
    doppler_shift = np.mean(np.abs(phase_diff))
    
    return np.array([mean_amp, std_amp, spec_entropy, doppler_shift])
`;

  const copyCode = () => {
    navigator.clipboard.writeText(pyTorchCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      className="space-y-6"
    >
      <div className="border border-[#333] bg-[#111114] p-6 rounded-none">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-[#00f2ff]/10 text-brand-cyan rounded-none border border-[#00f2ff]/20">
            <BrainCircuit size={24} />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-slate-100 tracking-tight">
              AI Activity Recognition Suite
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Train neural network classifiers to recognize human actions (walking, breathing, sitting) 
              using multi-path signature envelopes. Design PyTorch models, collect signal datasets, and execute training iterations.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border border-[#333] border-b-0 bg-black/40 p-1 rounded-none gap-2">
        <button
          onClick={() => setActiveTab('collect')}
          className={`px-4 py-2 text-xs font-mono rounded-none tracking-wide transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'collect'
              ? 'bg-[#111114] text-brand-cyan border border-[#333] font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
          id="collect-datasets-tab"
        >
          <Database size={14} />
          1. DATASET RECORDER
        </button>
        <button
          onClick={() => setActiveTab('train')}
          className={`px-4 py-2 text-xs font-mono rounded-none tracking-wide transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'train'
              ? 'bg-[#111114] text-brand-cyan border border-[#333] font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
          id="train-neural-network-tab"
        >
          <BrainCircuit size={14} />
          2. NEURAL NETWORK TRAINING
        </button>
        <button
          onClick={() => setActiveTab('code')}
          className={`px-4 py-2 text-xs font-mono rounded-none tracking-wide transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'code'
              ? 'bg-[#111114] text-brand-cyan border border-[#333] font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
          id="export-pytorch-tab"
        >
          <Award size={14} />
          3. PYTORCH CORE CODE
        </button>
      </div>

      <div className="p-5 border border-[#333] bg-[#111114] rounded-none">
        {activeTab === 'collect' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            
            {/* Feature Extraction panel */}
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-slate-200 text-sm tracking-tight flex items-center gap-2">
                <Activity size={16} className="text-brand-cyan" />
                Live Feature Extraction (4D)
              </h3>
              
              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 bg-black/40 rounded-none border border-[#222] flex items-center justify-between">
                  <span className="text-slate-400">Mean Signal Amplitude</span>
                  <span className="text-brand-cyan font-bold">{currentFeatures.meanAmp.toFixed(2)} dB</span>
                </div>
                
                <div className="p-3 bg-black/40 rounded-none border border-[#222] flex items-center justify-between">
                  <span className="text-slate-400">Amplitude Std-Dev (Variance)</span>
                  <span className="text-brand-cyan font-bold">{currentFeatures.stdAmp.toFixed(2)} dB</span>
                </div>

                <div className="p-3 bg-black/40 rounded-none border border-[#222] flex items-center justify-between">
                  <span className="text-slate-400">Spectral Entropy</span>
                  <span className="text-brand-cyan font-bold">{currentFeatures.specEntropy.toFixed(2)}</span>
                </div>

                <div className="p-3 bg-black/40 rounded-none border border-[#222] flex items-center justify-between">
                  <span className="text-slate-400">Est. Doppler Frequency</span>
                  <span className="text-brand-cyan font-bold">{currentFeatures.dopplerShift.toFixed(2)} Hz</span>
                </div>
              </div>
            </div>

            {/* Collection controls */}
            <div className="xl:col-span-2 space-y-6">
              <h3 className="font-display font-semibold text-slate-200 text-sm tracking-tight flex items-center gap-2">
                <Database size={16} className="text-brand-cyan" />
                Label Classifier Samples
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">Target Activity Class</label>
                  <select
                    value={collectedClass}
                    onChange={e => setCollectedClass(e.target.value)}
                    className="w-full p-2.5 bg-black/40 border border-[#333] rounded-none font-mono text-xs text-slate-300 focus:outline-none focus:border-brand-cyan cursor-pointer"
                    id="select-activity-class"
                  >
                    <option value="stationary">Stationary (Breathing/Resting)</option>
                    <option value="walking">Walking Pattern</option>
                    <option value="standing">Standing Up / Sitting Down</option>
                    <option value="sitting">Sitting (Micro-movement)</option>
                    <option value="running">Running / High Disturbance</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={toggleCollection}
                    className={`w-full py-2.5 rounded-none font-mono text-xs tracking-wide cursor-pointer transition-all ${
                      isCollecting 
                        ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-950 animate-pulse'
                        : 'bg-[#111114] hover:bg-black text-brand-cyan border border-[#333] hover:border-brand-cyan/60 font-bold'
                    }`}
                    id="toggle-collection-btn"
                  >
                    {isCollecting ? 'STOP CAPTURE BUFFER' : 'START LIVE SENSE BUFFER'}
                  </button>
                </div>
              </div>

              {/* Progress and inventory */}
              <div className="space-y-3.5 pt-4">
                <h4 className="font-mono text-[11px] text-slate-500 uppercase tracking-wider">Collected Dataset Inventory</h4>
                
                <div className="space-y-2.5 text-xs font-mono">
                  {Object.entries(samples).map(([cls, count]) => {
                    const countNum = Number(count);
                    // Maximum sample goal of 300
                    const percent = Math.min(100, (countNum / 300) * 100);
                    return (
                      <div key={cls} className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="capitalize text-slate-300">{cls} Class</span>
                          <span className="text-slate-400">{countNum} / 300 samples {percent >= 100 && '✅'}</span>
                        </div>
                        <div className="h-2 bg-black/40 rounded-none border border-[#222] overflow-hidden">
                          <div 
                            className="h-full bg-brand-cyan transition-all duration-300" 
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'train' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Training control panel */}
            <div className="border border-[#333] bg-black/20 rounded-none p-5 space-y-4">
              <h3 className="font-display font-semibold text-slate-100 text-sm tracking-tight mb-2">
                MLP Optimization Engine
              </h3>
              
              <div className="space-y-3.5 text-xs">
                <div className="p-3 bg-black/40 rounded-none border border-[#222] space-y-2">
                  <span className="text-[11px] font-mono text-slate-400 uppercase block">Epoch Iterations</span>
                  <div className="font-mono text-slate-200 text-lg font-bold">{epoch} / 20</div>
                </div>

                <div className="p-3 bg-black/40 rounded-none border border-[#222] space-y-2">
                  <span className="text-[11px] font-mono text-slate-400 uppercase block">Model Accuracy Goal</span>
                  <div className="font-mono text-slate-200 text-lg font-bold">95.0% target</div>
                </div>

                <button
                  onClick={runModelTraining}
                  disabled={isTraining}
                  className={`w-full py-2.5 rounded-none font-mono text-xs font-bold cursor-pointer tracking-wide transition-all ${
                    isTraining
                      ? 'bg-black/40 text-slate-500 border border-[#222] cursor-not-allowed'
                      : 'bg-[#111114] hover:bg-black text-brand-cyan border border-[#333] hover:border-brand-cyan/60'
                  }`}
                  id="train-model-btn"
                >
                  {isTraining ? 'OPTIMIZING GRADIENTS...' : 'TRAIN NEURAL NETWORK'}
                </button>
              </div>
            </div>

            {/* Logs/loss curve terminal */}
            <div className="lg:col-span-2 flex flex-col border border-[#333] bg-[#050507] rounded-none overflow-hidden h-[300px]">
              <div className="flex items-center justify-between px-4 py-2 border-b border-[#333] bg-[#111114]">
                <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                  <Activity size={12} /> Training Loss Curve Terminal
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Learning Rate: 1e-3</span>
              </div>
              <div className="flex-1 p-4 font-mono text-[11px] overflow-y-auto terminal-scroll bg-[#050507] text-slate-300 space-y-1">
                {trainLogs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-1">
                    <BrainCircuit size={28} className="opacity-30" />
                    <p>Click "TRAIN NEURAL NETWORK" to initiate SGD.</p>
                  </div>
                ) : (
                  trainLogs.map((log, idx) => {
                    let color = 'text-slate-400';
                    if (log.startsWith('[SUCCESS]')) color = 'text-brand-green font-bold';
                    else if (log.startsWith('[INFO]')) color = 'text-brand-cyan';
                    else if (log.includes('Epoch')) color = 'text-slate-300';
                    return <div key={idx} className={color}>{log}</div>;
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'code' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400 font-semibold uppercase flex items-center gap-1">
                <BookOpen size={14} className="text-brand-cyan" />
                PyTorch Neural Classifier Template (torch.nn.Module)
              </span>
              <button
                onClick={copyCode}
                className="px-2.5 py-1 rounded-none bg-[#111114] hover:bg-black text-brand-cyan hover:text-white transition-colors flex items-center gap-1 text-xs border border-[#333] cursor-pointer font-mono"
                id="copy-pytorch-code-btn"
              >
                {copiedCode ? <Check size={12} className="text-brand-green" /> : <Copy size={12} />}
                {copiedCode ? 'COPIED!' : 'COPY CODE'}
              </button>
            </div>

            <div className="border border-[#333] bg-[#050507] rounded-none p-4 overflow-y-auto h-[350px] terminal-scroll font-mono text-[11px] text-slate-300">
              <pre>{pyTorchCode}</pre>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
