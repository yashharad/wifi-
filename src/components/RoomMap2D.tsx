/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { 
  Compass, 
  MapPin, 
  Wifi, 
  Laptop as LaptopIcon, 
  Square, 
  Trash2, 
  Grid, 
  HelpCircle, 
  Sliders,
  AlertTriangle,
  Play
} from 'lucide-react';
import { RoomConfig, RoomWall, TrackingState } from '../types';

interface RoomMap2DProps {
  trackingState: TrackingState;
  roomConfig: RoomConfig;
  setRoomConfig: React.Dispatch<React.SetStateAction<RoomConfig>>;
}

export default function RoomMap2D({ trackingState, roomConfig, setRoomConfig }: RoomMap2DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [editorMode, setEditorMode] = useState<'view' | 'wall' | 'router' | 'receiver'>('view');
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  // Default wall presets
  const applyPreset = (presetName: 'lab' | 'office' | 'empty') => {
    let walls: RoomWall[] = [];
    if (presetName === 'lab') {
      walls = [
        { id: 'w1', x1: 1, y1: 1, x2: 1, y2: 7 }, // Left lab wall
        { id: 'w2', x1: 1, y1: 1, x2: 9, y2: 1 }, // Top wall
        { id: 'w3', x1: 9, y1: 1, x2: 9, y2: 7 }, // Right wall
        { id: 'w4', x1: 1, y1: 7, x2: 9, y2: 7 }, // Bottom wall
        { id: 'w5', x1: 4.5, y1: 1, x2: 4.5, y2: 4 }, // Lab divider table
      ];
    } else if (presetName === 'office') {
      walls = [
        { id: 'w1', x1: 0.5, y1: 0.5, x2: 9.5, y2: 0.5 },
        { id: 'w2', x1: 0.5, y1: 7.5, x2: 9.5, y2: 7.5 },
        { id: 'w3', x1: 0.5, y1: 0.5, x2: 0.5, y2: 7.5 },
        { id: 'w4', x1: 9.5, y1: 0.5, x2: 9.5, y2: 7.5 },
        { id: 'w5', x1: 3, y1: 0.5, x2: 3, y2: 4 }, // office partitions
        { id: 'w6', x1: 7, y1: 4, x2: 7, y2: 7.5 },
      ];
    }
    setRoomConfig(prev => ({ ...prev, walls }));
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    // Convert click pixel coordinates to Room meters
    const clickX = ((e.clientX - rect.left) / canvas.width) * roomConfig.width;
    const clickY = ((e.clientY - rect.top) / canvas.height) * roomConfig.height;

    if (editorMode === 'router') {
      setRoomConfig(prev => ({ ...prev, routerX: clickX, routerY: clickY }));
      setEditorMode('view');
    } else if (editorMode === 'receiver') {
      setRoomConfig(prev => ({ ...prev, receiverX: clickX, receiverY: clickY }));
      setEditorMode('view');
    } else if (editorMode === 'wall') {
      setDragStart({ x: clickX, y: clickY });
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (editorMode === 'wall' && dragStart) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const endX = ((e.clientX - rect.left) / canvas.width) * roomConfig.width;
      const endY = ((e.clientY - rect.top) / canvas.height) * roomConfig.height;

      // Add new wall (at least 0.2 meters long)
      const dist = Math.sqrt((endX - dragStart.x) ** 2 + (endY - dragStart.y) ** 2);
      if (dist > 0.2) {
        const newWall: RoomWall = {
          id: `w-${Date.now()}`,
          x1: dragStart.x,
          y1: dragStart.y,
          x2: endX,
          y2: endY,
        };
        setRoomConfig(prev => ({ ...prev, walls: [...prev.walls, newWall] }));
      }
      setDragStart(null);
    }
  };

  const clearWalls = () => {
    setRoomConfig(prev => ({ ...prev, walls: [] }));
  };

  // Redraw Map
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Scaling factors (meters to pixels)
    const scaleX = width / roomConfig.width;
    const scaleY = height / roomConfig.height;

    ctx.clearRect(0, 0, width, height);

    // 1. Grid Background
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.15)';
    ctx.lineWidth = 1;
    // vertical grid lines (every 1 meter)
    for (let x = 0; x <= roomConfig.width; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * scaleX, 0);
      ctx.lineTo(x * scaleX, height);
      ctx.stroke();
    }
    // horizontal grid lines (every 1 meter)
    for (let y = 0; y <= roomConfig.height; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * scaleY);
      ctx.lineTo(width, y * scaleY);
      ctx.stroke();
    }

    // 2. Draw Fresnel Sensitivity Ellipses (Line of Sight Ellipses)
    // First Fresnel zone is highly sensitive. Ellipse loci: d1 + d2 = d_los + lambda/2
    const tx = roomConfig.routerX * scaleX;
    const ty = roomConfig.routerY * scaleY;
    const rx = roomConfig.receiverX * scaleX;
    const ry = roomConfig.receiverY * scaleY;

    const dx = rx - tx;
    const dy = ry - ty;
    const center_x = (tx + rx) / 2;
    const center_y = (ty + ry) / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    // Draw 3 nested Fresnel Zone Ellipses to show physical sensitivity zone
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    for (let zone = 1; zone <= 3; zone++) {
      const semiMajor = (dist / 2) + (zone * 12);
      const semiMinor = Math.sqrt(semiMajor * semiMajor - (dist / 2) * (dist / 2)) || zone * 10;
      
      ctx.strokeStyle = `rgba(16, 185, 129, ${0.15 - zone * 0.04})`;
      ctx.beginPath();
      ctx.ellipse(center_x, center_y, semiMajor, semiMinor, angle, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 3. Draw Line of Sight (LoS) path
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(rx, ry);
    ctx.stroke();

    // 4. Draw Walls (Obstacles)
    ctx.strokeStyle = '#475569'; // Slate 600
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    roomConfig.walls.forEach(wall => {
      ctx.beginPath();
      ctx.moveTo(wall.x1 * scaleX, wall.y1 * scaleY);
      ctx.lineTo(wall.x2 * scaleX, wall.y2 * scaleY);
      ctx.stroke();
    });

    // 5. Draw Router (TX)
    ctx.fillStyle = '#3b82f6'; // Blue 500
    ctx.beginPath();
    ctx.arc(tx, ty, 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 2;
    ctx.stroke();

    // WiFi wave visualizer around router
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tx, ty, 18, 0, 2 * Math.PI);
    ctx.stroke();

    // 6. Draw Laptop Receiver (RX)
    ctx.fillStyle = '#10b981'; // Emerald 500
    ctx.beginPath();
    ctx.arc(rx, ry, 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#a7f3d0';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 7. Draw Target Disturbance Blob (Red tracking blob)
    if (trackingState.isMoving) {
      const blobX = trackingState.x * scaleX;
      const blobY = trackingState.y * scaleY;

      // Draw path history tail (fading tracking line)
      if (trackingState.pathHistory.length > 1) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)'; // Red 500
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        trackingState.pathHistory.forEach((pt, idx) => {
          const px = pt.x * scaleX;
          const py = pt.y * scaleY;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }

      // Draw outer heat glow
      const glowGrad = ctx.createRadialGradient(blobX, blobY, 2, blobX, blobY, 32);
      glowGrad.addColorStop(0, 'rgba(239, 68, 68, 0.65)');
      glowGrad.addColorStop(0.3, 'rgba(239, 68, 68, 0.35)');
      glowGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
      
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(blobX, blobY, 32, 0, 2 * Math.PI);
      ctx.fill();

      // Core center of the disturbance
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(blobX, blobY, 7, 0, 2 * Math.PI);
      ctx.fill();

      // Text status above blob
      ctx.fillStyle = '#fca5a5';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`${trackingState.activity.toUpperCase()} (${(trackingState.confidence * 100).toFixed(0)}%)`, blobX - 35, blobY - 14);
    }

    // Label coordinates
    ctx.fillStyle = '#93c5fd';
    ctx.font = '8px monospace';
    ctx.fillText('WiFi AP (Tx)', tx + 12, ty + 4);
    ctx.fillStyle = '#a7f3d0';
    ctx.fillText('AX203 (Rx)', rx + 12, ry + 4);

  }, [roomConfig, trackingState]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* Map Controls */}
        <div className="border border-[#333] bg-[#111114] rounded-none p-5 space-y-5 h-fit">
          <div className="flex items-center gap-2 pb-3 border-b border-[#222]">
            <Compass size={16} className="text-brand-cyan" />
            <h3 className="font-display font-semibold text-sm text-slate-200 uppercase tracking-wider">
              2D Room Calibration
            </h3>
          </div>

          {/* Wall Presets */}
          <div className="space-y-2">
            <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Default Lab Layouts</label>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => applyPreset('lab')}
                className="py-1.5 bg-black/40 hover:bg-black border border-[#333] hover:border-brand-cyan/60 text-slate-300 rounded-none text-[10px] font-mono cursor-pointer transition-all"
                id="preset-lab-btn"
              >
                Lab Preset
              </button>
              <button
                onClick={() => applyPreset('office')}
                className="py-1.5 bg-black/40 hover:bg-black border border-[#333] hover:border-brand-cyan/60 text-slate-300 rounded-none text-[10px] font-mono cursor-pointer transition-all"
                id="preset-office-btn"
              >
                Office Preset
              </button>
              <button
                onClick={() => applyPreset('empty')}
                className="py-1.5 bg-black/40 hover:bg-black border border-[#333] hover:border-brand-cyan/60 text-slate-300 rounded-none text-[10px] font-mono cursor-pointer transition-all"
                id="preset-empty-btn"
              >
                Clear Room
              </button>
            </div>
          </div>

          {/* Editor Mode */}
          <div className="space-y-2 pt-1">
            <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Interactive Placements</label>
            <div className="space-y-1">
              <button
                onClick={() => setEditorMode(editorMode === 'wall' ? 'view' : 'wall')}
                className={`w-full py-1.5 px-3 rounded-none text-[11px] font-mono text-left flex items-center justify-between border cursor-pointer transition-all ${
                  editorMode === 'wall'
                    ? 'bg-brand-orange/20 text-brand-orange border-brand-orange/40 font-bold'
                    : 'bg-black/40 hover:bg-black text-slate-300 border-[#333]'
                }`}
                id="mode-wall-btn"
              >
                <span className="flex items-center gap-1.5"><Square size={12} /> Draw Concrete Wall</span>
                <span className="text-[9px] px-1 bg-[#111114] border border-[#333] rounded-none text-slate-500">Drag Grid</span>
              </button>

              <button
                onClick={() => setEditorMode(editorMode === 'router' ? 'view' : 'router')}
                className={`w-full py-1.5 px-3 rounded-none text-[11px] font-mono text-left flex items-center justify-between border cursor-pointer transition-all ${
                  editorMode === 'router'
                    ? 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/40 font-bold'
                    : 'bg-black/40 hover:bg-black text-slate-300 border-[#333]'
                }`}
                id="mode-router-btn"
              >
                <span className="flex items-center gap-1.5"><Wifi size={12} /> Move Wi-Fi Router (Tx)</span>
                <span className="text-[9px] px-1 bg-[#111114] border border-[#333] rounded-none text-slate-500">Click Grid</span>
              </button>

              <button
                onClick={() => setEditorMode(editorMode === 'receiver' ? 'view' : 'receiver')}
                className={`w-full py-1.5 px-3 rounded-none text-[11px] font-mono text-left flex items-center justify-between border cursor-pointer transition-all ${
                  editorMode === 'receiver'
                    ? 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/40 font-bold'
                    : 'bg-black/40 hover:bg-black text-slate-300 border-[#333]'
                }`}
                id="mode-receiver-btn"
              >
                <span className="flex items-center gap-1.5"><LaptopIcon size={12} /> Move Laptop (Rx)</span>
                <span className="text-[9px] px-1 bg-[#111114] border border-[#333] rounded-none text-slate-500">Click Grid</span>
              </button>
            </div>
          </div>

          <button
            onClick={clearWalls}
            className="w-full py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-950 hover:border-red-500/40 rounded-none text-[11px] font-mono flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            id="clear-all-walls-btn"
          >
            <Trash2 size={12} />
            RESET MANUAL WALLS
          </button>

          <div className="p-3 bg-black/40 rounded-none border border-[#333] space-y-1.5">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <Compass size={10} /> Active State Estimate:
            </span>
            <div className="font-mono text-xs text-slate-300 space-y-1">
              <div className="flex justify-between">
                <span>Coordinates:</span>
                <span className="text-brand-green">
                  {trackingState.isMoving ? `X: ${trackingState.x.toFixed(1)}m, Y: ${trackingState.y.toFixed(1)}m` : 'No Target Detected'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Sensing Field:</span>
                <span className="text-slate-400">{roomConfig.width}m x {roomConfig.height}m</span>
              </div>
              <div className="flex justify-between">
                <span>Active Target:</span>
                <span className="text-slate-400">{trackingState.isMoving ? trackingState.activity.toUpperCase() : 'None'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2D Canvas Occupancy Grid */}
        <div className="xl:col-span-3 space-y-4">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400 font-semibold uppercase flex items-center gap-1.5">
              <Grid size={14} className="text-brand-green" />
              Live Multipath Sensing Field & Occupancy Map
            </span>
            <div className="flex gap-4 text-[10px] text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-cyan"></span> Router TX</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-green"></span> Laptop RX</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ff4e00]"></span> Moving Target</span>
            </div>
          </div>

          <div className="border border-[#333] bg-[#111114] rounded-none p-2 flex items-center justify-center overflow-hidden relative">
            {/* Editor mode overlay badge */}
            {editorMode !== 'view' && (
              <div className="absolute top-4 left-4 px-3 py-1 bg-brand-orange/10 border border-brand-orange/20 text-brand-orange font-mono text-[10px] rounded-none animate-pulse z-10">
                EDIT ACTIVE: {editorMode === 'wall' ? 'DRAG to draw concrete wall' : `CLICK to place Wi-Fi ${editorMode}`}
              </div>
            )}

            <canvas
              ref={canvasRef}
              width={650}
              height={450}
              onMouseDown={handleCanvasMouseDown}
              onMouseUp={handleCanvasMouseUp}
              className="w-full h-[450px] max-w-[650px] block cursor-crosshair bg-[#050507] rounded-none border border-[#222]"
            />
          </div>

          {/* Physics and estimation limitation reminder */}
          <div className="border border-[#333] bg-brand-orange/5 p-4 rounded-none flex items-start gap-3">
            <AlertTriangle size={16} className="text-brand-orange shrink-0 mt-0.5" />
            <div className="text-[11px] text-slate-400 leading-normal">
              <strong className="text-slate-300 font-sans block mb-0.5">Physical Limitations & Estimation Disclaimer:</strong>
              Under passive Wi-Fi 2x2 MIMO sensing, we do not obtain a raw camera-like coordinate. Instead, our mathematical engine computes the 
              <strong> Power Delay Profile (PDP)</strong> and <strong>Phase Difference of Arrival (PDOA)</strong> to estimate the Angle of Arrival (AoA) 
              of the signal's fast-fading component. When multiple walls block reflection channels, multipath fading increases, 
              shifting the estimated Red Blob location. We use a 2D Kalman filter to stabilize the tracking path securely.
            </div>
          </div>
        </div>

      </div>
    </motion.div>
  );
}
