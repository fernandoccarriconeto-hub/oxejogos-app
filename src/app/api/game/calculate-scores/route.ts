import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  POINTS_CORRECT_ANSWER,
  POINTS_RECEIVED_VOTE,
  POINTS_AI_CREATIVE_BONUS,
  POINTS_AI_CREATIVE_PENALTY,
} from '@/types/game';

interface CalculateScoresRequest {
  roundId: string;
}

interface PlayerScore {
  playerId: string;
  pointsCorrectAnswer: number;
  pointsReceivedVotes: number;
  pointsAiCreativeBonus: number;
  pointsAiCreativePenalty: number;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Usu\u00e1rio n\u00e3o autenticado' },
        { status: 401 }
      );
    }

    const body: CalculateScoresRequest = await request.json();
    const { roundId } = body;

    if (!roundId) {
      return NextResponse.json(
        { error: 'ID da rodada \u00e9 obrigat\u00f3rio' },
        { status: 400 }
      );
    }

    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .select('*, game_sessions(*)')
      .eq('id', roundId)
      .single();

    if (roundError || !round) {
      return NextResponse.json(
        { error: 'Rodada n\u00e3o encontrada' },
        { status: 404 }
      );
    }

    const { data: answers, error: answersError } = await supabase
      .from('player_answers')
      .select('*')
      .eq('round_id', roundId);

    if (answersError) {
      return NextResponse.json(
        { error: 'Erro ao calcular pontua\u00e7\u00f5es' },
        { status: 500 }
      );
    }

    const { data: votes, error: votesError } = await supabase
      .from('votes')
      .select('*')
      .eq('round_id', roundId);

    if (votesError) {
      return NextResponse.json(
        { error: 'Erro ao calcular pontua\u00e7\u00f5es' },
        { status: 500 }
      );
    }

    const playerScores: Map<string, PlayerScore> = new Map();
    const gameSession = round.game_sessions;

    if (answers) {
      answers.forEach((answer: any) => {
        if (!playerScores.has(answer.player_id)) {
          playerScores.set(answer.player_id, {
            playerId: answer.player_id,
            pointsCorrectAnswer: 0,
            pointsReceivedVotes: 0,
            pointsAiCreativeBonus: 0,
            pointsAiCreativePenalty: 0,
          });
        }
      });
    }

    if (votes) {
      votes.forEach((vote: any) => {
        if (!playerScores.has(vote.voter_id)) {
          playerScores.set(vote.voter_id, {
            playerId: vote.voter_id,
            pointsCorrectAnswer: 0,
            pointsReceivedVotes: 0,
            pointsAiCreativeBonus: 0,
            pointsAiCreativePenalty: 0,
          });
        }
      });
    }

    if (votes) {
      votes.forEach((vote: any) => {
        if (vote.voted_ai_correct) {
          const score = playerScores.get(vote.voter_id);
          if (score) {
            score.pointsCorrectAnswer += POINTS_CORRECT_ANSWER;
            playerScores.set(vote.voter_id, score);
          }
        }
      });
    }

    if (votes && answers) {
      const voteCounts = new Map<string, number>();

      votes.forEach((vote: any) => {
        if (vote.voted_answer_id) {
          const currentCount = voteCounts.get(vote.voted_answer_id) || 0;
          voteCounts.set(vote.voted_answer_id, currentCount + 1);
        }
      });

      answers.forEach((answer: any) => {
        const voteCount = voteCounts.get(answer.id) || 0;
        if (voteCount > 0) {
          const score = playerScores.get(answer.player_id);
          if (score) {
            score.pointsReceivedVotes += voteCount * POINTS_RECEIVED_VOTE;
            playerScores.set(answer.player_id, score);
          }
        }
      });
    }

    if (votes) {
      votes.forEach((vote: any) => {
        if (vote.flagged_as_ai_creative_id) {
          if (vote.flagged_as_ai_creative_id === `ai_creative_${roundId}`) {
            const score = playerScores.get(vote.voter_id);
            if (score) {
              score.pointsAiCreativeBonus += POINTS_AI_CREATIVE_BONUS;
              playerScores.set(vote.voter_id, score);
            }
          } else {
            const score = playerScores.get(vote.voter_id);
            if (score) {
              score.pointsAiCreativePenalty += POINTS_AI_CREATIVE_PENALTY;
              playerScores.set(vote.voter_id, score);
            }
          }
        }
      });
    }

    const roundScoresToInsert: any[] = [];
    const gamePlayersToUpdate: any[] = [];

    playerScores.forEach((score) => {
      const totalRoundPoints =
        score.pointsCorrectAnswer +
        score.pointsReceivedVotes +
        score.pointsAiCreativeBonus +
        score.pointsAiCreativePenalty;

      roundScoresToInsert.push({
        round_id: roundId,
        player_id: score.playerId,
        points_correct_answer: score.pointsCorrectAnswer,
        points_received_votes: score.pointsReceivedVotes,
        points_ai_creative_bonus: score.pointsAiCreativeBonus,
        points_ai_creative_penalty: score.pointsAiCreativePenalty,
        total_round_points: totalRoundPoints,
        houses_moved: Math.max(0, totalRoundPoints),
      });

      gamePlayersToUpdate.push({
        playerId: score.playerId,
        housesMove: Math.max(0, totalRoundPoints),
      });
    });

    if (roundScoresToInsert.length > 0) {
      const { error: scoreError } = await supabase
        .from('round_scores')
        .insert(roundScoresToInsert);

      if (scoreError) {
        return NextResponse.json(
          { error: 'Erro ao salvar pontua\u00e7\u00f5es' },
          { status: 500 }
        );
      }
    }

    for (const playerUpdate of gamePlayersToUpdate) {
      const { data: gamePlayer, error: fetchError } = await supabase
        .from('game_players')
        .select('*')
        .eq('game_session_id', gameSession.id)
        .eq('player_id', playerUpdate.playerId)
        .single();

      if (fetchError) continue;

      const newPosition = gamePlayer.board_position + playerUpdate.housesMove;
      await supabase
        .from('game_players')
        .update({
          board_position: newPosition,
          total_score: gamePlayer.total_score + playerUpdate.housesMove,
        })
        .eq('id', gamePlayer.id);
    }

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
        scores: Array.from(playerScores.values()).map((score) => ({
          playerId: score.playerId,
          pointsCorrectAnswer: score.pointsCorrectAnswer,
          pointsReceivedVotes: score.pointsReceivedVotes,
          pointsAiCreativeBonus: score.pointsAiCreativeBonus,
          pointsAiCreativePenalty: score.pointsAiCreativePenalty,
          totalRoundPoints:
            score.pointsCorrectAnswer +
            score.pointsReceivedVotes +
            score.pointsAiCreativeBonus +
            score.pointsAiCreativePenalty,
        })),
        winner,
        gameFinished: !!winner,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erro ao calcular pontua\u00e7\u00f5es:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
