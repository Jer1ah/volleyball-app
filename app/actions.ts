/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'
import { prisma } from "../lib/prisma";
import { revalidatePath } from "next/cache";

export async function deleteMatchAction(matchId: number) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { participants: true },
  });

  if (!match) return;

  const shift = match.eloShift;
  const teamAWon = match.scoreA > match.scoreB;

  await prisma.$transaction(async (tx) => {
    for (const participant of match.participants) {
      const isTeamA = participant.team === 'A';
      // Fix: base reversal on whether they WON, not which team they were on
      const wasWinner = (isTeamA && teamAWon) || (!isTeamA && !teamAWon);

      // Winners gained +shift, so subtract. Losers lost -shift, so add back.
      const eloAdjustment = wasWinner ? -shift : shift;

      await tx.player.update({
        where: { id: participant.playerId },
        data: {
          wins: wasWinner ? { decrement: 1 } : undefined,
          losses: wasWinner ? undefined : { decrement: 1 },
          elo: { increment: eloAdjustment }
        },
      });
    }

    await tx.match.delete({ where: { id: matchId } });
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

  // Fetch matches from the last 7 days specifically for the delta calculation
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const recentMatches = await prisma.match.findMany({
    where: {
      matchDate: { gte: oneWeekAgo }
    },
    include: {
      participants: true
    }
  });
  
  return { players, matches, recentMatches };
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
export async function submitMatch(matchData: any, updatedPlayers: any[], eloShift: number) {
  // Wrap everything in a single transaction so partial failures can't corrupt data
  await prisma.$transaction(async (tx) => {
    await tx.match.create({
      data: {
        scoreA: matchData.scoreA,
        scoreB: matchData.scoreB,
        matchType: matchData.type,
        eloShift: eloShift,
        participants: {
          create: matchData.participants.map((p: any) => ({
            playerId: p.id,
            team: p.team
          }))
        }
      }
    });

    for (const p of updatedPlayers) {
      await tx.player.update({
        where: { id: p.id },
        data: {
          elo: p.elo,
          wins: p.wins,
          losses: p.losses
        }
      });
    }
  });

  revalidatePath('/');
}