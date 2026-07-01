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

const db = new Dexie('CifrasAppDB') as Dexie & {
  songs: EntityTable<LocalSong, 'id'>;
};

// Schema declaration:
db.version(1).stores({
  songs: 'id, title, artist, part, season' // Primary key and indexed props
});

export { db };
