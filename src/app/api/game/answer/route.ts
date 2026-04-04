import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface AnswerRequest {
  roundId: string;
  answerText: string;
  responseTimeSeconds: number;
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

    const body: AnswerRequest = await request.json();
    const { roundId, answerText, responseTimeSeconds } = body;

    if (!roundId || !answerText) {
      return NextResponse.json(
        { error: 'ID da rodada e resposta s\u00e3o obrigat\u00f3rios' },
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

    const { data: answer, error: insertError } = await supabase
      .from('player_answers')
      .insert({
        round_id: roundId,
        player_id: user.id,
        answer_text: answerText,
        response_time_seconds: responseTimeSeconds || 0,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !answer) {
      return NextResponse.json(
        { error: 'Erro ao enviar resposta' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        id: answer.id,
        round_id: answer.round_id,
        player_id: answer.player_id,
        answer_text: answer.answer_text,
        response_time_seconds: answer.response_time_seconds,
        created_at: answer.created_at,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erro ao submeter resposta:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
