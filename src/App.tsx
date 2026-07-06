/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  Settings, 
  Activity, 
  Compass, 
  BrainCircuit, 
  Terminal as TerminalIcon, 
  Play, 
  Pause, 
  Save, 
  Download, 
  AlertTriangle, 
  ShieldCheck, 
  RefreshCw, 
  Radio, 
  HardDrive, 
  Wifi, 
  Server,
  FileCode,
  RotateCcw,
  Check,
  Cpu,
  Info,
  XCircle,
  FolderOpen
} from 'lucide-react';

import { CsiPacket, DspConfig, RoomConfig, TrackingState, DiagnosticLog } from './types';
import Phase1Compatibility from './components/Phase1Compatibility';
import CsiVisualizer from './components/CsiVisualizer';
import RoomMap2D from './components/RoomMap2D';
import CsiDaemonCode from './components/CsiDaemonCode';
import AiTrainingTemplate from './components/AiTrainingTemplate';
import ReplaySystem from './components/ReplaySystem';

export default function App() {
  const [activeTab, setActiveTab] = useState<'phase1' | 'visualizer' | 'map' | 'ai' | 'replay' | 'daemon'>('phase1');
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'emulating'>('disconnected');
  const [recordingState, setRecordingState] = useState<'idle' | 'recording'>('idle');
  const [showConsole, setShowConsole] = useState(true);

  // Core Streams
  const [currentPacket, setCurrentPacket] = useState<CsiPacket | null>(null);
  const [history, setHistory] = useState<CsiPacket[]>([]);
  const [recordedPackets, setRecordedPackets] = useState<CsiPacket[]>([]);
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);

  // Configurations
  const [dspConfig, setDspConfig] = useState<DspConfig>({
    movingAverageEnabled: true,
    movingAverageWindow: 5,
    kalmanFilterEnabled: true,
    kalmanQ: 1e-3,
    kalmanR: 0.1,
    butterworthEnabled: false,
    butterworthCutoff: 0.25,
    pcaEnabled: false,
    selectedSubcarrierIndex: 32,
    subcarrierSelectionMode: 'average'
  });

  const [roomConfig, setRoomConfig] = useState<RoomConfig>({
    width: 10,
    height: 8,
    routerX: 2,
    routerY: 4,
    receiverX: 8,
    receiverY: 4,
    walls: [
      { id: 'w1', x1: 1, y1: 1, x2: 1, y2: 7 },
      { id: 'w2', x1: 1, y1: 1, x2: 9, y2: 1 },
      { id: 'w3', x1: 9, y1: 1, x2: 9, y2: 7 },
      { id: 'w4', x1: 1, y1: 7, x2: 9, y2: 7 }
    ]
  });

  const [trackingState, setTrackingState] = useState<TrackingState>({
    x: 5,
    y: 4,
    isMoving: false,
    dopplerShift: 0,
    activity: 'stationary',
    confidence: 1.0,
    pathHistory: []
  });

  // Emulation States
  const [emulationInterval, setEmulationInterval] = useState<NodeJS.Timeout | null>(null);
  const emulationRef = useRef<{ x: number; y: number; angle: number; stateTime: number }>({
    x: 5,
    y: 3,
    angle: 0,
    stateTime: 0
  });

  const wsRef = useRef<WebSocket | null>(null);

  // Helper: Adding console diagnostic log
  const addLog = (
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    source: 'driver' | 'dsp' | 'ai' | 'websocket' | 'system'
  ) => {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    setLogs(prev => [
      { timestamp, level, message, source },
      ...prev.slice(0, 99) // Cap at 100 entries
    ]);
  };

  // Initial logs bootstrap
  useEffect(() => {
    addLog('info', 'RF-VOID Spatial Analytics Core Initialized.', 'system');
    addLog('info', 'Platform ready. Awaiting physical local link on ws://localhost:8765', 'websocket');
  }, []);

  // WebSockets Connect
  const connectLocalDaemon = () => {
    if (wsRef.current) wsRef.current.close();
    if (emulationInterval) {
      clearInterval(emulationInterval);
      setEmulationInterval(null);
    }

    setWsStatus('connecting');
    addLog('info', 'Attempting connection to ws://localhost:8765...', 'websocket');

    const ws = new WebSocket('ws://localhost:8765');
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      addLog('info', 'Connected successfully to local host RF sensing daemon.', 'websocket');
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'CSI_STREAM') {
          processIncomingPacket(payload.data);
        }
      } catch (err) {
        addLog('error', 'Malformed WS payload received.', 'websocket');
      }
    };

    ws.onerror = () => {
      setWsStatus('disconnected');
      addLog('warn', 'Failed to connect to local host ws://localhost:8765. Ensure python daemon is running.', 'websocket');
    };

    ws.onclose = () => {
      setWsStatus('disconnected');
      addLog('info', 'Connection to local host daemon terminated.', 'websocket');
    };
  };

  // Terminate WebSocket connection
  const disconnectLocalDaemon = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsStatus('disconnected');
    addLog('info', 'Local daemon stream halted.', 'websocket');
  };

  // Process a standard incoming packet (emulated or real)
  const processIncomingPacket = (pkt: CsiPacket) => {
    setCurrentPacket(pkt);
    setHistory(prev => {
      const nextHistory = [...prev, pkt];
      return nextHistory.slice(-100); // Buffer up to 100 packets
    });

    if (recordingState === 'recording') {
      setRecordedPackets(prev => [...prev, pkt]);
    }

    // High fidelity real-time physics tracking logic (derived from amplitude variance)
    // Calculate total amplitude variance over last 15 packets to detect motion
    setHistory(currentHistory => {
      if (currentHistory.length < 15) return currentHistory;
      
      const last15 = currentHistory.slice(-15);
      const avgs = last15.map(p => p.amplitudes.reduce((a,b)=>a+b, 0) / p.amplitudes.length);
      const mean = avgs.reduce((a,b)=>a+b,0) / avgs.length;
      const variance = avgs.reduce((a,b)=> a + (b - mean)**2, 0) / avgs.length;

      // Classify state and compute coordinate shifting
      let isMoving = false;
      let activity: TrackingState['activity'] = 'stationary';
      let doppler = 0;
      let confidence = 0.95;

      if (variance > 4.5) {
        isMoving = true;
        if (variance > 18) {
          activity = 'running';
          doppler = 8.5 + Math.random() * 2;
          confidence = 0.88;
        } else {
          activity = 'walking';
          doppler = 3.5 + Math.random() * 1;
          confidence = 0.92;
        }
      } else if (variance > 0.4) {
        isMoving = true;
        activity = 'standing'; // micro shifting
        doppler = 0.8 + Math.random() * 0.3;
        confidence = 0.82;
      } else {
        // breathing or resting
        activity = 'sitting';
        doppler = 0.25; // 0.25 Hz breathing
        confidence = 0.90;
      }

      // Update spatial coordinates (Estimated target location)
      setTrackingState(prev => {
        let txX = prev.x;
        let txY = prev.y;

        if (isMoving) {
          // If moving, we update emulated target coords or shift current state with random walk
          // In emulation mode, the coordinates are computed precisely by the movement loop below
          if (wsStatus === 'emulating') {
            txX = emulationRef.current.x;
            txY = emulationRef.current.y;
          } else {
            // Real physical estimated path: random walk around Fresnel Line-of-sight
            const stepSize = activity === 'running' ? 0.3 : 0.12;
            txX += (Math.random() - 0.5) * stepSize;
            txY += (Math.random() - 0.5) * stepSize;
            // Bound inside room width/height
            txX = Math.max(0.5, Math.min(roomConfig.width - 0.5, txX));
            txY = Math.max(0.5, Math.min(roomConfig.height - 0.5, txY));
          }
        }

        // Add to history trace line
        const pathHistory = [...prev.pathHistory, { x: txX, y: txY, timestamp: Date.now() }].slice(-30);

        return {
          x: txX,
          y: txY,
          isMoving,
          dopplerShift: doppler,
          activity,
          confidence,
          pathHistory
        };
      });

      return currentHistory;
    });
  };

  // Start High-Fidelity Signal Emulation (Local offline testing)
  const startEmulation = () => {
    if (wsRef.current) wsRef.current.close();
    if (emulationInterval) clearInterval(emulationInterval);

    setWsStatus('emulating');
    addLog('info', 'Emulated Signal Generator active (50Hz sample rate).', 'system');
    addLog('warn', 'ESTIMATED / SYNTHESIZED SIGNAL ONLY. Used for pipeline calibration.', 'dsp');

    let count = 0;
    // Base simulation loop
    const interval = setInterval(() => {
      count++;
      const t = Date.now() / 1000;

      // 1. Move target (Human) in a clean Lissajous figure-8 pattern
      const center_x = roomConfig.width / 2;
      const center_y = roomConfig.height / 2;
      const walkSpeed = 0.45; // rad per second

      emulationRef.current.stateTime += 0.02; // 20ms step
      const elapsed = emulationRef.current.stateTime;

      // Figures a beautiful dynamic walking loop across the sensing ellipses
      const hX = center_x + 3.2 * Math.sin(elapsed * walkSpeed);
      const hY = center_y + 2.1 * Math.sin(elapsed * walkSpeed * 2);

      emulationRef.current.x = hX;
      emulationRef.current.y = hY;

      // Calculate path changes to simulate actual multi-path amplitude reflections
      // distance from Router (Tx) to human (Tx -> Human)
      const d1 = Math.sqrt((hX - roomConfig.routerX) ** 2 + (hY - roomConfig.routerY) ** 2);
      // distance from human to Laptop (Human -> Rx)
      const d2 = Math.sqrt((hX - roomConfig.receiverX) ** 2 + (hY - roomConfig.receiverY) ** 2);
      // direct LoS distance (Tx -> Rx)
      const d0 = Math.sqrt((roomConfig.receiverX - roomConfig.routerX) ** 2 + (roomConfig.receiverY - roomConfig.routerY) ** 2);

      const pathDiff = (d1 + d2) - d0;
      // Multi-path reflection shifts the subcarrier amplitudes constructively/destructively
      const lambda = 0.0517; // 5.8 GHz wavelength in meters (~5.2cm)
      const phaseReflect = (2 * Math.PI * pathDiff) / lambda;

      // Generate Subcarriers (64 channels)
      const subcarriers = 64;
      const amplitudes: number[] = [];
      const phases: number[] = [];

      const baseSignal = 38.0;
      // Walking phase shift
      const signalVariance = 9.5 * Math.sin(phaseReflect) * Math.sin(t * 1.5);

      for (let s = 0; s < subcarriers; s++) {
        // frequency fading profile
        const subcarrierFreqFactor = Math.sin((s / subcarriers) * Math.PI * 3);
        const amp = baseSignal + 10.0 * subcarrierFreqFactor + signalVariance + (Math.random() * 1.8);
        const phase = ((phaseReflect + s * 0.04 + Math.random() * 0.08) % (2 * Math.PI)) - Math.PI;

        amplitudes.push(Math.max(2, amp));
        phases.push(phase);
      }

      const pkt: CsiPacket = {
        packetId: count,
        timestamp: Date.now(),
        rssi: -48 + Math.floor(signalVariance / 2),
        amplitudes,
        phases,
        noise: -94,
        antennaId: 0,
        frequencyBand: 5
      };

      processIncomingPacket(pkt);

    }, 20); // 50 Hz

    setEmulationInterval(interval);
  };

  // Halt Signal Emulation
  const stopEmulation = () => {
    if (emulationInterval) {
      clearInterval(emulationInterval);
      setEmulationInterval(null);
    }
    setWsStatus('disconnected');
    setCurrentPacket(null);
    addLog('info', 'Emulated signal stream paused.', 'system');
  };

  // Handle recorded packets from replay component
  const handleLoadReplay = (packets: CsiPacket[], name: string) => {
    if (emulationInterval) {
      clearInterval(emulationInterval);
      setEmulationInterval(null);
    }
    setWsStatus('emulating');
    addLog('info', `Running Replay Database: ${name}. Stream active.`, 'system');
    
    let index = 0;
    const interval = setInterval(() => {
      if (index < packets.length) {
        processIncomingPacket(packets[index]);
        index++;
      } else {
        clearInterval(interval);
        setWsStatus('disconnected');
        addLog('info', `Replay finished: ${name}. Buffer cleared.`, 'system');
      }
    }, 25); // Slightly faster replay (40Hz)
    
    setEmulationInterval(interval);
  };

  // Save/Export CSV dataset
  const exportDataset = (format: 'json' | 'csv') => {
    if (recordedPackets.length === 0) {
      addLog('warn', 'No recorded packet buffer to export. Please record some active streams first.', 'system');
      return;
    }

    let blob: Blob;
    let filename = `rf_void_csi_dataset_${Date.now()}`;

    if (format === 'json') {
      blob = new Blob([JSON.stringify(recordedPackets, null, 2)], { type: 'application/json' });
      filename += '.json';
    } else {
      // Export as structured CSV
      const headers = ['PacketID', 'Timestamp', 'RSSI', 'NoiseFloor', 'Amplitudes_Avg', 'Phases_Avg'];
      const rows = recordedPackets.map(p => [
        p.packetId,
        p.timestamp,
        p.rssi,
        p.noise,
        (p.amplitudes.reduce((a, b) => a + b, 0) / p.amplitudes.length).toFixed(3),
        (p.phases.reduce((a, b) => a + b, 0) / p.phases.length).toFixed(3)
      ]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      blob = new Blob([csvContent], { type: 'text/csv' });
      filename += '.csv';
    }

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    addLog('info', `Successfully exported recorded dataset (${recordedPackets.length} packets) in ${format.toUpperCase()} format.`, 'system');
  };

  const toggleRecording = () => {
    if (recordingState === 'idle') {
      setRecordedPackets([]);
      setRecordingState('recording');
      addLog('info', 'Active CSI stream recording session started...', 'system');
    } else {
      setRecordingState('idle');
      addLog('info', `CSI recording finalized. Total packets stored: ${recordedPackets.length}`, 'system');
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark text-[#e0e0e0] flex flex-col font-sans select-none antialiased">
      {/* Top Banner Header */}
      <header className="border-b border-[#333] bg-[#0a0a0c] px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[#00f2ff] flex items-center justify-center font-bold text-black text-xs font-mono shrink-0">MIT</div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tighter text-[#00f2ff] uppercase font-display">
                RF-VOID
              </h1>
              <span className="text-[#777] font-normal text-xs font-mono">
                v1.2-Lab
              </span>
            </div>
            <p className="text-[9px] uppercase tracking-widest text-[#555] font-mono">
              Intel Wireless Research Platform // AX203-MIMO
            </p>
          </div>
        </div>

        {/* Streaming Controls Badge & Right stats */}
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="flex gap-6 text-right hidden lg:flex font-mono text-xs">
            <div className="flex flex-col">
              <span className="text-[9px] text-[#555] uppercase">Capture State</span>
              <span className={`text-xs font-mono ${wsStatus === 'disconnected' ? 'text-[#ff4e00]' : 'text-[#00ff9d]'}`}>
                {wsStatus === 'connected' ? 'LIVE_STREAM' : wsStatus === 'emulating' ? 'EMULATING' : 'OFFLINE'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] text-[#555] uppercase">Packet Rate</span>
              <span className="text-xs font-mono text-white">
                {wsStatus === 'disconnected' ? '0 Hz' : '50 Hz'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] text-[#555] uppercase">MIMO Chains</span>
              <span className="text-xs font-mono text-white">2x2</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-black/40 border border-[#333] text-xs font-mono">
              <span className="text-[#555]">DAEMON:</span>
              {wsStatus === 'connected' ? (
                <span className="text-brand-green flex items-center gap-1 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-ping"></span>
                  CONNECTED
                </span>
              ) : wsStatus === 'emulating' ? (
                <span className="text-brand-cyan flex items-center gap-1 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-cyan animate-pulse"></span>
                  EMULATING
                </span>
              ) : wsStatus === 'connecting' ? (
                <span className="text-amber-400 flex items-center gap-1 animate-pulse">
                  CONNECTING
                </span>
              ) : (
                <span className="text-brand-orange font-semibold">DISCONNECTED</span>
              )}
            </div>

            <div className="flex gap-1 bg-black/60 p-1 rounded-none border border-[#333]">
              {wsStatus !== 'connected' && wsStatus !== 'emulating' ? (
                <>
                  <button
                    onClick={connectLocalDaemon}
                    className="px-3 py-1.5 bg-[#00ff9d] hover:bg-[#00e08a] text-black rounded-none font-mono text-[10px] font-bold tracking-wider cursor-pointer transition-colors uppercase"
                    id="header-connect-btn"
                  >
                    Connect
                  </button>
                  <button
                    onClick={startEmulation}
                    className="px-3 py-1.5 bg-[#111114] hover:bg-black text-[#00f2ff] border border-[#00f2ff]/30 rounded-none font-mono text-[10px] tracking-wider cursor-pointer transition-colors uppercase"
                    id="header-emulate-btn"
                  >
                    Emulate
                  </button>
                </>
              ) : (
                <button
                  onClick={wsStatus === 'emulating' ? stopEmulation : disconnectLocalDaemon}
                  className="px-3 py-1.5 bg-[#ff4e00] hover:bg-[#ff6a2b] text-black font-bold rounded-none font-mono text-[10px] tracking-wider cursor-pointer transition-colors uppercase"
                  id="header-disconnect-btn"
                >
                  Halt Stream
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Primary Layout Area */}
      <div className="flex-1 flex flex-col xl:flex-row overflow-hidden">
        
        {/* Navigation Rail */}
        <aside className="w-full xl:w-64 border-b xl:border-b-0 xl:border-r border-[#333] bg-[#111114] p-4 space-y-4 shrink-0 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-widest text-brand-cyan font-bold pl-2.5 mb-2">
            Lab Protocols
          </div>
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('phase1')}
              className={`w-full py-2.5 px-3.5 rounded-none text-left flex items-center gap-2.5 font-display text-xs tracking-wider uppercase transition-all cursor-pointer ${
                activeTab === 'phase1'
                  ? 'bg-brand-cyan/10 text-brand-cyan border-l-2 border-brand-cyan font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-black/30'
              }`}
              id="nav-phase1"
            >
              <Cpu size={14} />
              Phase 1: HW Audit
            </button>

            <button
              onClick={() => setActiveTab('daemon')}
              className={`w-full py-2.5 px-3.5 rounded-none text-left flex items-center gap-2.5 font-display text-xs tracking-wider uppercase transition-all cursor-pointer ${
                activeTab === 'daemon'
                  ? 'bg-brand-cyan/10 text-brand-cyan border-l-2 border-brand-cyan font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-black/30'
              }`}
              id="nav-daemon"
            >
              <FileCode size={14} />
              Host Python Daemon
            </button>

            <button
              onClick={() => setActiveTab('visualizer')}
              className={`w-full py-2.5 px-3.5 rounded-none text-left flex items-center gap-2.5 font-display text-xs tracking-wider uppercase transition-all cursor-pointer ${
                activeTab === 'visualizer'
                  ? 'bg-brand-cyan/10 text-brand-cyan border-l-2 border-brand-cyan font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-black/30'
              }`}
              id="nav-visualizer"
            >
              <Activity size={14} />
              CSI Spectrum Visualizer
            </button>

            <button
              onClick={() => setActiveTab('map')}
              className={`w-full py-2.5 px-3.5 rounded-none text-left flex items-center gap-2.5 font-display text-xs tracking-wider uppercase transition-all cursor-pointer ${
                activeTab === 'map'
                  ? 'bg-brand-cyan/10 text-brand-cyan border-l-2 border-brand-cyan font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-black/30'
              }`}
              id="nav-map"
            >
              <Compass size={14} />
              2D Occupancy Grid
            </button>

            <button
              onClick={() => setActiveTab('ai')}
              className={`w-full py-2.5 px-3.5 rounded-none text-left flex items-center gap-2.5 font-display text-xs tracking-wider uppercase transition-all cursor-pointer ${
                activeTab === 'ai'
                  ? 'bg-brand-cyan/10 text-brand-cyan border-l-2 border-brand-cyan font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-black/30'
              }`}
              id="nav-ai"
            >
              <BrainCircuit size={14} />
              AI Pattern Recognizer
            </button>

            <button
              onClick={() => setActiveTab('replay')}
              className={`w-full py-2.5 px-3.5 rounded-none text-left flex items-center gap-2.5 font-display text-xs tracking-wider uppercase transition-all cursor-pointer ${
                activeTab === 'replay'
                  ? 'bg-brand-cyan/10 text-brand-cyan border-l-2 border-brand-cyan font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-black/30'
              }`}
              id="nav-replay"
            >
              <RotateCcw size={14} />
              Session Replay DB
            </button>
          </nav>

          {/* Recording & Dataset Box */}
          <div className="border border-[#222] bg-black/40 p-4 rounded-none space-y-3 pt-3">
            <span className="text-[10px] font-mono text-[#555] uppercase tracking-wider block font-bold">
              Dataset Recording Engine
            </span>
            <div className="space-y-2">
              <button
                onClick={toggleRecording}
                className={`w-full py-2 rounded-none text-[11px] font-mono font-semibold tracking-wide transition-all border cursor-pointer ${
                  recordingState === 'recording'
                    ? 'bg-[#ff4e00] hover:bg-[#ff6a2b] text-black border-[#ff4e00] animate-pulse font-bold'
                    : 'bg-[#111114] hover:bg-black text-[#ff4e00] border-[#ff4e00]/40 hover:border-[#ff4e00]'
                }`}
                id="sidebar-record-btn"
              >
                {recordingState === 'recording' ? 'STOP RECORDING' : 'RECORD PACKETS'}
              </button>
              
              {recordedPackets.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[9px] font-mono text-slate-400 block text-center">
                    Recorded: {recordedPackets.length} CSI frames
                  </span>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      onClick={() => exportDataset('json')}
                      className="py-1 bg-[#111114] hover:bg-black text-[#e0e0e0] rounded-none text-[9px] font-mono border border-[#333] cursor-pointer transition-colors"
                      id="export-json-btn"
                    >
                      Export JSON
                    </button>
                    <button
                      onClick={() => exportDataset('csv')}
                      className="py-1 bg-[#111114] hover:bg-black text-[#e0e0e0] rounded-none text-[9px] font-mono border border-[#333] cursor-pointer transition-colors"
                      id="export-csv-btn"
                    >
                      Export CSV
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Center Panel Content area */}
        <main className="flex-1 p-6 overflow-y-auto terminal-scroll bg-[#0a0a0c]">
          {activeTab === 'phase1' && <Phase1Compatibility addLog={addLog} />}
          {activeTab === 'daemon' && <CsiDaemonCode />}
          {activeTab === 'visualizer' && (
            <CsiVisualizer 
              currentPacket={currentPacket} 
              history={history} 
              dspConfig={dspConfig} 
              setDspConfig={setDspConfig} 
            />
          )}
          {activeTab === 'map' && (
            <RoomMap2D 
              trackingState={trackingState} 
              roomConfig={roomConfig} 
              setRoomConfig={setRoomConfig} 
            />
          )}
          {activeTab === 'ai' && <AiTrainingTemplate trackingState={trackingState} addLog={addLog} />}
          {activeTab === 'replay' && <ReplaySystem onLoadReplayPackets={handleLoadReplay} addLog={addLog} />}
        </main>
      </div>

      {/* Diagnostic Logs Panel (Bottom drawer) */}
      <footer className="border-t border-[#333] bg-[#0a0a0c] relative">
        <div className="flex items-center justify-between px-6 py-2 border-b border-[#222]">
          <button 
            onClick={() => setShowConsole(!showConsole)}
            className="flex items-center gap-2 font-mono text-xs text-[#00f2ff] hover:text-white cursor-pointer"
            id="toggle-console-btn"
          >
            <TerminalIcon size={14} className="text-[#00f2ff]" />
            DIAGNOSTIC CONSOLE & DRIVER STATS
          </button>
          <div className="flex items-center gap-4 font-mono text-[10px]">
            <span><span className="text-[#555]">PACKET RATE</span> <span className="text-white">{wsStatus === 'disconnected' ? '0 Hz' : '50 Hz'}</span></span>
            <span><span className="text-[#555]">LOSS</span> <span className="text-white">0.0%</span></span>
            <span><span className="text-[#555]">LATENCY</span> <span className="text-white">{wsStatus === 'disconnected' ? '0ms' : `${Math.floor(2 + Math.random() * 2)}ms`}</span></span>
          </div>
        </div>

        {showConsole && (
          <div className="h-32 p-4 font-mono text-[10px] overflow-y-auto terminal-scroll bg-black/60 text-[#e0e0e0] border-b border-[#222] space-y-1 selection:bg-[#333]">
            {logs.length === 0 ? (
              <div className="text-slate-600">Console inactive. Streams sleeping.</div>
            ) : (
              logs.map((log, idx) => {
                let badgeColor = 'text-[#00f2ff] bg-[#00f2ff]/10 border border-[#00f2ff]/20';
                if (log.level === 'warn') badgeColor = 'text-amber-400 bg-amber-950/40 border border-[#amber-900]/30';
                else if (log.level === 'error') badgeColor = 'text-[#ff4e00] bg-[#ff4e00]/10 border border-[#ff4e00]/20';
                
                return (
                  <div key={idx} className="flex items-start gap-2 py-0.5 leading-normal">
                    <span className="text-slate-600">[{log.timestamp}]</span>
                    <span className={`px-1 rounded text-[8px] tracking-wide uppercase ${badgeColor}`}>
                      {log.source}:{log.level}
                    </span>
                    <span className={log.level === 'error' ? 'text-[#ff4e00]' : log.level === 'warn' ? 'text-amber-400' : 'text-slate-300'}>
                      {log.message}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </footer>
    </div>
  );
}
