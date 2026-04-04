import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface StartGameRequest {
  gameSessionId: string;
  selectedThemes: string[];
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
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

    const body: StartGameRequest = await request.json();
    const { gameSessionId, selectedThemes } = body;

    if (!gameSessionId || !selectedThemes || selectedThemes.length === 0) {
      return NextResponse.json(
        { error: 'ID da sess\u00e3o e temas selecionados s\u00e3o obrigat\u00f3rios' },
        { status: 400 }
      );
    }

    const { data: gameSession, error: sessionError } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('id', gameSessionId)
      .single();

    if (sessionError || !gameSession) {
      return NextResponse.json(
        { error: 'Sess\u00e3o de jogo n\u00e3o encontrada' },
        { status: 404 }
      );
    }

    if (gameSession.captain_id !== user.id) {
      return NextResponse.json(
        { error: 'Apenas o capit\u00e3o pode iniciar o jogo' },
        { status: 403 }
      );
    }

    const { data: players, error: playersError } = await supabase
      .from('game_players')
      .select('player_id')
      .eq('game_session_id', gameSessionId);

    if (playersError || !players || players.length === 0) {
      return NextResponse.json(
        { error: 'Erro ao obter lista de jogadores' },
        { status: 500 }
      );
    }

    const playerIds = players.map((p) => p.player_id);
    const shuffledPlayerIds = shuffleArray(playerIds);

    const { error: updateError } = await supabase
      .from('game_sessions')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
        theme_picker_order: shuffledPlayerIds,
        current_theme_picker_index: 0,
      })
      .eq('id', gameSessionId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Erro ao iniciar jogo' },
        { status: 500 }
      );
    }

    const { data: updatedSession, error: fetchError } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('id', gameSessionId)
      .single();

    if (fetchError || !updatedSession) {
      return NextResponse.json(
        { error: 'Erro ao recuperar sess\u00e3o atualizada' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        id: updatedSession.id,
        invite_code: updatedSession.invite_code,
        captain_id: updatedSession.captain_id,
        game_mode: updatedSession.game_mode,
        difficulty: updatedSession.difficulty,
        board_size: updatedSession.board_size,
        status: updatedSession.status,
        current_round: updatedSession.current_round,
        max_players: updatedSession.max_players,
        theme_picker_order: updatedSession.theme_picker_order,
        current_theme_picker_index: updatedSession.current_theme_picker_index,
        created_at: updatedSession.created_at,
        started_at: updatedSession.started_at,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erro ao iniciar jogo:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
