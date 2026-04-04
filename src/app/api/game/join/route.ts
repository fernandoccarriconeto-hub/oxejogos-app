import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MAX_PLAYERS } from '@/types/game';

interface JoinGameRequest {
  inviteCode: string;
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

    const body: JoinGameRequest = await request.json();
    const { inviteCode } = body;

    if (!inviteCode) {
      return NextResponse.json(
        { error: 'C\u00f3digo de convite \u00e9 obrigat\u00f3rio' },
        { status: 400 }
      );
    }

    const { data: gameSession, error: sessionError } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('invite_code', inviteCode.toUpperCase())
      .single();

    if (sessionError || !gameSession) {
      return NextResponse.json(
        { error: 'C\u00f3digo de convite inv\u00e1lido' },
        { status: 404 }
      );
    }

    if (gameSession.status !== 'waiting') {
      return NextResponse.json(
        { error: 'O jogo j\u00e1 foi iniciado ou j\u00e1 terminou' },
        { status: 400 }
      );
    }

    const { data: players, error: countError } = await supabase
      .from('game_players')
      .select('id')
      .eq('game_session_id', gameSession.id);

    if (countError) {
      return NextResponse.json(
        { error: 'Erro ao verificar n\u00famero de jogadores' },
        { status: 500 }
      );
    }

    if (players && players.length >= MAX_PLAYERS) {
      return NextResponse.json(
        { error: 'O jogo atingiu o n\u00famero m\u00e1ximo de jogadores' },
        { status: 400 }
      );
    }

    const { data: existingPlayer } = await supabase
      .from('game_players')
      .select('id')
      .eq('game_session_id', gameSession.id)
      .eq('player_id', user.id)
      .single();

    if (existingPlayer) {
      return NextResponse.json(
        { error: 'Voc\u00ea j\u00e1 est\u00e1 neste jogo' },
        { status: 400 }
      );
    }

    const { error: joinError } = await supabase
      .from('game_players')
      .insert({
        game_session_id: gameSession.id,
        player_id: user.id,
        board_position: 0,
        total_score: 0,
        is_connected: true,
        joined_at: new Date().toISOString(),
      });

    if (joinError) {
      return NextResponse.json(
        { error: 'Erro ao entrar no jogo' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        id: gameSession.id,
        invite_code: gameSession.invite_code,
        captain_id: gameSession.captain_id,
        game_mode: gameSession.game_mode,
        difficulty: gameSession.difficulty,
        board_size: gameSession.board_size,
        status: gameSession.status,
        current_round: gameSession.current_round,
        max_players: gameSession.max_players,
        theme_picker_order: gameSession.theme_picker_order,
        current_theme_picker_index: gameSession.current_theme_picker_index,
        created_at: gameSession.created_at,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erro ao entrar no jogo:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
