import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface SurpriseRequest {
  theme: string;
  difficulty: string;
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
    const body: SurpriseRequest = await request.json();
    const { theme, difficulty } = body;

    if (!theme || !difficulty) {
      return NextResponse.json(
        { error: 'Tema e dificuldade são obrigatórios' },
        { status: 400 }
      );
    }

    const themeId = THEME_NAME_TO_ID[theme] || theme.toLowerCase();
    const supabase = await createClient();

    // Use RPC to get question with multiple choice options
    const { data: result, error } = await supabase
      .rpc('get_surprise_question', { p_tema: themeId, p_nivel: difficulty });

    if (error || !result) {
      console.error('Erro ao buscar pergunta surpresa:', error);
      return NextResponse.json(
        { error: 'Nenhuma pergunta encontrada' },
        { status: 404 }
      );
    }

    const { question, correctAnswer, wrongOptions } = result;

    // Build shuffled options array: correct + 3 wrong
    const options = shuffleArray([
      { text: correctAnswer, isCorrect: true },
      ...((wrongOptions || []) as string[]).map((text: string) => ({ text, isCorrect: false })),
    ]);

    // Assign letters A, B, C, D
    const labeledOptions = options.map((opt, i) => ({
      letter: String.fromCharCode(65 + i),
      text: opt.text,
      isCorrect: opt.isCorrect,
    }));

    return NextResponse.json(
      {
        question,
        correctAnswer,
        options: labeledOptions,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erro ao gerar pergunta surpresa:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
