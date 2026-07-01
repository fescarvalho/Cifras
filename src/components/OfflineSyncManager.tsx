"use client";

import { useEffect, useState, createContext, useContext, ReactNode } from "react";
import { db, LocalSong } from "@/lib/db-local";

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

  useEffect(() => {
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
  }, []);

  const syncData = async () => {
    try {
      setIsSyncing(true);
      const res = await fetch("/api/songs");
      if (!res.ok) throw new Error("Failed to fetch songs");
      const songs: LocalSong[] = await res.json();
      
      // Mark as synced
      const songsWithSyncFlag = songs.map(s => ({
        ...s,
        isSynced: true,
      }));

      // Update Dexie
      await db.songs.bulkPut(songsWithSyncFlag);
      
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
