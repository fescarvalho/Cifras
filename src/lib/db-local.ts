import Dexie, { type EntityTable } from 'dexie';
import { LiturgicalPart, LiturgicalSeason } from '@/generated/prisma/client';

export interface LocalSong {
  id: string;
  title: string;
  artist: string;
  originalKey: string;
  content: string;
  part: LiturgicalPart;
  season: LiturgicalSeason | null;
  referenceUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  isSynced: boolean;
}

export interface LocalSetlistSong {
  id: string;
  setlistId: string;
  songId: string;
  order: number;
  selectedKey?: string | null;
  song: LocalSong;
}

export interface LocalSetlist {
  id: string;
  title: string;
  date: Date;
  songs: LocalSetlistSong[];
  createdAt: Date;
  updatedAt: Date;
  isSynced: boolean;
}

export type SyncAction = 'CREATE_SETLIST' | 'UPDATE_SETLIST_ORDER' | 'REMOVE_SONG_FROM_SETLIST' | 'ADD_SONG_TO_SETLIST' | 'DELETE_SETLIST' | 'CREATE_SONG' | 'UPDATE_SETLIST_SONG_KEY' | 'UPDATE_SONG_CONTENT';

export interface SyncOperation {
  id?: number; // Auto-incremented by Dexie
  action: SyncAction;
  payload: any;
  createdAt: Date;
}

const db = new Dexie('CifrasAppDB') as Dexie & {
  songs: EntityTable<LocalSong, 'id'>;
  setlists: EntityTable<LocalSetlist, 'id'>;
  syncQueue: EntityTable<SyncOperation, 'id'>;
};

// Schema declaration:
db.version(2).stores({
  songs: 'id, title, artist, part, season', // Primary key and indexed props
  setlists: 'id, date', 
  syncQueue: '++id, action, createdAt'
});

export { db };

export async function clearLocalOfflineData() {
  try {
    await db.delete();
    await db.open();
    console.log('Cache local Dexie limpo com sucesso.');
  } catch (e) {
    console.error('Erro ao limpar cache local Dexie:', e);
  }
}
