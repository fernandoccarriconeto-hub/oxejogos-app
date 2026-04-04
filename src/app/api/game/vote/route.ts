import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface VoteRequest {
  roundId: string;
  votedAnswerId?: string;
  votedAiCorrect: boolean;
  flaggedAsAiCreativeId?: string;
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

    const body: VoteRequest = await request.json();
    const { roundId, votedAnswerId, votedAiCorrect, flaggedAsAiCreativeId } = body;

    if (!roundId) {
      return NextResponse.json(
        { error: 'ID da rodada \u00e9 obrigat\u00f3rio' },
        { status: 400 }
      );
    }

    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .select('id')
      .eq('id', roundId)
      .single();

    if (roundError || !round) {
      return NextResponse.json(
        { error: 'Rodada n\u00e3o encontrada' },
        { status: 404 }
      );
    }

    const { data: vote, error: insertError } = await supabase
      .from('votes')
      .insert({
        round_id: roundId,
        voter_id: user.id,
        voted_answer_id: votedAnswerId || null,
        voted_ai_correct: votedAiCorrect,
        voted_ai_creative: !!flaggedAsAiCreativeId,
        flagged_as_ai_creative_id: flaggedAsAiCreativeId || null,
      })
      .select()
      .single();

    if (insertError || !vote) {
      return NextResponse.json(
        { error: 'Erro ao enviar voto' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        id: vote.id,
        round_id: vote.round_id,
        voter_id: vote.voter_id,
        voted_answer_id: vote.voted_answer_id,
        voted_ai_correct: vote.voted_ai_correct,
        voted_ai_creative: vote.voted_ai_creative,
        flagged_as_ai_creative_id: vote.flagged_as_ai_creative_id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erro ao submeter voto:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
