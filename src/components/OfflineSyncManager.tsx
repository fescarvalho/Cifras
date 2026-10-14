"use client";

import { useEffect, useState, createContext, useContext, ReactNode, useRef } from "react";
import { db, LocalSong, LocalSetlist, SyncOperation } from "@/lib/db-local";
import { createSetlist, addSongToSetlist, removeSongFromSetlist, updateSetlistOrder, deleteSetlist, createSong, updateSetlistSongKey } from "@/app/actions";

interface OfflineSyncContextType {
  isOnline: boolean;
  isSyncing: boolean;
  isDownloading: boolean;
  lastSyncTime: Date | null;
  downloadOfflineData: () => Promise<void>;
}

const OfflineSyncContext = createContext<OfflineSyncContextType>({
  isOnline: true,
  isSyncing: false,
  isDownloading: false,
  lastSyncTime: null,
  downloadOfflineData: async () => {},
});

export const useOfflineSync = () => useContext(OfflineSyncContext);

export default function OfflineSyncManager({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const hasSynced = useRef(false);
  const isProcessingQueueRef = useRef(false);

  useEffect(() => {
    // Load last sync time
    const savedTime = localStorage.getItem("lastSyncedAt");
    if (savedTime) {
      setLastSyncTime(new Date(savedTime));
    }

    // Initial check
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      processSyncQueue();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
    };

    // Triggered when tab or phone awakens from background/sleep
    const handleWakeUp = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        processSyncQueue();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleWakeUp);
    window.addEventListener("focus", handleWakeUp);

    // Initial push (only pushes queue, does not download)
    if (!hasSynced.current) {
      hasSynced.current = true;
      if (navigator.onLine) {
        processSyncQueue();
      }
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleWakeUp);
      window.removeEventListener("focus", handleWakeUp);
    };
  }, []);

  const processSyncQueue = async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;
    setIsSyncing(true);

    try {
      const queue = await db.syncQueue.orderBy('createdAt').toArray();
      if (queue.length === 0) return;

      for (const op of queue) {
        let success = false;
        let attempts = 0;

        // Try up to 2 times to handle transient cold-starts from Supabase
        while (!success && attempts < 2) {
          attempts++;
          try {
            if (op.action === 'CREATE_SONG') {
              await createSong({
                title: op.payload.title,
                artist: op.payload.artist,
                originalKey: op.payload.originalKey,
                content: op.payload.content,
                part: op.payload.part,
                season: op.payload.season
              });
            } else if (op.action === 'CREATE_SETLIST') {
              await createSetlist(op.payload.title, op.payload.date);
            } else if (op.action === 'ADD_SONG_TO_SETLIST') {
              await addSongToSetlist(op.payload.setlistId, op.payload.songId);
            } else if (op.action === 'REMOVE_SONG_FROM_SETLIST') {
              await removeSongFromSetlist(op.payload.setlistId, op.payload.songId);
            } else if (op.action === 'UPDATE_SETLIST_ORDER') {
              await updateSetlistOrder(op.payload.setlistId, op.payload.songIdsInOrder);
            } else if (op.action === 'UPDATE_SETLIST_SONG_KEY') {
              await updateSetlistSongKey(op.payload.setlistId, op.payload.songId, op.payload.selectedKey);
            } else if (op.action === 'DELETE_SETLIST') {
              await deleteSetlist(op.payload.setlistId);
            }

            // Remove from queue after success
            if (op.id) {
              await db.syncQueue.delete(op.id);
            }
            success = true;
          } catch (e) {
            console.warn(`Sync operation ${op.action} attempt ${attempts} failed:`, e);
            if (attempts < 2) {
              // Wait 1 second before retrying in case Supabase is warming up
              await new Promise((r) => setTimeout(r, 1000));
            } else {
              console.error("Stopping sync queue processing due to repeated error:", op, e);
              return; // Stop queue processing on persistent error
            }
          }
        }
      }
    } finally {
      isProcessingQueueRef.current = false;
      setIsSyncing(false);
    }
  };

  const fetchWithTimeout = async (url: string, timeoutMs = 12000): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  const downloadOfflineData = async () => {
    if (!navigator.onLine) return;
    try {
      setIsDownloading(true);
      
      // Fetch Songs with timeout to avoid permanent UI freezing
      const resSongs = await fetchWithTimeout("/api/songs", 12000);
      if (!resSongs.ok) throw new Error("Failed to fetch songs");
      const songs: LocalSong[] = await resSongs.json();
      
      const songsWithSyncFlag = songs.map(s => ({
        ...s,
        isSynced: true,
      }));
      await db.songs.bulkPut(songsWithSyncFlag);

      // Fetch Setlists with timeout
      const resSetlists = await fetchWithTimeout("/api/setlists", 12000);
      if (resSetlists.ok) {
        const setlists: LocalSetlist[] = await resSetlists.json();
        const setlistsWithSyncFlag = setlists.map(s => ({
          ...s,
          isSynced: true,
        }));
        await db.setlists.bulkPut(setlistsWithSyncFlag);
      }
      
      const now = new Date();
      setLastSyncTime(now);
      localStorage.setItem("lastSyncedAt", now.toISOString());
    } catch (err) {
      console.error("Error downloading data:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <OfflineSyncContext.Provider value={{ isOnline, isSyncing, isDownloading, lastSyncTime, downloadOfflineData }}>
      {children}
    </OfflineSyncContext.Provider>
  );
}
