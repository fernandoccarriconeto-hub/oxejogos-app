import { NextRequest, NextResponse } from 'next/server';
import { Difficulty } from '@/types/game';
import { createClient } from '@/lib/supabase/server';

interface GenerateRequest {
  theme: string;
  subTheme?: string;
  difficulty: Difficulty;
}

// Map theme display names to database IDs
const THEME_NAME_TO_ID: Record<string, string> = {
  'Medicina e Saúde': 'medicina',
  'Inteligência Artificial': 'ia',
  'Matemática': 'matematica',
  'História': 'historia',
  'Geografia': 'geografia',
  'Esportes': 'esportes',
  'Direito': 'direito',
  'COMIC-CON': 'comiccon',
  'Ciências': 'ciencias',
  'Filmes, Séries e TV': 'filmes',
};

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { theme, difficulty } = body;

    if (!theme || !difficulty) {
      return NextResponse.json(
        { error: 'Tema e dificuldade são obrigatórios' },
        { status: 400 }
      );
    }

    const themeId = THEME_NAME_TO_ID[theme] || theme.toLowerCase();
    const supabase = await createClient();

    // Fetch question + correct answer + creative answer all from the database (instant)
    const { data: result, error } = await supabase
      .rpc('get_game_question', { p_tema: themeId, p_nivel: difficulty });

    if (error || !result) {
      console.error('Erro ao buscar pergunta do banco:', error);
      return NextResponse.json(
        { error: 'Nenhuma pergunta encontrada para este tema e dificuldade' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        question: result.question,
        correctAnswer: result.correctAnswer,
        creativeAnswer: result.creativeAnswer,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erro ao gerar pergunta:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
