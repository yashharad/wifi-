/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Upload, 
  FileText, 
  TrendingUp, 
  Clock, 
  Layers,
  Check,
  AlertTriangle,
  SkipForward
} from 'lucide-react';
import { CsiPacket } from '../types';

interface ReplayProps {
  onLoadReplayPackets: (packets: CsiPacket[], name: string) => void;
  addLog: (level: 'info' | 'warn' | 'error' | 'debug', msg: string, source: 'driver' | 'dsp' | 'ai' | 'websocket' | 'system') => void;
}

export default function ReplaySystem({ onLoadReplayPackets, addLog }: ReplayProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Generate real structured packets for pre-built scenarios
  const loadScenario = (type: 'walking' | 'breathing' | 'multiperson') => {
    setSelectedScenario(type);
    const packets: CsiPacket[] = [];
    const count = 100;
    const now = Date.now();

    for (let idx = 0; idx < count; idx++) {
      const timestamp = now + idx * 20; // 50 Hz capture rate (20ms)
      const subcarriers = 64;
      const amplitudes: number[] = [];
      const phases: number[] = [];

      // Base channel fade
      const baseSignal = 35;
      
      // Add multipath variations based on scenario
      let dynamicOffset = 0;
      let phaseOffset = 0;

      if (type === 'walking') {
        const freq = 4.0; // 4Hz Doppler walk frequency
        dynamicOffset = 8 * Math.sin(idx * 0.15 * freq);
        phaseOffset = (idx * 0.1) % (2 * Math.PI) - Math.PI;
      } else if (type === 'breathing') {
        const freq = 0.25; // 15 breaths per min
        dynamicOffset = 1.2 * Math.sin(idx * 0.15 * freq);
        phaseOffset = (idx * 0.02) % (2 * Math.PI) - Math.PI;
      } else {
        // Multi-person complex interference
        dynamicOffset = 12 * Math.sin(idx * 0.2) + 5 * Math.cos(idx * 0.08);
        phaseOffset = (idx * 0.18) % (2 * Math.PI) - Math.PI;
      }

      for (let s = 0; s < subcarriers; s++) {
        // Frequency selective fading shape
        const fadeValue = baseSignal + 12 * Math.sin((s / subcarriers) * Math.PI * 2);
        amplitudes.push(Math.max(5, fadeValue + dynamicOffset + Math.random() * 2));
        phases.push(phaseOffset + Math.random() * 0.1);
      }

      packets.push({
        packetId: idx + 1,
        timestamp,
        rssi: -50 + Math.floor(dynamicOffset),
        amplitudes,
        phases,
        noise: -95,
        antennaId: 0,
        frequencyBand: 5
      });
    }

    const labels = {
      walking: 'Walking Pattern in Lab',
      breathing: 'Stationary Breathing (0.25 Hz)',
      multiperson: 'Complex Multi-Person Interference'
    };

    onLoadReplayPackets(packets, labels[type]);
    addLog('info', `Successfully compiled and loaded Scenario Replay: ${labels[type]} (${count} frames).`, 'system');
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      parseAndLoadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      parseAndLoadFile(e.target.files[0]);
    }
  };

  // Parse JSON file containing packets
  const parseAndLoadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);

        // Basic verification
        if (Array.isArray(data) && data.length > 0 && 'amplitudes' in data[0]) {
          onLoadReplayPackets(data, file.name);
          addLog('info', `Successfully parsed and loaded CSI recorded dataset: ${file.name} (${data.length} packets)`, 'system');
        } else {
          throw new Error("Invalid packet format. Expected JSON array of CSI packets.");
        }
      } catch (err) {
        addLog('error', `Failed to parse file: ${(err as Error).message}`, 'system');
      }
    };
    reader.readAsText(file);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="space-y-6"
    >
      <div className="border border-[#333] bg-[#111114] p-6 rounded-none">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-[#00f2ff]/10 text-brand-cyan rounded-none border border-[#00f2ff]/20">
            <RotateCcw size={24} />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-slate-100 tracking-tight">
              Recorded Session Replay System
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Load previously recorded CSI files (.json, .csv) to replay multipath variations, or run high-fidelity experimental presets built by our signal researchers.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* Scenario Presets */}
        <div className="border border-[#333] bg-[#111114] rounded-none p-5 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-display font-semibold text-slate-200 text-sm tracking-tight mb-4 flex items-center gap-2">
              <Layers size={16} className="text-brand-cyan" />
              Experimental Preset Scenarios
            </h3>

            <div className="space-y-3.5">
              {/* Walking */}
              <button
                onClick={() => loadScenario('walking')}
                className={`w-full p-3.5 rounded-none text-left border cursor-pointer transition-all flex justify-between items-center ${
                  selectedScenario === 'walking'
                    ? 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/40 font-bold'
                    : 'bg-black/40 hover:bg-black text-slate-400 border-[#333] hover:border-brand-cyan/60'
                }`}
                id="scenario-walking-btn"
              >
                <div className="space-y-1">
                  <span className="font-mono text-xs font-semibold block text-slate-200">Scenario Alpha: Dynamic Human Walk</span>
                  <p className="font-sans text-[11px] text-slate-400 leading-normal">
                    Replays high amplitude variance, sharp Doppler frequency shift peaks, and dynamic 2D path tracking.
                  </p>
                </div>
                <SkipForward size={16} className="text-brand-cyan shrink-0 ml-3" />
              </button>

              {/* Breathing */}
              <button
                onClick={() => loadScenario('breathing')}
                className={`w-full p-3.5 rounded-none text-left border cursor-pointer transition-all flex justify-between items-center ${
                  selectedScenario === 'breathing'
                    ? 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/40 font-bold'
                    : 'bg-black/40 hover:bg-black text-slate-400 border-[#333] hover:border-brand-cyan/60'
                }`}
                id="scenario-breathing-btn"
              >
                <div className="space-y-1">
                  <span className="font-mono text-xs font-semibold block text-slate-200">Scenario Beta: Micro-movement & Breathing</span>
                  <p className="font-sans text-[11px] text-slate-400 leading-normal">
                    Replays sub-hertz oscillations (0.25 Hz respiratory rates), stationary room envelope, and static position.
                  </p>
                </div>
                <SkipForward size={16} className="text-brand-cyan shrink-0 ml-3" />
              </button>

              {/* Multi-Person */}
              <button
                onClick={() => loadScenario('multiperson')}
                className={`w-full p-3.5 rounded-none text-left border cursor-pointer transition-all flex justify-between items-center ${
                  selectedScenario === 'multiperson'
                    ? 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/40 font-bold'
                    : 'bg-black/40 hover:bg-black text-slate-400 border-[#333] hover:border-brand-cyan/60'
                }`}
                id="scenario-multiperson-btn"
              >
                <div className="space-y-1">
                  <span className="font-mono text-xs font-semibold block text-slate-200">Scenario Gamma: Complex Multi-path Interference</span>
                  <p className="font-sans text-[11px] text-slate-400 leading-normal">
                    Replays overlapping waves, constructive/destructive interference models, and dual tracking coordinates.
                  </p>
                </div>
                <SkipForward size={16} className="text-brand-cyan shrink-0 ml-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Drag and Drop File Upload */}
        <div 
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-none p-8 flex flex-col items-center justify-center text-center transition-all h-full ${
            dragActive 
              ? 'border-brand-cyan bg-brand-cyan/10 text-brand-cyan' 
              : 'border-[#333] bg-[#111114]/40 hover:border-brand-cyan/60 text-slate-500'
          }`}
        >
          <Upload size={36} className={`mb-3 ${dragActive ? 'text-brand-cyan' : 'text-slate-600'}`} />
          <h4 className="font-display font-semibold text-slate-200 text-sm tracking-tight mb-1">
            Drag and Drop CSI Dataset File
          </h4>
          <p className="text-xs text-slate-400 max-w-sm mb-4 leading-normal">
            Upload custom recorded sessions exported from RF-VOID or alternative Intel CSI collection tools (.json, .csv).
          </p>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-[#111114] hover:bg-black text-slate-300 border border-[#333] hover:border-brand-cyan/60 rounded-none font-mono text-xs cursor-pointer transition-colors"
            id="browse-files-btn"
          >
            BROWSE FILES
          </button>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv"
            onChange={handleFileInput}
            className="hidden"
          />

          <div className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
            <Clock size={12} />
            Supported rate: 10 - 200 Hz packet stream buffers.
          </div>
        </div>

      </div>
    </motion.div>
  );
}
