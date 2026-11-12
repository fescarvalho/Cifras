"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getChordShape, type ChordShape } from "@/utils/chordShapes";

const STRINGS = 6;
const FRETS = 5;
const W = 120;
const H = 140;
const PAD_X = 20;
const TOP = 28;
const STRING_GAP = (W - PAD_X * 2) / (STRINGS - 1);
const FRET_GAP = (H - TOP - 10) / FRETS;

function ChordDiagram({ shape }: { shape: ChordShape }) {
  const sx = (s: number) => PAD_X + s * STRING_GAP;
  const fy = (row: number) => TOP + row * FRET_GAP; // row boundary
  const dotY = (fret: number) => TOP + (fret - shape.baseFret + 0.5) * FRET_GAP;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Diagrama do acorde ${shape.name}`}>
      {/* Nut / base fret label */}
      {shape.baseFret === 1 ? (
        <rect x={PAD_X - 1} y={TOP - 3} width={W - PAD_X * 2 + 2} height={4} rx={1} fill="#e2e8f0" />
      ) : (
        <text x={4} y={dotY(shape.baseFret) + 4} fontSize={10} fill="#94a3b8" fontFamily="monospace">
          {shape.baseFret}ª
        </text>
      )}

      {/* Frets */}
      {Array.from({ length: FRETS + 1 }, (_, i) => (
        <line key={`f${i}`} x1={PAD_X} x2={W - PAD_X} y1={fy(i)} y2={fy(i)} stroke="#475569" strokeWidth={1} />
      ))}
      {/* Strings */}
      {Array.from({ length: STRINGS }, (_, i) => (
        <line key={`s${i}`} x1={sx(i)} x2={sx(i)} y1={TOP} y2={fy(FRETS)} stroke="#64748b" strokeWidth={1} />
      ))}

      {/* Open / muted markers */}
      {shape.frets.map((f, s) =>
        f === 0 ? (
          <circle key={`o${s}`} cx={sx(s)} cy={TOP - 12} r={3.5} fill="none" stroke="#cbd5e1" strokeWidth={1.2} />
        ) : f < 0 ? (
          <text key={`x${s}`} x={sx(s)} y={TOP - 8} fontSize={11} textAnchor="middle" fill="#64748b" fontFamily="monospace">
            ×
          </text>
        ) : null,
      )}

      {/* Barre */}
      {shape.barre && (
        <rect
          x={sx(shape.barre.from) - 6}
          y={dotY(shape.barre.fret) - 6}
          width={sx(shape.barre.to) - sx(shape.barre.from) + 12}
          height={12}
          rx={6}
          fill="#f97316"
        />
      )}

      {/* Finger dots */}
      {shape.frets.map((f, s) => {
        if (f <= 0) return null;
        const row = f - shape.baseFret;
        if (row < 0 || row >= FRETS) return null;
        const inBarre =
          shape.barre && f === shape.barre.fret && s >= shape.barre.from && s <= shape.barre.to;
        if (inBarre) return null;
        return <circle key={`d${s}`} cx={sx(s)} cy={dotY(f)} r={6} fill="#f97316" />;
      })}
    </svg>
  );
}

interface ChordPopoverProps {
  chord: string;
  anchor: DOMRect;
  onClose: () => void;
}

const POPOVER_W = 176;
const POPOVER_H = 232;
const GAP = 10;
const MARGIN = 8;

export default function ChordPopover({ chord, anchor, onClose }: ChordPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const shape = useMemo(() => getChordShape(chord), [chord]);

  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const centerX = anchor.left + anchor.width / 2;
    const left = Math.min(Math.max(MARGIN, centerX - POPOVER_W / 2), vw - POPOVER_W - MARGIN);
    const fitsAbove = anchor.top - POPOVER_H - GAP >= MARGIN;
    const top = fitsAbove
      ? anchor.top - POPOVER_H - GAP
      : Math.min(anchor.bottom + GAP, vh - POPOVER_H - MARGIN);
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`Acorde ${chord}`}
      style={{
        position: "fixed",
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: POPOVER_W,
        zIndex: 100,
        visibility: pos ? "visible" : "hidden",
      }}
      className="rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-2xl shadow-black/40 p-3 flex flex-col items-center gap-1 text-slate-100"
    >
      <div className="w-full flex items-center justify-between">
        <span className="font-mono text-lg font-extrabold text-orange-400">{chord}</span>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-slate-400 active:bg-white/10"
          aria-label="Fechar"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {shape ? (
        <ChordDiagram shape={shape} />
      ) : (
        <p className="text-xs text-slate-400 py-10 text-center">Diagrama indisponível</p>
      )}
    </div>,
    document.body,
  );
}

