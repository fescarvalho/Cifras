"use client";

import React, { useEffect } from "react";
import { GUITAR_STRINGS, useGuitarTuner } from "@/hooks/useGuitarTuner";

interface GuitarTunerProps {
  onClose?: () => void;
  autoStart?: boolean;
}

export default function GuitarTuner({ onClose, autoStart = true }: GuitarTunerProps) {
  const {
    isListening,
    permissionState,
    errorMessage,
    frequency,
    note,
    stringNumber,
    targetFrequency,
    cents,
    isInTune,
    start,
    stop,
  } = useGuitarTuner();

  useEffect(() => {
    if (autoStart) {
      start();
    }
    return () => {
      stop();
    };
  }, [autoStart, start, stop]);

  const absCents = cents !== null ? Math.abs(cents) : 0;
  const isWarning = cents !== null && absCents > 3 && absCents <= 15;
  const isDanger = cents !== null && absCents > 15;

  const toneColorClass =
    cents === null
      ? "text-slate-400"
      : isInTune
      ? "text-green-500"
      : isWarning
      ? "text-amber-500"
      : "text-red-500";

  const pointerBgClass =
    cents === null
      ? "bg-slate-500"
      : isInTune
      ? "bg-green-500 shadow-[0_0_16px_rgba(34,197,94,0.85)]"
      : isWarning
      ? "bg-amber-500 shadow-[0_0_14px_rgba(245,158,11,0.75)]"
      : "bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.75)]";

  // Map cents (-50..+50) to horizontal percentage (0%..100%)
  const pointerPercent = cents !== null ? Math.max(0, Math.min(100, ((cents + 50) / 100) * 100)) : 50;

  return (
    <div className="w-full max-w-md mx-auto rounded-3xl border border-white/10 bg-slate-900/85 backdrop-blur-2xl shadow-2xl shadow-black/60 p-6 text-slate-100 flex flex-col gap-5 select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isListening
                ? "bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.9)]"
                : "bg-slate-600"
            }`}
          />
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-white">
              Afinador de Violão
            </h2>
            <p className="text-[11px] text-slate-400 font-medium">
              Padrão E A D G B e · A4 = 440Hz
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={() => {
              stop();
              onClose();
            }}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-slate-300 transition-all"
            aria-label="Fechar afinador"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Microphone Denied / Error State */}
      {(permissionState === "denied" || permissionState === "error") && (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/40 p-4 text-center flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </div>
          <p className="text-xs font-semibold text-red-200 leading-relaxed">
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={start}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-xs font-bold text-red-200 active:scale-95 transition-all"
          >
            Tentar Novamente
          </button>
        </div>
      )}

      {/* Central Detected Note Display */}
      <div className="flex flex-col items-center justify-center py-2">
        <div className="relative flex items-center justify-center">
          <div
            className={`w-28 h-28 rounded-3xl border flex flex-col items-center justify-center transition-all duration-150 ${
              cents === null
                ? "border-white/10 bg-slate-800/50"
                : isInTune
                ? "border-green-500/60 bg-green-500/10 shadow-[0_0_32px_rgba(34,197,94,0.2)]"
                : isWarning
                ? "border-amber-500/50 bg-amber-500/10"
                : "border-red-500/50 bg-red-500/10"
            }`}
          >
            <span className={`font-mono text-6xl font-black leading-none tracking-tighter ${toneColorClass}`}>
              {note ?? "—"}
            </span>
            {stringNumber && (
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                {stringNumber}ª Corda
              </span>
            )}
          </div>
        </div>

        {/* Frequency & Cents readout */}
        <div className="flex items-center gap-3 mt-3 text-xs font-mono">
          <span className="text-slate-400">
            {frequency !== null ? `${frequency.toFixed(1)} Hz` : "--- Hz"}
          </span>
          <span className="text-slate-600">|</span>
          <span className={`font-bold ${toneColorClass}`}>
            {cents !== null ? `${cents > 0 ? `+${cents}` : cents} cents` : "Toque uma corda"}
          </span>
          {targetFrequency !== null && (
            <>
              <span className="text-slate-600">|</span>
              <span className="text-slate-500">Alvo: {targetFrequency} Hz</span>
            </>
          )}
        </div>
      </div>

      {/* Horizontal Tuning Meter / Pointer */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 px-1">
          <span>−50 (Grave / Frouxa)</span>
          <span className="text-green-500">0</span>
          <span>+50 (Aguda / Apertada)</span>
        </div>

        <div className="relative h-8 w-full rounded-2xl bg-slate-950/90 border border-white/10 overflow-hidden flex items-center px-3">
          {/* Center green tolerance zone (±3 cents) */}
          <div className="absolute left-1/2 -translate-x-1/2 h-full w-4 bg-green-500/15 border-x border-green-500/40" />

          {/* Tick marks */}
          <div className="w-full flex items-center justify-between opacity-30 pointer-events-none">
            {Array.from({ length: 11 }, (_, i) => (
              <div
                key={i}
                className={`w-0.5 rounded-full ${
                  i === 5 ? "h-5 bg-green-400" : i % 2 === 0 ? "h-3 bg-slate-400" : "h-2 bg-slate-600"
                }`}
              />
            ))}
          </div>

          {/* Moving Needle / Pointer */}
          <div
            className="absolute top-1 bottom-1 -translate-x-1/2 transition-all duration-100 ease-out flex items-center justify-center"
            style={{ left: `${pointerPercent}%` }}
          >
            <div className={`w-2.5 h-6 rounded-full transition-colors ${pointerBgClass}`} />
          </div>
        </div>

        {/* Tuning Peg Direction Guidance */}
        <div className="min-h-[36px] flex items-center justify-center">
          {cents === null ? (
            <span className="text-xs font-medium text-slate-400">
              Aproxime o violão e toque uma corda solta
            </span>
          ) : isInTune ? (
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-green-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span>Afinação Exata!</span>
            </div>
          ) : cents < 0 ? (
            <div className={`flex items-center gap-1.5 text-xs font-bold ${isDanger ? "text-red-500" : "text-amber-500"}`}>
              <span>Corda frouxa (Grave) — Aperte a tarraxa</span>
              <svg className="w-4 h-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          ) : (
            <div className={`flex items-center gap-1.5 text-xs font-bold ${isDanger ? "text-red-500" : "text-amber-500"}`}>
              <svg className="w-4 h-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
              </svg>
              <span>Corda apertada (Aguda) — Afrouxe a tarraxa</span>
            </div>
          )}
        </div>
      </div>

      {/* Reference Strings Bar */}
      <div className="grid grid-cols-6 gap-1.5 pt-1">
        {GUITAR_STRINGS.map((str) => {
          const active = note === str.note;
          return (
            <div
              key={str.stringNumber}
              className={`flex flex-col items-center justify-center py-2 rounded-xl border text-center transition-all ${
                active
                  ? isInTune
                    ? "border-green-500 bg-green-500/15 text-green-400 font-extrabold"
                    : "border-amber-500/70 bg-amber-500/15 text-amber-300 font-extrabold"
                  : "border-white/10 bg-white/5 text-slate-400"
              }`}
            >
              <span className="font-mono text-sm font-bold">{str.note}</span>
              <span className="text-[9px] opacity-75">{str.stringNumber}ª</span>
            </div>
          );
        })}
      </div>

      {/* Start / Stop Toggle Button */}
      <button
        type="button"
        onClick={isListening ? stop : start}
        className={`min-h-[44px] w-full rounded-2xl font-bold text-xs uppercase tracking-wider transition-all active:scale-98 flex items-center justify-center gap-2 ${
          isListening
            ? "bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10"
            : "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30"
        }`}
      >
        {isListening ? "Pausar Microfone" : "Ativar Microfone"}
      </button>
    </div>
  );
}

