import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@db";
import { chunkValues, insertManyIgnore, insertStatsIgnoreBatch, type StatInsertRow } from "@db/insert";
import { games, players, seasons, stats, teams, teamsGames, teamsPlayers } from "@db/schema";
import { BadRequestError, NotFoundError } from "../errors";
import type { RecordsJobMessage } from "../../queue";
import { assembleSheetImportPreview, buildSheetImportPreview, assertPreviewCommitable } from "./preview";
import type { FetchImpl } from "./fetch";
import { importKeyFromStoredGame } from "./keys";
import { normalizeName } from "./names";
import type { SheetImportCommitResult, SheetImportInput, SheetImportPreview } from "./types";
import type { SheetRegion } from "./types";

interface StoredGameTeams {
  region: SheetRegion;
  phase: string;
  round: string;
  date: string;
  team1Score: number | null;
  team2Score: number | null;
  team1Name?: string;
  team2Name?: string;
}

async function loadExistingGameIdByKey(db: Db, seasonId: number): Promise<Map<string, number>> {
  const rows = await db
    .select({
      gameId: games.id,
      region: games.region,
      phase: games.phase,
      round: games.round,
      date: games.date,
      team1Score: games.team1Score,
      team2Score: games.team2Score,
      slot: teamsGames.slot,
      teamName: teams.name,
    })
    .from(games)
    .innerJoin(teamsGames, eq(teamsGames.gameId, games.id))
    .innerJoin(teams, eq(teams.id, teamsGames.teamId))
    .where(eq(games.seasonId, seasonId));

  const grouped = new Map<number, StoredGameTeams>();
  for (const row of rows) {
    let entry = grouped.get(row.gameId);
    if (!entry) {
      entry = {
        region: row.region as SheetRegion,
        phase: row.phase,
        round: row.round ?? "",
        date: row.date,
        team1Score: row.team1Score,
        team2Score: row.team2Score,
      };
      grouped.set(row.gameId, entry);
    }
    if (row.slot === 1) entry.team1Name = row.teamName;
    if (row.slot === 2) entry.team2Name = row.teamName;
  }

  const byKey = new Map<string, number>();
  for (const [gameId, entry] of grouped) {
    if (!entry.team1Name || !entry.team2Name) continue;
    const key = importKeyFromStoredGame({
      region: entry.region,
      phase: entry.phase,
      round: entry.round,
      date: entry.date,
      team1Name: entry.team1Name,
      team2Name: entry.team2Name,
      team1Score: entry.team1Score,
      team2Score: entry.team2Score,
    });
    byKey.set(key, gameId);
  }
  return byKey;
}

async function resolvePlayerIds(
  db: Db,
  names: string[],
): Promise<{ ids: Map<string, number>; created: number }> {
  const lowered = [...new Set(names.map((name) => name.toLowerCase()))];
  const ids = new Map<string, number>();
  if (lowered.length === 0) return { ids, created: 0 };

  for (const chunk of chunkValues(lowered)) {
    const rows = await db.select().from(players).where(inArray(players.name, chunk));
    for (const row of rows) ids.set(row.name, row.id);
  }

  const missing = lowered.filter((name) => !ids.has(name));
  if (missing.length > 0) {
    await insertManyIgnore(
      db,
      players,
      missing.map((name) => ({ name, position: "N/A" as const })),
    );
    for (const chunk of chunkValues(missing)) {
      const rows = await db.select().from(players).where(inArray(players.name, chunk));
      for (const row of rows) ids.set(row.name, row.id);
    }
  }

  return { ids, created: missing.length };
}

function applyPreviewExcludes(
  preview: SheetImportPreview,
  input: SheetImportInput,
): SheetImportPreview {
  const excludeTeams = new Set(input.excludeTeamKeys?.map((key) => key.toLowerCase()) ?? []);
  const excludeGames = new Set(input.excludeGameKeys?.map((key) => key.toLowerCase()) ?? []);
  if (excludeTeams.size === 0 && excludeGames.size === 0) return preview;

  const teams = preview.teams.map((team) => ({
    ...team,
    included: team.included && !excludeTeams.has(team.key.toLowerCase()),
  }));
  const games = preview.games.map((game) => ({
    ...game,
    included: game.included && !excludeGames.has(game.key.toLowerCase()),
  }));
  const activeGameKeys = new Set(games.filter((game) => game.included).map((game) => game.key));
  const stats = preview.stats.filter((stat) => activeGameKeys.has(stat.gameKey));

  return { ...preview, teams, games, stats };
}

