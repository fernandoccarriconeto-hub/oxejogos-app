import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  POINTS_CORRECT_ANSWER,
  POINTS_RECEIVED_VOTE,
} from '@/types/game';

interface CalculateScoresRequest {
  roundId: string;
}

interface PlayerScore {
  playerId: string;
  playerName: string;
  pointsCorrectAnswer: number;
  pointsReceivedVotes: number;
  votersWhoVotedForMe: string[]; // names of players who voted for this player
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Usuário não autenticado' },
        { status: 401 }
      );
    }

    const body: CalculateScoresRequest = await request.json();
    const { roundId } = body;

    if (!roundId) {
      return NextResponse.json(
        { error: 'ID da rodada é obrigatório' },
        { status: 400 }
      );
    }

    // Get round and game session info
    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .select('*, game_sessions(*)')
      .eq('id', roundId)
      .single();

    if (roundError || !round) {
      return NextResponse.json(
        { error: 'Rodada não encontrada' },
        { status: 404 }
      );
    }

    const gameSession = round.game_sessions;

    // Check if scores already calculated for this round (prevent duplicates)
    const { data: existingScores } = await supabase
      .from('round_scores')
      .select('id')
      .eq('round_id', roundId)
      .limit(1);

    if (existingScores && existingScores.length > 0) {
      // Scores already exist - return them without recalculating
      const { data: allScores } = await supabase
        .from('round_scores')
        .select('*')
        .eq('round_id', roundId);

      const { data: gamePlayers } = await supabase
        .from('game_players')
        .select('*')
        .eq('game_session_id', gameSession.id);

      const winner = gamePlayers?.find((p: any) => p.board_position >= gameSession.board_size);

      return NextResponse.json(
        {
          roundId,
          scores: allScores?.map((s: any) => ({
            playerId: s.player_id,
            pointsCorrectAnswer: s.points_correct_answer,
            pointsReceivedVotes: s.points_received_votes,
            pointsAiCreativeBonus: s.points_ai_creative_bonus,
            pointsAiCreativePenalty: s.points_ai_creative_penalty,
            totalRoundPoints: s.total_round_points,
            breakdown: s.breakdown || null,
          })) || [],
          winner: winner?.player_id || null,
          gameFinished: !!winner,
          alreadyCalculated: true,
        },
        { status: 200 }
      );
    }

    // Get all answers for this round
    const { data: answers, error: answersError } = await supabase
      .from('player_answers')
      .select('*')
      .eq('round_id', roundId);

    if (answersError) {
      console.error('Erro ao obter respostas:', answersError);
      return NextResponse.json(
        { error: 'Erro ao calcular pontuações' },
        { status: 500 }
      );
    }

    // Get all votes for this round
    const { data: votes, error: votesError } = await supabase
      .from('votes')
      .select('*')
      .eq('round_id', roundId);

    if (votesError) {
      console.error('Erro ao obter votos:', votesError);
      return NextResponse.json(
        { error: 'Erro ao calcular pontuações' },
        { status: 500 }
      );
    }

    // Get all players with profiles for name lookup
    const { data: gamePlayers } = await supabase
      .from('game_players')
      .select('*')
      .eq('game_session_id', gameSession.id);

    const playerIds = gamePlayers?.map((p) => p.player_id) || [];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', playerIds);

    const profileMap = new Map(profiles?.map((p) => [p.id, p.full_name]) || []);
    const getPlayerName = (id: string) => profileMap.get(id) || 'Jogador';

    // Calculate scores for each player
    const playerScores: Map<string, PlayerScore> = new Map();

    // Initialize all players with 0 scores
    if (answers) {
      answers.forEach((answer) => {
        if (!playerScores.has(answer.player_id)) {
          playerScores.set(answer.player_id, {
            playerId: answer.player_id,
            playerName: getPlayerName(answer.player_id),
            pointsCorrectAnswer: 0,
            pointsReceivedVotes: 0,
            votersWhoVotedForMe: [],
          });
        }
      });
    }

    if (votes) {
      votes.forEach((vote) => {
        if (!playerScores.has(vote.voter_id)) {
          playerScores.set(vote.voter_id, {
            playerId: vote.voter_id,
            playerName: getPlayerName(vote.voter_id),
            pointsCorrectAnswer: 0,
            pointsReceivedVotes: 0,
            votersWhoVotedForMe: [],
          });
        }
      });
    }

    // Award points for voting for correct AI answer (+2 pts)
    if (votes) {
      votes.forEach((vote) => {
        if (vote.voted_ai_correct) {
          const score = playerScores.get(vote.voter_id);
          if (score) {
            score.pointsCorrectAnswer += POINTS_CORRECT_ANSWER;
            playerScores.set(vote.voter_id, score);
          }
        }
      });
    }

    // Award points for votes received (+2 pts per vote) and track who voted
    if (votes && answers) {
      // Map answer_id -> player_id (answer owner)
      const answerOwnerMap = new Map<string, string>();
      answers.forEach((a) => answerOwnerMap.set(a.id, a.player_id));

      votes.forEach((vote) => {
        if (vote.voted_answer_id) {
          const answerOwnerId = answerOwnerMap.get(vote.voted_answer_id);
          if (answerOwnerId) {
            const score = playerScores.get(answerOwnerId);
            if (score) {
              score.pointsReceivedVotes += POINTS_RECEIVED_VOTE;
              score.votersWhoVotedForMe.push(getPlayerName(vote.voter_id));
              playerScores.set(answerOwnerId, score);
            }
          }
        }
      });
    }

    // Insert round scores and collect for database
    const roundScoresToInsert: any[] = [];
    const gamePlayersToUpdate: any[] = [];
    const scoreBreakdowns: any[] = [];

    playerScores.forEach((score) => {
      const totalRoundPoints =
        score.pointsCorrectAnswer +
        score.pointsReceivedVotes;

      // Build breakdown description
      const parts: string[] = [];
      if (score.pointsCorrectAnswer > 0) {
        parts.push(`+${score.pointsCorrectAnswer} acerto`);
      }
      if (score.pointsReceivedVotes > 0) {
        const voterNames = score.votersWhoVotedForMe.join(', ');
        const voteCount = score.votersWhoVotedForMe.length;
        parts.push(`+${score.pointsReceivedVotes} voto${voteCount > 1 ? 's' : ''} (${voterNames})`);
      }
      const breakdown = parts.length > 0 ? parts.join(' ') : 'Nenhum ponto';

      roundScoresToInsert.push({
        round_id: roundId,
        player_id: score.playerId,
        points_correct_answer: score.pointsCorrectAnswer,
        points_received_votes: score.pointsReceivedVotes,
        points_ai_creative_bonus: 0,
        points_ai_creative_penalty: 0,
        total_round_points: totalRoundPoints,
        houses_moved: totalRoundPoints,
      });

      scoreBreakdowns.push({
        playerId: score.playerId,
        playerName: score.playerName,
        pointsCorrectAnswer: score.pointsCorrectAnswer,
        pointsReceivedVotes: score.pointsReceivedVotes,
        votersWhoVotedForMe: score.votersWhoVotedForMe,
        totalRoundPoints,
        breakdown,
      });

      gamePlayersToUpdate.push({
        playerId: score.playerId,
        housesMove: totalRoundPoints,
      });
    });

    // Insert round scores
    if (roundScoresToInsert.length > 0) {
      const { error: scoreError } = await supabase
        .from('round_scores')
        .insert(roundScoresToInsert);

      if (scoreError) {
        console.error('Erro ao inserir pontuações da rodada:', scoreError);
        return NextResponse.json(
          { error: 'Erro ao salvar pontuações' },
          { status: 500 }
        );
      }
    }

    // Update game players board position
    for (const playerUpdate of gamePlayersToUpdate) {
      const { data: gamePlayer, error: fetchError } = await supabase
        .from('game_players')
        .select('*')
        .eq('game_session_id', gameSession.id)
        .eq('player_id', playerUpdate.playerId)
        .single();

      if (fetchError) {
        console.error('Erro ao buscar jogador:', fetchError);
        continue;
      }

      const newPosition = gamePlayer.board_position + playerUpdate.housesMove;
      const { error: updateError } = await supabase
        .from('game_players')
        .update({
          board_position: newPosition,
          total_score: gamePlayer.total_score + playerUpdate.housesMove,
        })
        .eq('id', gamePlayer.id);

      if (updateError) {
        console.error('Erro ao atualizar posição do jogador:', updateError);
      }
    }

    // Check for winner
    let winner = null;
    for (const playerUpdate of gamePlayersToUpdate) {
      const { data: gamePlayer } = await supabase
        .from('game_players')
        .select('*')
        .eq('game_session_id', gameSession.id)
        .eq('player_id', playerUpdate.playerId)
        .single();

      if (gamePlayer && gamePlayer.board_position >= gameSession.board_size) {
        winner = gamePlayer.player_id;
        break;
      }
    }

    // If there's a winner, update game status
    if (winner) {
      await supabase
        .from('game_sessions')
        .update({
          status: 'finished',
          finished_at: new Date().toISOString(),
        })
        .eq('id', gameSession.id);
    }

    return NextResponse.json(
      {
        roundId,
        scores: scoreBreakdowns,
        winner,
        gameFinished: !!winner,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erro ao calcular pontuações:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
