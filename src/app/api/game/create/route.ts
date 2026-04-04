import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { GameMode, GAME_MODE_CONFIG } from '@/types/game';

interface CreateGameRequest {
  gameMode: GameMode;
  difficulty: string;
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
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
        { error: 'Usu\u00e1rio n\u00e3o autenticado' },
        { status: 401 }
      );
    }

    const body: CreateGameRequest = await request.json();
    const { gameMode, difficulty } = body;

    if (!gameMode || !difficulty) {
      return NextResponse.json(
        { error: 'Modo de jogo e dificuldade s\u00e3o obrigat\u00f3rios' },
        { status: 400 }
      );
    }

    if (!GAME_MODE_CONFIG[gameMode]) {
      return NextResponse.json(
        { error: 'Modo de jogo inv\u00e1lido' },
        { status: 400 }
      );
    }

    const boardSize = GAME_MODE_CONFIG[gameMode].boardSize;
    let inviteCode = generateInviteCode();

    // Ensure invite code is unique
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      const { data: existing } = await supabase
        .from('game_sessions')
        .select('id')
        .eq('invite_code', inviteCode)
        .single();

      if (!existing) {
        isUnique = true;
      } else {
        inviteCode = generateInviteCode();
        attempts++;
      }
    }

    if (!isUnique) {
      return NextResponse.json(
        { error: 'Erro ao gerar c\u00f3digo de convite' },
        { status: 500 }
      );
    }

    // Create game session
    const { data: gameSession, error: gameError } = await supabase
      .from('game_sessions')
      .insert({
        invite_code: inviteCode,
        captain_id: user.id,
        game_mode: gameMode,
        difficulty,
        board_size: boardSize,
        status: 'waiting',
        current_round: 0,
        max_players: 12,
        theme_picker_order: [],
        current_theme_picker_index: 0,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (gameError || !gameSession) {
      console.error('Erro ao criar sess\u00e3o de jogo:', gameError);
      return NextResponse.json(
        { error: 'Erro ao criar sess\u00e3o de jogo' },
        { status: 500 }
      );
    }

    // Add creator as first player
    const { error: playerError } = await supabase
      .from('game_players')
      .insert({
        game_session_id: gameSession.id,
        player_id: user.id,
        board_position: 0,
        total_score: 0,
        is_connected: true,
        joined_at: new Date().toISOString(),
      });

    if (playerError) {
      console.error('Erro ao adicionar jogador:', playerError);
      return NextResponse.json(
        { error: 'Erro ao adicionar jogador \u00e0 sess\u00e3o' },
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
      { status: 201 }
    );
  } catch (error) {
    console.error('Erro ao criar jogo:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
