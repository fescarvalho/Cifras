"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export type GuitarStringNote = "E" | "A" | "D" | "G" | "B" | "e";

export interface GuitarStringInfo {
  note: GuitarStringNote;
  label: string;
  stringNumber: 6 | 5 | 4 | 3 | 2 | 1;
  frequency: number;
}

export const GUITAR_STRINGS: ReadonlyArray<GuitarStringInfo> = [
  { note: "E", label: "E2 (6ª)", stringNumber: 6, frequency: 82.41 },
  { note: "A", label: "A2 (5ª)", stringNumber: 5, frequency: 110.0 },
  { note: "D", label: "D3 (4ª)", stringNumber: 4, frequency: 146.83 },
  { note: "G", label: "G3 (3ª)", stringNumber: 3, frequency: 196.0 },
  { note: "B", label: "B3 (2ª)", stringNumber: 2, frequency: 246.94 },
  { note: "e", label: "E4 (1ª)", stringNumber: 1, frequency: 329.63 },
];

export type TunerPermissionState = "idle" | "granted" | "denied" | "error";

export interface UseGuitarTunerReturn {
  isListening: boolean;
  permissionState: TunerPermissionState;
  errorMessage: string | null;
  frequency: number | null;
  note: GuitarStringNote | null;
  stringNumber: number | null;
  targetFrequency: number | null;
  cents: number | null;
  isInTune: boolean;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Autocorrelation pitch detection (McLeod / YIN-inspired time-domain autocorrelation
 * with parabolic interpolation), optimized for acoustic/electric guitar (65Hz – 420Hz).
 */
function autoCorrelate(buffer: Float32Array, sampleRate: number): number {
  const size = buffer.length;

  // 1. Compute RMS to ignore background silence/noise
  let rms = 0;
  for (let i = 0; i < size; i++) {
    const val = buffer[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / size);
  if (rms < 0.012) return -1;

  // 2. Trim leading/trailing samples below threshold to sharpen periodicity
  let r1 = 0;
  let r2 = size - 1;
  const threshold = 0.2;
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buffer[i]) < threshold) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(buffer[size - i]) < threshold) {
      r2 = size - i;
      break;
    }
  }

  const trimmed = buffer.slice(r1, r2);
  const newSize = trimmed.length;
  if (newSize < 64) return -1;

  // Lag bounds for guitar range (~65Hz to ~420Hz)
  const minPeriod = Math.max(2, Math.floor(sampleRate / 420));
  const maxPeriod = Math.min(newSize - 1, Math.ceil(sampleRate / 65));

  const c = new Float32Array(maxPeriod + 1);
  for (let lag = minPeriod - 1; lag <= maxPeriod; lag++) {
    let sum = 0;
    const limit = newSize - lag;
    for (let j = 0; j < limit; j++) {
      sum += trimmed[j] * trimmed[j + lag];
    }
    c[lag] = sum;
  }

  // Find first dip where correlation starts rising
  let d = minPeriod;
  while (d < maxPeriod && c[d] > c[d + 1]) {
    d++;
  }

  // Find the peak after the first dip
  let maxVal = -1;
  let maxPos = -1;
  for (let i = d; i <= maxPeriod; i++) {
    if (c[i] > maxVal) {
      maxVal = c[i];
      maxPos = i;
    }
  }

  if (maxPos <= minPeriod || maxPos >= maxPeriod) return -1;

  // Parabolic interpolation for sub-sample accuracy
  const x1 = c[maxPos - 1];
  const x2 = c[maxPos];
  const x3 = c[maxPos + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const refinedLag = a !== 0 ? maxPos - b / (2 * a) : maxPos;

  const detectedFreq = sampleRate / refinedLag;
  if (detectedFreq < 65 || detectedFreq > 420) return -1;

  return detectedFreq;
}

function findClosestGuitarString(freq: number): {
  info: GuitarStringInfo;
  cents: number;
} {
  let closest = GUITAR_STRINGS[0];
  let minAbsCents = Infinity;
  let bestCents = 0;

  for (const str of GUITAR_STRINGS) {
    const cents = 1200 * Math.log2(freq / str.frequency);
    const absCents = Math.abs(cents);
    if (absCents < minAbsCents) {
      minAbsCents = absCents;
      closest = str;
      bestCents = cents;
    }
  }

  const clampedCents = Math.max(-50, Math.min(50, Math.round(bestCents)));
  return { info: closest, cents: clampedCents };
}

export function useGuitarTuner(): UseGuitarTunerReturn {
  const [isListening, setIsListening] = useState(false);
  const [permissionState, setPermissionState] = useState<TunerPermissionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<number | null>(null);
  const [note, setNote] = useState<GuitarStringNote | null>(null);
  const [stringNumber, setStringNumber] = useState<number | null>(null);
  const [targetFrequency, setTargetFrequency] = useState<number | null>(null);
  const [cents, setCents] = useState<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const smoothedFreqRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    smoothedFreqRef.current = null;
    setIsListening(false);
  }, []);

  const start = useCallback(async () => {
    stop();
    setErrorMessage(null);

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPermissionState("error");
      setErrorMessage("Seu navegador não suporta acesso ao microfone.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      });

      streamRef.current = stream;
      setPermissionState("granted");

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);
      analyserRef.current = analyser;

      const buffer = new Float32Array(analyser.fftSize);
      setIsListening(true);

      const updatePitch = () => {
        if (!analyserRef.current || !audioCtxRef.current) return;
        analyserRef.current.getFloatTimeDomainData(buffer);
        const rawFreq = autoCorrelate(buffer, audioCtxRef.current.sampleRate);

        if (rawFreq !== -1) {
          // Exponential moving average to stabilize needle jitter
          const prev = smoothedFreqRef.current;
          const smoothed =
            prev !== null && Math.abs(rawFreq - prev) < 18
              ? prev * 0.72 + rawFreq * 0.28
              : rawFreq;
          smoothedFreqRef.current = smoothed;

          const { info, cents: detectedCents } = findClosestGuitarString(smoothed);
          setFrequency(Math.round(smoothed * 10) / 10);
          setNote(info.note);
          setStringNumber(info.stringNumber);
          setTargetFrequency(info.frequency);
          setCents(detectedCents);
        }

        rafIdRef.current = requestAnimationFrame(updatePitch);
      };

      rafIdRef.current = requestAnimationFrame(updatePitch);
    } catch (err: unknown) {
      const domErr = err as { name?: string };
      if (domErr?.name === "NotAllowedError" || domErr?.name === "PermissionDeniedError") {
        setPermissionState("denied");
        setErrorMessage(
          "Acesso ao microfone negado. Libere a permissão do microfone nas configurações do navegador para usar o afinador."
        );
      } else {
        setPermissionState("error");
        setErrorMessage("Não foi possível acessar o microfone deste dispositivo.");
      }
      setIsListening(false);
    }
  }, [stop]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const isInTune = cents !== null && Math.abs(cents) <= 3;

  return {
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
  };
}

