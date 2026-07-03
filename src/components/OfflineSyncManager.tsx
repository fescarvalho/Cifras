"use client";

import { useEffect, useState, createContext, useContext, ReactNode, useRef } from "react";
import { db, LocalSong, LocalSetlist, SyncOperation } from "@/lib/db-local";
import { createSetlist, addSongToSetlist, removeSongFromSetlist, updateSetlistOrder, deleteSetlist, createSong } from "@/app/actions";

interface OfflineSyncContextType {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
}

const OfflineSyncContext = createContext<OfflineSyncContextType>({
  isOnline: true,
  isSyncing: false,
  lastSyncTime: null,
});

export const useOfflineSync = () => useContext(OfflineSyncContext);

export default function OfflineSyncManager({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const hasSynced = useRef(false);

  useEffect(() => {
    if (hasSynced.current) return; // Se já rodou, trava o loop na hora
    hasSynced.current = true;

    // Initial check
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      syncData();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial sync
    if (navigator.onLine) {
      syncData();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []); // <-- OBRIGATORIAMENTE array de dependências vazio []

  const processSyncQueue = async () => {
    const queue = await db.syncQueue.orderBy('createdAt').toArray();
    if (queue.length === 0) return;

    for (const op of queue) {
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
          // Send to server
          const res = await createSetlist(op.payload.title, op.payload.date);
          if (res.success && res.setlist) {
            // Update local ID if possible (for simplicity, we might just re-sync setlists after)
          }
        } else if (op.action === 'ADD_SONG_TO_SETLIST') {
          await addSongToSetlist(op.payload.setlistId, op.payload.songId);
        } else if (op.action === 'REMOVE_SONG_FROM_SETLIST') {
          await removeSongFromSetlist(op.payload.setlistId, op.payload.songId);
        } else if (op.action === 'UPDATE_SETLIST_ORDER') {
          await updateSetlistOrder(op.payload.setlistId, op.payload.songIdsInOrder);
        } else if (op.action === 'DELETE_SETLIST') {
          await deleteSetlist(op.payload.setlistId);
        }
        
        // Remove from queue after success
        if (op.id) {
          await db.syncQueue.delete(op.id);
        }
      } catch (e) {
        console.error("Error processing sync op:", op, e);
        // Break out or continue? Better to break if dependent
        break; 
      }
    }
  };

  const syncData = async () => {
    try {
      setIsSyncing(true);
      
      // First, process any pending offline operations
      await processSyncQueue();

      // Fetch Songs
      const resSongs = await fetch("/api/songs");
      if (!resSongs.ok) throw new Error("Failed to fetch songs");
      const songs: LocalSong[] = await resSongs.json();
      
      const songsWithSyncFlag = songs.map(s => ({
        ...s,
        isSynced: true,
      }));
      await db.songs.bulkPut(songsWithSyncFlag);

      // Fetch Setlists
      const resSetlists = await fetch("/api/setlists");
      if (resSetlists.ok) {
        const setlists: LocalSetlist[] = await resSetlists.json();
        const setlistsWithSyncFlag = setlists.map(s => ({
          ...s,
          isSynced: true,
        }));
        await db.setlists.bulkPut(setlistsWithSyncFlag);
      }
      
      setLastSyncTime(new Date());
    } catch (err) {
      console.error("Error syncing data:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <OfflineSyncContext.Provider value={{ isOnline, isSyncing, lastSyncTime }}>
      {children}
    </OfflineSyncContext.Provider>
  );
}
