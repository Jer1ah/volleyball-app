/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'
import { prisma } from "../lib/prisma";
import { revalidatePath } from "next/cache";

export async function deleteMatchAction(id: number) {
  await prisma.match.delete({
    where: { id }
  });
  revalidatePath('/');
}

// 1. Fetch all Players and Matches
export async function getAppData() {
  const players = await prisma.player.findMany({
    orderBy: { elo: 'desc' },
  });
  
  const matches = await prisma.match.findMany({
    include: {
      participants: {
        include: { player: true }
      }
    },
    orderBy: { matchDate: 'desc' },
  });
  
  return { players, matches };
}

// 2. Add New Player
export async function addPlayer(name: string) {
  await prisma.player.create({
    data: { name, elo: 1000, wins: 0, losses: 0 }
  });
  revalidatePath('/');
}

// 3. Update Player Name
export async function updatePlayerName(id: number, newName: string) {
  await prisma.player.update({
    where: { id },
    data: { name: newName }
  });
  revalidatePath('/');
}

// 4. Delete Player
export async function removePlayer(id: number) {
  await prisma.player.delete({ where: { id } });
  revalidatePath('/');
}

// 5. Submit Match (Updates match table AND player stats)
export async function submitMatch(matchData: any, updatedPlayers: any[]) {
  // Create the match and the participant links
  await prisma.match.create({
    data: {
      scoreA: matchData.scoreA,
      scoreB: matchData.scoreB,
      matchType: matchData.type,
      participants: {
        create: matchData.participants.map((p: any) => ({
          playerId: p.id,
          team: p.team
        }))
      }
    }
  });

  // Update every player's ELO and Record
  for (const p of updatedPlayers) {
    await prisma.player.update({
      where: { id: p.id },
      data: {
        elo: p.elo,
        wins: p.wins,
        losses: p.losses
      }
    });
  }
  
  revalidatePath('/');
}