export async function commitSheetImport(
  db: Db,
  input: SheetImportInput,
  options: {
    fetchImpl?: FetchImpl;
    queue?: Queue<RecordsJobMessage> | null;
    requestedBy?: string | null;
    d1?: D1Database;
  } = {},
): Promise<SheetImportCommitResult> {
  const preview = input.preview
    ? applyPreviewExcludes(input.preview, input)
    : input.sources
      ? await assembleSheetImportPreview(db, input, input.sources)
      : await buildSheetImportPreview(db, input, options.fetchImpl ?? fetch);
  assertPreviewCommitable(preview);

  const includePlayers =
    input.mode === "full" || input.mode === "teams_and_players" || input.mode === "players";
  const includeTeams =
    input.mode === "full" || input.mode === "teams" || input.mode === "teams_and_players";
  const includeGames = input.mode === "full";
  const includeStats = input.mode === "full";

  let seasonId = input.seasonId ?? preview.seasonId;
  let seasonNumber = preview.seasonNumber ?? input.seasonNumber ?? 0;

  if (input.mode === "full") {
    if (input.seasonNumber == null || !input.startDate) {
      throw new BadRequestError("Season number and start date are required");
    }
    const existing = await db.query.seasons.findFirst({
      where: eq(seasons.seasonNumber, input.seasonNumber),
    });
    if (existing) {
      seasonId = existing.id;
      seasonNumber = existing.seasonNumber;
    } else {
      const [created] = await db
        .insert(seasons)
        .values({
          seasonNumber: input.seasonNumber,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          theme: input.theme ?? null,
        })
        .returning();
      if (!created) throw new BadRequestError("Could not create season");
      seasonId = created.id;
      seasonNumber = created.seasonNumber;
    }
  } else {
    if (seasonId == null) throw new BadRequestError("Season is required");
    const season = await db.query.seasons.findFirst({ where: eq(seasons.id, seasonId) });
    if (!season) throw new NotFoundError(`Season ${seasonId}`);
    seasonNumber = season.seasonNumber;
  }

  if (seasonId == null) throw new BadRequestError("Season is required");

  let teamsCreated = 0;
  let playersCreated = 0;
  let playersAttached = 0;
  let gamesCreated = 0;
  let statsCreated = 0;

  const teamIdByName = new Map<string, number>();

  // Load existing season teams for players-only / merge
  const existingTeams = await db.select().from(teams).where(eq(teams.seasonId, seasonId));
  for (const team of existingTeams) {
    teamIdByName.set(normalizeName(team.name), team.id);
  }

  const activeTeams = preview.teams.filter((team) => team.included);

  if (includeTeams) {
    const missingTeams = activeTeams.filter((team) => !teamIdByName.has(normalizeName(team.name)));
    if (missingTeams.length > 0) {
      await insertManyIgnore(
        db,
        teams,
        missingTeams.map((team) => ({
          name: team.name,
          seasonId,
          placement: "Didnt make playoffs",
        })),
      );
      teamsCreated = missingTeams.length;
      for (const chunk of chunkValues(missingTeams.map((team) => team.name))) {
        const rows = await db
          .select()
          .from(teams)
          .where(and(eq(teams.seasonId, seasonId), inArray(teams.name, chunk)));
        for (const row of rows) teamIdByName.set(normalizeName(row.name), row.id);
      }
    }
  }

  if (includePlayers) {
    const allPlayerNames = activeTeams.flatMap((team) => {
      const names = [...team.playerNames];
      if (team.leadership) {
        for (const role of ["C", "VC", "CC"] as const) {
          const captain = team.leadership[role];
          if (captain && !names.some((name) => normalizeName(name) === normalizeName(captain))) {
            names.unshift(captain);
          }
        }
      }
      return names;
    });
    const { ids: playerIdsByName, created: bulkPlayersCreated } = await resolvePlayerIds(
      db,
      allPlayerNames,
    );
    playersCreated += bulkPlayersCreated;

    for (const team of activeTeams) {
      const teamId = teamIdByName.get(normalizeName(team.name));
      if (!teamId) {
        if (input.mode === "players") {
          preview.warnings.push(`Skipped players for missing team "${team.name}"`);
          continue;
        }
        throw new BadRequestError(`Team "${team.name}" was not created`);
      }

      const roleByPlayer = new Map<string, "C" | "VC" | "CC">();
      if (team.leadership) {
        for (const role of ["C", "VC", "CC"] as const) {
          const captain = team.leadership[role];
          if (!captain) continue;
          roleByPlayer.set(normalizeName(captain), role);
        }
      }

      const rosterLinks: { teamId: number; playerId: number }[] = [];
      for (const playerName of team.playerNames) {
        const playerId = playerIdsByName.get(playerName.toLowerCase());
        if (!playerId) {
          throw new BadRequestError(`Could not resolve player "${playerName}"`);
        }
        rosterLinks.push({ teamId, playerId });
      }
      if (team.leadership) {
        for (const role of ["C", "VC", "CC"] as const) {
          const captain = team.leadership[role];
          if (!captain) continue;
          const playerId = playerIdsByName.get(captain.toLowerCase());
          if (playerId) rosterLinks.push({ teamId, playerId });
        }
      }
      await insertManyIgnore(db, teamsPlayers, rosterLinks);
      playersAttached += rosterLinks.length;

      // Assign leadership after the roster is linked so unique role slots stay consistent.
      if (roleByPlayer.size > 0) {
        await db
          .update(teamsPlayers)
          .set({ role: sql`NULL` })
          .where(and(eq(teamsPlayers.teamId, teamId), sql`${teamsPlayers.role} is not null`));
        const seat = await db
          .select({ playerId: teamsPlayers.playerId, name: players.name })
          .from(teamsPlayers)
          .innerJoin(players, eq(teamsPlayers.playerId, players.id))
          .where(eq(teamsPlayers.teamId, teamId));
        for (const [playerKey, role] of roleByPlayer) {
          const match = seat.find((row) => normalizeName(row.name) === playerKey);
          if (!match) {
            preview.warnings.push(
              `Could not assign ${role} on "${team.name}" — player "${playerKey}" missing from roster`,
            );
            continue;
          }
          await db
            .update(teamsPlayers)
            .set({ role })
            .where(and(eq(teamsPlayers.teamId, teamId), eq(teamsPlayers.playerId, match.playerId)));
        }
      } else if (team.playerNames.length > 0) {
        preview.warnings.push(
          `No captaincy (C/VC/CC) found for "${team.name}" — check the master TEAMS header row`,
        );
      }
    }
  }

  const gameIdByKey =
    includeGames && seasonId != null
      ? await loadExistingGameIdByKey(db, seasonId)
      : new Map<string, number>();

  if (includeGames) {
    for (const game of preview.games.filter((row) => row.included)) {
      const team1Id = teamIdByName.get(normalizeName(game.team1Name));
      const team2Id = teamIdByName.get(normalizeName(game.team2Name));
      if (!team1Id || !team2Id) {
        preview.warnings.push(
          `Skipped game ${game.team1Name} vs ${game.team2Name} (missing team ids)`,
        );
        continue;
      }

      const existingGameId = gameIdByKey.get(game.key);
      if (existingGameId != null) {
        await insertManyIgnore(db, teamsGames, [
          { gameId: existingGameId, teamId: team1Id, slot: 1 },
          { gameId: existingGameId, teamId: team2Id, slot: 2 },
        ]);
        continue;
      }

      const status = game.team1Score != null && game.team2Score != null ? "completed" : "scheduled";
      const [created] = await db
        .insert(games)
        .values({
          name: `${game.team1Name} Vs. ${game.team2Name}`,
          matchNumber: game.round,
          round: game.round,
          status,
          phase: game.phase,
          region: game.region,
          date: game.date,
          seasonId,
          team1Score: game.team1Score,
          team2Score: game.team2Score,
          set1Score: game.setScores[0] ?? null,
          set2Score: game.setScores[1] ?? null,
          set3Score: game.setScores[2] ?? null,
          set4Score: game.setScores[3] ?? null,
          set5Score: game.setScores[4] ?? null,
          stage: game.phase === "playoffs" ? game.round : "Qualifiers",
        })
        .returning();

      if (!created) continue;
      await insertManyIgnore(db, teamsGames, [
        { gameId: created.id, teamId: team1Id, slot: 1 },
        { gameId: created.id, teamId: team2Id, slot: 2 },
      ]);
      gameIdByKey.set(game.key, created.id);
      gamesCreated += 1;
    }
  }

  if (includeStats) {
    const statPlayerNames = preview.stats.map((row) => row.playerName);
    const { ids: playerCache, created: statPlayersCreated } = await resolvePlayerIds(
      db,
      statPlayerNames,
    );
    playersCreated += statPlayersCreated;

    const statRows: StatInsertRow[] = [];
    const seenStatKeys = new Set<string>();
    const rosterLinks: { teamId: number; playerId: number }[] = [];

    for (const row of preview.stats) {
      const gameId = gameIdByKey.get(row.gameKey);
      if (!gameId) continue;

      const playerId = playerCache.get(row.playerName.toLowerCase());
      if (!playerId) continue;

      const teamId = teamIdByName.get(normalizeName(row.teamName));
      if (teamId) rosterLinks.push({ teamId, playerId });

      const statKey = `${playerId}:${gameId}`;
      if (seenStatKeys.has(statKey)) continue;
      seenStatKeys.add(statKey);

      statRows.push({
        playerId,
        gameId,
        ...row.counts,
      });
    }

    if (rosterLinks.length > 0) {
      await insertManyIgnore(db, teamsPlayers, rosterLinks);
    }

    if (statRows.length > 0) {
      if (options.d1) {
        await insertStatsIgnoreBatch(options.d1, statRows);
      } else {
        await insertManyIgnore(db, stats, statRows);
      }
      statsCreated = statRows.length;
    }
  }

  if (options.queue && input.mode === "full") {
    const { enqueueRecalculation } = await import("../../queue");
    await enqueueRecalculation(db, options.queue, {
      seasonId,
      requestedBy: options.requestedBy ?? null,
    });
  }

  return {
    seasonId,
    seasonNumber,
    teamsCreated,
    playersCreated,
    playersAttached,
    gamesCreated,
    statsCreated,
    warnings: preview.warnings,
  };
}
