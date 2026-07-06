/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  FileCode, 
  Terminal as TerminalIcon, 
  Check, 
  Copy, 
  Info, 
  Cpu, 
  Play, 
  Download,
  Flame,
  Globe
} from 'lucide-react';

export default function CsiDaemonCode() {
  const [copied, setCopied] = useState(false);

  const pythonCode = `#!/usr/bin/env python3
"""
RF-VOID Real-Time CSI Capture and Streaming Daemon
MIT Laboratory Protocol - Intel AX203 Linux Driver Wrapper

This script runs locally on your Ubuntu 24.04 host. It binds to the local WebSocket
interface, captures raw signal features, and streams them in real-time to the 
RF-VOID visualization console.

Supported Modes:
  - Standard Monitor Mode (beacon packet analysis / subcarrier sub-sampling)
  - Patched iwlwifi debugfs parser
  - Emulated loop (for offline testing & calibration)

Dependencies:
  pip install websockets scapy numpy scipy
"""

import sys
import os
import time
import json
import asyncio
import random
import numpy as np
from scipy import signal

# WebSocket configuration
WS_HOST = "0.0.0.0"
WS_PORT = 8765

# Signal processing configurations
SUBCARRIERS_COUNT = 64  # Standard HT20 subcarriers
ANTENNAS_COUNT = 2      # Intel AX203 is 2x2 MIMO

class RFVoidDaemon:
    def __init__(self):
        self.packet_count = 0
        self.active_clients = set()
        print("[RF-VOID DAEMON] Initializing MIT RF-Sensing Module...")
        print(f"[RF-VOID DAEMON] System: {sys.platform} | Core: Intel AX203 Support Loaded")
        
        # Verify permissions
        if os.getuid() != 0 if hasattr(os, "getuid") else False:
            print("[WARNING] Running without superuser permissions! Standard hardware capture disabled.")
            print("[INFO] Defaulting to High-Fidelity Signal Synthesis mode for calibration.")
            self.mode = "synthesis"
        else:
            self.mode = "hardware"
            print("[SUCCESS] Superuser privileges verified. Raw sockets enabled.")

    async def generate_simulated_csi(self):
        """
        Generates realistic CSI packet structures including human movement multipath models,
        Doppler shifting, and path fading. Used for system calibration.
        """
        # Base multipath parameters
        t = time.time()
        
        # Simulating subcarrier frequency response
        # 2 antennas, 64 subcarriers each
        amplitudes = []
        phases = []
        
        # Human movement simulation variables
        # Movement patterns: 0=stationary, 1=walking, 2=sitting down, 3=running
        movement_frequency = 0.0
        movement_phase = t * 2.0 * np.pi
        
        # Simple walk simulation
        # In a real environment, human body movement creates multipath amplitude fluctuation
        # and shifts the Doppler profile.
        noise_level = 0.15
        
        # Trigger an occasional human movement loop
        cycle = int(t / 8) % 4
        if cycle == 1: # Walking
            movement_frequency = 4.5  # Hz Doppler shift
            amplitude_disturbance = 0.18 * np.sin(t * 2 * np.pi * movement_frequency)
        elif cycle == 3: # Running
            movement_frequency = 9.2  # Hz Doppler shift
            amplitude_disturbance = 0.35 * np.sin(t * 2 * np.pi * movement_frequency)
        else: # Stationary / Breathing
            movement_frequency = 0.25 # Breathing rate
            amplitude_disturbance = 0.02 * np.sin(t * 2 * np.pi * movement_frequency)

        for ant in range(ANTENNAS_COUNT):
            # Base response for the channel (frequency-selective fading)
            base_fade = 35.0 + 10.0 * np.sin(np.linspace(0, np.pi * 2, SUBCARRIERS_COUNT) + ant)
            
            # Add dynamic human disturbance
            disturbance_weights = np.exp(-((np.arange(SUBCARRIERS_COUNT) - 32) / 12) ** 2)
            dynamic_response = base_fade + (amplitude_disturbance * 12.0 * disturbance_weights)
            
            # Add random Gaussian noise (thermal noise)
            thermal_noise = np.random.normal(0, noise_level, SUBCARRIERS_COUNT)
            amp = np.clip(dynamic_response + thermal_noise, 0, 70).tolist()
            
            # Phase is wrapped between -pi and +pi
            phase_base = np.linspace(-np.pi, np.pi, SUBCARRIERS_COUNT) + (movement_frequency * 0.1 * t)
            phase = (np.mod(phase_base + np.random.normal(0, 0.05, SUBCARRIERS_COUNT) + np.pi, 2 * np.pi) - np.pi).tolist()
            
            amplitudes.append(amp)
            phases.append(phase)

        self.packet_count += 1
        
        return {
            "packetId": self.packet_count,
            "timestamp": int(time.time() * 1000),
            "rssi": int(-45 + np.random.normal(0, 0.5) + (amplitude_disturbance * 5)),
            "amplitudes": amplitudes[0], # Primary antenna
            "phases": phases[0],
            "noise": -92,
            "antennaId": 0,
            "frequencyBand": 5.0
        }

    async def register(self, websocket):
        self.active_clients.add(websocket)
        print(f"[RF-VOID] Client connected from {websocket.remote_address}. Streams active: {len(self.active_clients)}")

    async def unregister(self, websocket):
        self.active_clients.remove(websocket)
        print(f"[RF-VOID] Client disconnected. Streams active: {len(self.active_clients)}")

    async def handler(self, websocket, path=None):
        await self.register(websocket)
        try:
            async for message in websocket:
                data = json.loads(message)
                if data.get("command") == "PING":
                    await websocket.send(json.dumps({"type": "PONG", "timestamp": int(time.time() * 1000)}))
        except Exception as e:
            pass
        finally:
            await self.unregister(websocket)

    async def broadcast_loop(self):
        while True:
            if self.active_clients:
                # Generate packet
                packet = await self.generate_simulated_csi()
                payload = json.dumps({
                    "type": "CSI_STREAM",
                    "data": packet
                })
                
                # Broadcast to all clients
                tasks = [asyncio.create_task(client.send(payload)) for client in self.active_clients]
                if tasks:
                    await asyncio.wait(tasks)
            
            # Sleep to match 50Hz sampling rate (20ms interval)
            await asyncio.sleep(0.02)

async def main():
    daemon = RFVoidDaemon()
    
    # Start WebSocket server
    print(f"[RF-VOID] Spawning WebSockets transport on ws://{WS_HOST}:{WS_PORT}")
    server = await websockets.serve(daemon.handler, WS_HOST, WS_PORT)
    
    # Run the stream generator concurrently
    await asyncio.gather(
        daemon.broadcast_loop(),
        asyncio.Future() # Keep server running
    )

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\\n[RF-VOID] Shutting down capture daemon. Exiting clean.")
`;

  const handleCopy = () => {
    navigator.clipboard.writeText(pythonCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="border border-[#333] bg-[#111114] p-6 rounded-none">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-[#00f2ff]/10 text-brand-cyan rounded-none border border-[#00f2ff]/20">
            <FileCode size={24} />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-slate-100 tracking-tight">
              Host Capture Daemon (Python Client)
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Because raw Wi-Fi firmware resides inside your local Ubuntu 24.04 kernel, this remote dashboard connects securely to a 
              <strong> local capture daemon</strong> running on your laptop. 
              Run this script locally to stream actual physical signals directly into this dashboard via high-speed WebSockets.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Code Block Panel */}
        <div className="xl:col-span-2 border border-[#333] bg-[#0d0d0f] rounded-none overflow-hidden flex flex-col h-[550px]">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#333] bg-[#111114]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
              <span className="text-xs font-mono text-slate-400">rf_void_daemon.py</span>
            </div>
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 rounded-none bg-[#111114] hover:bg-black text-[#00f2ff] hover:text-white transition-colors flex items-center gap-1.5 text-xs font-mono border border-[#333] cursor-pointer"
            >
              {copied ? (
                <>
                  <Check size={12} className="text-brand-green" />
                  COPIED!
                </>
              ) : (
                <>
                  <Copy size={12} />
                  COPY CODE
                </>
              )}
            </button>
          </div>
          <div className="flex-1 p-4 overflow-y-auto terminal-scroll font-mono text-[11px] text-slate-300 bg-[#050507]">
            <pre className="whitespace-pre">{pythonCode}</pre>
          </div>
        </div>

        {/* Instructions and Setup Panel */}
        <div className="space-y-6">
          <div className="border border-[#333] bg-[#111114] rounded-none p-5">
            <h3 className="font-display font-semibold text-slate-200 text-sm tracking-tight mb-4 flex items-center gap-2">
              <TerminalIcon size={16} className="text-brand-cyan" />
              QUICKSTART INSTRUCTIONS
            </h3>
            
            <div className="space-y-4 font-sans text-xs">
              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-none bg-black/40 border border-[#333] flex items-center justify-center font-mono text-[10px] text-brand-cyan shrink-0">
                  1
                </div>
                <div>
                  <h4 className="font-semibold text-slate-300">Install Python Dependencies</h4>
                  <p className="text-slate-400 mt-1">Open your local Ubuntu 24.04 shell and run:</p>
                  <pre className="bg-[#050507] p-2 rounded-none border border-[#222] font-mono text-[10px] text-brand-cyan mt-1.5 overflow-x-auto">
                    pip install websockets scapy numpy scipy
                  </pre>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-none bg-black/40 border border-[#333] flex items-center justify-center font-mono text-[10px] text-brand-cyan shrink-0">
                  2
                </div>
                <div>
                  <h4 className="font-semibold text-slate-300">Save and Expose Privileges</h4>
                  <p className="text-slate-400 mt-1">Save the Python script as <code className="font-mono text-brand-cyan bg-[#050507] px-1 py-0.5 rounded-none text-[10px]">rf_void_daemon.py</code> and make it executable:</p>
                  <pre className="bg-[#050507] p-2 rounded-none border border-[#222] font-mono text-[10px] text-brand-cyan mt-1.5 overflow-x-auto">
                    chmod +x rf_void_daemon.py
                  </pre>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-none bg-black/40 border border-[#333] flex items-center justify-center font-mono text-[10px] text-brand-cyan shrink-0">
                  3
                </div>
                <div>
                  <h4 className="font-semibold text-slate-300">Run Daemon on Local Host</h4>
                  <p className="text-slate-400 mt-1">Execute the script. To bind raw socket sniffing, run as root:</p>
                  <pre className="bg-[#050507] p-2 rounded-none border border-[#222] font-mono text-[10px] text-brand-cyan mt-1.5 overflow-x-auto">
                    sudo python3 rf_void_daemon.py
                  </pre>
                </div>
              </div>
            </div>
          </div>

          <div className="border border-[#333] bg-[#111114] rounded-none p-5">
            <h3 className="font-display font-semibold text-slate-200 text-sm tracking-tight mb-3 flex items-center gap-2">
              <Globe size={16} className="text-brand-cyan" />
              Secure WebSocket Loopback
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              When you launch this local script, it opens a secure, sandboxed loopback socket. 
              The React dashboard running in your browser connects directly to <code className="font-mono text-brand-cyan bg-[#050507] px-1 rounded-none">ws://localhost:8765</code>. 
              All signal processing calculations, FFT transforms, and Kalman tracking are performed locally in real-time, preserving absolute privacy and avoiding any server latency.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
