"use server";

import { prisma } from "@/lib/db";
import { LiturgicalPart, LiturgicalSeason } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";

export interface GetSongsFilters {
  search?: string;
  part?: LiturgicalPart | "ALL";
  season?: LiturgicalSeason | "ALL";
}

/**
 * Fetches all songs based on search and liturgical filters.
 */
export async function getSongs(filters: GetSongsFilters = {}) {
  const { search, part, season } = filters;

  const whereClause: any = {};

  if (search) {
    whereClause.OR = [
      { title: { contains: search } },
      { artist: { contains: search } },
    ];
  }

  if (part && part !== "ALL") {
    whereClause.part = part;
  }

  if (season && season !== "ALL") {
    whereClause.season = season;
  }

  try {
    return await prisma.song.findMany({
      where: whereClause,
      orderBy: { title: "asc" },
    });
  } catch (error) {
    console.error("Failed to fetch songs:", error);
    return [];
  }
}

/**
 * Fetches a single song by its ID.
 */
export async function getSongById(id: string) {
  try {
    return await prisma.song.findUnique({
      where: { id },
    });
  } catch (error) {
    console.error(`Failed to fetch song with id ${id}:`, error);
    return null;
  }
}

/**
 * Creates a new song.
 */
export async function createSong(data: {
  title: string;
  artist: string;
  originalKey: string;
  content: string;
  part: LiturgicalPart;
  season?: LiturgicalSeason | null;
}) {
  try {
    const song = await prisma.song.create({
      data: {
        title: data.title,
        artist: data.artist,
        originalKey: data.originalKey,
        content: data.content,
        part: data.part,
        season: data.season || null,
      },
    });
    revalidatePath("/");
    return { success: true, song };
  } catch (error: any) {
    console.error("Failed to create song:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetches all setlists sorted by date descending.
 */
export async function getSetlists() {
  try {
    return await prisma.setlist.findMany({
      include: {
        songs: {
          include: {
            song: true,
          },
        },
      },
      orderBy: { date: "desc" },
    });
  } catch (error) {
    console.error("Failed to fetch setlists:", error);
    return [];
  }
}

/**
 * Fetches a specific setlist with its songs ordered.
 */
export async function getSetlistWithSongs(id: string) {
  try {
    const setlist = await prisma.setlist.findUnique({
      where: { id },
      include: {
        songs: {
          include: {
            song: true,
          },
          orderBy: {
            order: "asc",
          },
        },
      },
    });
    return setlist;
  } catch (error) {
    console.error(`Failed to fetch setlist with id ${id}:`, error);
    return null;
  }
}

/**
 * Creates a new setlist.
 */
export async function createSetlist(title: string, dateStr: string) {
  try {
    const setlist = await prisma.setlist.create({
      data: {
        title,
        date: new Date(dateStr),
      },
    });
    revalidatePath("/");
    return { success: true, setlist };
  } catch (error: any) {
    console.error("Failed to create setlist:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Adds a song to a setlist.
 */
export async function addSongToSetlist(setlistId: string, songId: string) {
  try {
    // Check if relationship already exists
    const existing = await prisma.setlistSong.findUnique({
      where: {
        setlistId_songId: { setlistId, songId },
      },
    });

    if (existing) {
      return { success: true, message: "Song already in setlist" };
    }

    // Get current maximum order for this setlist
    const agg = await prisma.setlistSong.aggregate({
      where: { setlistId },
      _max: { order: true },
    });

    const nextOrder = (agg._max.order ?? 0) + 1;

    await prisma.setlistSong.create({
      data: {
        setlistId,
        songId,
        order: nextOrder,
      },
    });

    revalidatePath(`/setlist/${setlistId}`);
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("Failed to add song to setlist:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Removes a song from a setlist and re-sequences the orders.
 */
export async function removeSongFromSetlist(setlistId: string, songId: string) {
  try {
    await prisma.setlistSong.delete({
      where: {
        setlistId_songId: { setlistId, songId },
      },
    });

    // Re-sequence order values so they are consecutive (1, 2, 3, etc.)
    const remainingSongs = await prisma.setlistSong.findMany({
      where: { setlistId },
      orderBy: { order: "asc" },
    });

    for (let i = 0; i < remainingSongs.length; i++) {
      await prisma.setlistSong.update({
        where: { id: remainingSongs[i].id },
        data: { order: i + 1 },
      });
    }

    revalidatePath(`/setlist/${setlistId}`);
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("Failed to remove song from setlist:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Updates the order of songs in a setlist.
 */
export async function updateSetlistOrder(setlistId: string, songIdsInOrder: string[]) {
  try {
    // Perform updates in a transaction
    await prisma.$transaction(
      songIdsInOrder.map((songId, index) =>
        prisma.setlistSong.update({
          where: {
            setlistId_songId: { setlistId, songId },
          },
          data: {
            order: index + 1,
          },
        })
      )
    );

    revalidatePath(`/setlist/${setlistId}`);
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("Failed to update setlist order:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Deletes a setlist.
 */
export async function deleteSetlist(id: string) {
  try {
    await prisma.setlist.delete({
      where: { id },
    });
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete setlist:", error);
    return { success: false, error: error.message };
  }
}
