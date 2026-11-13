"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import { db } from "@/lib/db-local";

export interface CanvasOverlayProps {
  /** Primary key for storing the annotation (setlistSong.id or song.id) */
  annotationKey: string;
  /** Underlying song.id for reference/fallback */
  songId: string;
  /** Optional setlistSong.id when opened inside a specific setlist */
  setlistSongId?: string | null;
  /** Whether Pencil Mode ("Modo Lápis") is currently active */
  isActive: boolean;
  /** Stroke color (defaults to neon yellow #facc15) */
  strokeColor?: string;
  /** Stroke width in CSS pixels (defaults to 2.75) */
  strokeWidth?: number;
  /** Incrementing counter to trigger clearing all annotations */
  clearSignal?: number;
  /** Callback notified whether the canvas currently has any saved/drawn strokes */
  onAnnotationStateChange?: (hasAnnotation: boolean) => void;
}

interface Point {
  x: number;
  y: number;
}

export default function CanvasOverlay({
  annotationKey,
  songId,
  setlistSongId = null,
  isActive,
  strokeColor = "#facc15", // Neon yellow highlight
  strokeWidth = 2.75,
  clearSignal = 0,
  onAnnotationStateChange,
}: CanvasOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const lastPointRef = useRef<Point | null>(null);
  const isDirtyRef = useRef<boolean>(false);
  const hasContentRef = useRef<boolean>(false);
  const snapshotDataUrlRef = useRef<string | null>(null);
  const sizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const [isLoaded, setIsLoaded] = useState(false);

  const notifyState = useCallback(
    (hasAnnotation: boolean) => {
      hasContentRef.current = hasAnnotation;
      onAnnotationStateChange?.(hasAnnotation);
    },
    [onAnnotationStateChange]
  );

  /**
   * Draws a Base64 dataURL image onto the canvas context, scaled to current CSS dimensions.
   */
  const drawDataUrlToCanvas = useCallback((dataUrl: string | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = sizeRef.current;
    ctx.clearRect(0, 0, width, height);

    if (!dataUrl) return;

    const img = new Image();
    img.onload = () => {
      const currentCanvas = canvasRef.current;
      if (!currentCanvas) return;
      const currentCtx = currentCanvas.getContext("2d");
      if (!currentCtx) return;
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      currentCtx.save();
      currentCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      currentCtx.clearRect(0, 0, sizeRef.current.width, sizeRef.current.height);
      currentCtx.drawImage(img, 0, 0, sizeRef.current.width, sizeRef.current.height);
      currentCtx.restore();
    };
    img.src = dataUrl;
  }, []);

  /**
   * Saves the current canvas bitmap (Base64) into Dexie.js.
   */
  const saveCanvasToDexie = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !isDirtyRef.current) return;

    try {
      if (!hasContentRef.current) {
        await db.annotations.delete(annotationKey);
        snapshotDataUrlRef.current = null;
        isDirtyRef.current = false;
        return;
      }

      const dataUrl = canvas.toDataURL("image/png");
      snapshotDataUrlRef.current = dataUrl;
      isDirtyRef.current = false;

      await db.annotations.put({
        id: annotationKey,
        songId,
        setlistSongId: setlistSongId || null,
        dataUrl,
        updatedAt: new Date(),
      });

      // Also mirror on LocalSong if saving directly against songId
      if (annotationKey === songId) {
        const existingSong = await db.songs.get(songId);
        if (existingSong) {
          await db.songs.update(songId, { annotationDataUrl: dataUrl });
        }
      }
    } catch (err) {
      console.error("Erro ao guardar anotação no Dexie:", err);
    }
  }, [annotationKey, songId, setlistSongId]);

  /**
   * Synchronizes the <canvas> bitmap dimensions with its parent cipher container.
   */
  const syncCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    const parent = canvas.parentElement;
    const cssWidth = Math.max(parent.scrollWidth, parent.clientWidth, 1);
    const cssHeight = Math.max(parent.scrollHeight, parent.clientHeight, 1);

    if (
      Math.abs(sizeRef.current.width - cssWidth) < 2 &&
      Math.abs(sizeRef.current.height - cssHeight) < 2
    ) {
      return;
    }

    // Capture current drawing before resizing if dirty
    if (isDirtyRef.current && hasContentRef.current && sizeRef.current.width > 0) {
      try {
        snapshotDataUrlRef.current = canvas.toDataURL("image/png");
      } catch {
        // Ignore if canvas is empty/tainted
      }
    }

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    sizeRef.current = { width: cssWidth, height: cssHeight };

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
    }

    if (snapshotDataUrlRef.current) {
      drawDataUrlToCanvas(snapshotDataUrlRef.current);
    }
  }, [drawDataUrlToCanvas, strokeColor, strokeWidth]);

  /**
   * Load saved annotation from Dexie.js when annotationKey changes.
   */
  useEffect(() => {
    let cancelled = false;
    setIsLoaded(false);
    isDirtyRef.current = false;
    snapshotDataUrlRef.current = null;

    async function loadAnnotation() {
      try {
        let record = await db.annotations.get(annotationKey);
        if (!record && setlistSongId) {
          // Fallback to song-level annotation if setlistSong has none yet
          record = await db.annotations.get(songId);
        }
        let savedDataUrl = record?.dataUrl ?? null;

        if (!savedDataUrl) {
          const localSong = await db.songs.get(songId);
          savedDataUrl = localSong?.annotationDataUrl ?? null;
        }

        if (cancelled) return;

        snapshotDataUrlRef.current = savedDataUrl;
        notifyState(Boolean(savedDataUrl));
        syncCanvasDimensions();
        drawDataUrlToCanvas(savedDataUrl);
        setIsLoaded(true);
      } catch (err) {
        console.error("Erro ao carregar anotação do Dexie:", err);
        if (!cancelled) setIsLoaded(true);
      }
    }

    loadAnnotation();

    return () => {
      cancelled = true;
      // Save any pending drawing when switching songs or unmounting
      if (isDirtyRef.current) {
        saveCanvasToDexie();
      }
    };
  }, [annotationKey, songId, setlistSongId, drawDataUrlToCanvas, notifyState, saveCanvasToDexie, syncCanvasDimensions]);

  /**
   * Observe parent container size changes (font size A+/A-, tablet rotation, layout shifts).
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    syncCanvasDimensions();

    const observer = new ResizeObserver(() => {
      syncCanvasDimensions();
    });

    observer.observe(parent);
    window.addEventListener("resize", syncCanvasDimensions);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncCanvasDimensions);
    };
  }, [syncCanvasDimensions, isLoaded]);

  /**
   * Persist automatically whenever Pencil Mode is toggled OFF.
   */
  useEffect(() => {
    if (!isActive && isDirtyRef.current) {
      saveCanvasToDexie();
    }
  }, [isActive, saveCanvasToDexie]);

  /**
   * Clear canvas and delete from Dexie when clearSignal increments.
   */
  const lastClearSignalRef = useRef<number>(clearSignal);
  useEffect(() => {
    if (clearSignal === lastClearSignalRef.current) return;
    lastClearSignalRef.current = clearSignal;

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, sizeRef.current.width, sizeRef.current.height);
      }
    }

    snapshotDataUrlRef.current = null;
    isDirtyRef.current = false;
    notifyState(false);

    (async () => {
      try {
        await db.annotations.delete(annotationKey);
        if (annotationKey === songId) {
          const existingSong = await db.songs.get(songId);
          if (existingSong) {
            await db.songs.update(songId, { annotationDataUrl: null });
          }
        }
      } catch (err) {
        console.error("Erro ao limpar anotações no Dexie:", err);
      }
    })();
  }, [clearSignal, annotationKey, songId, notifyState]);

  /**
   * Prevent native page scrolling on touch devices when Pencil Mode is active.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isActive) return;

    const preventTouchScroll = (e: TouchEvent) => {
      if (isActive) {
        e.preventDefault();
      }
    };

    canvas.addEventListener("touchstart", preventTouchScroll, { passive: false });
    canvas.addEventListener("touchmove", preventTouchScroll, { passive: false });

    return () => {
      canvas.removeEventListener("touchstart", preventTouchScroll);
      canvas.removeEventListener("touchmove", preventTouchScroll);
    };
  }, [isActive]);

  const getCoordinates = (
    clientX: number,
    clientY: number
  ): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const beginStroke = (point: Point | null) => {
    if (!isActive || !point) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
    ctx.lineWidth = strokeWidth;

    isDrawingRef.current = true;
    lastPointRef.current = point;
    isDirtyRef.current = true;
    notifyState(true);

    // Draw a subtle dot for single taps
    ctx.beginPath();
    ctx.arc(point.x, point.y, strokeWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const moveStroke = (point: Point | null) => {
    if (!isActive || !isDrawingRef.current || !point || !lastPointRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const prev = lastPointRef.current;
    const midX = (prev.x + point.x) / 2;
    const midY = (prev.y + point.y) / 2;

    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    lastPointRef.current = point;
  };

  const endStroke = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    saveCanvasToDexie();
  };

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isActive) return;
    e.stopPropagation();
    const touch = e.touches[0];
    if (!touch) return;
    beginStroke(getCoordinates(touch.clientX, touch.clientY));
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isActive || !isDrawingRef.current) return;
    e.stopPropagation();
    const touch = e.touches[0];
    if (!touch) return;
    moveStroke(getCoordinates(touch.clientX, touch.clientY));
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isActive) return;
    e.stopPropagation();
    endStroke();
  };

  // Mouse fallback handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isActive || e.button !== 0) return;
    e.stopPropagation();
    beginStroke(getCoordinates(e.clientX, e.clientY));
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isActive || !isDrawingRef.current) return;
    e.stopPropagation();
    moveStroke(getCoordinates(e.clientX, e.clientY));
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isActive) return;
    e.stopPropagation();
    endStroke();
  };

  return (
    <canvas
      ref={canvasRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className={`absolute inset-0 z-15 bg-transparent transition-opacity ${
        isActive
          ? "pointer-events-auto cursor-crosshair ring-2 ring-amber-400/50 rounded-2xl"
          : "pointer-events-none"
      }`}
      style={{
        touchAction: isActive ? "none" : "auto",
      }}
    />
  );
}

