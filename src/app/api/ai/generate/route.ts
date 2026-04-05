import { NextRequest, NextResponse } from 'next/server';
import { Difficulty } from '@/types/game';
import { createClient } from '@/lib/supabase/server';

interface GenerateRequest {
  theme: string;
  subTheme?: string;
  difficulty: Difficulty;
}

interface AnthropicMessage {
  content: Array<{ type: string; text: string }>;
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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY não configurada');
      return NextResponse.json(
        { error: 'Configuração do servidor incompleta' },
        { status: 500 }
      );
    }

    // Resolve theme ID for database query
    const themeId = THEME_NAME_TO_ID[theme] || theme.toLowerCase();

    // Fetch a random question from the database
    const supabase = await createClient();
    const { data: questionData, error: dbError } = await supabase
      .from('questions')
      .select('pergunta, resposta')
      .eq('tema', themeId)
      .eq('nivel', difficulty)
      .limit(1)
      .order('id', { ascending: false })  // Will be overridden by random below

    // Use raw SQL for true random selection
    const { data: randomQuestion, error: randomError } = await supabase
      .rpc('get_random_question', { p_tema: themeId, p_nivel: difficulty });

    let question: string;
    let correctAnswer: string;

    if (randomQuestion && !randomError) {
      // Use the RPC result
      question = randomQuestion.pergunta;
      correctAnswer = randomQuestion.resposta;
    } else if (questionData && questionData.length > 0 && !dbError) {
      // Fallback: pick random from fetched results
      const randomIndex = Math.floor(Math.random() * questionData.length);
      question = questionData[randomIndex].pergunta;
      correctAnswer = questionData[randomIndex].resposta;
    } else {
      console.error('Erro ao buscar pergunta do banco:', randomError || dbError);
      return NextResponse.json(
        { error: 'Nenhuma pergunta encontrada para este tema e dificuldade' },
        { status: 404 }
      );
    }

    // Generate the creative (decoy) answer using AI
    const userPromptSecond = `
Tema da pergunta: "${theme}"
Pergunta: "${question}"
Resposta correta (NÃO repita): "${correctAnswer}"

Sua tarefa é criar UMA resposta alternativa que:
1. Pareça MUITO plausível e convincente
2. Esteja relacionada ao tema "${theme}"
3. Seja DIFERENTE da resposta correta
4. Tenha o mesmo formato e tamanho da resposta correta
5. Seja algo que uma pessoa desinformada poderia acreditar ser verdade

A resposta deve enganar jogadores que não sabem a resposta certa.

Responda APENAS em JSON válido, sem markdown:
{
  "creative_answer": "A resposta falsa convincente aqui"
}`;

    const secondResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        temperature: 0.8,
        system: `Você é um jogador astuto do OxeJogos. Sua especialidade é criar respostas falsas tão convincentes que enganam os outros jogadores. A resposta falsa deve soar verdadeira, estar no contexto do tema, e ter o mesmo nível de detalhe da resposta correta. Responda APENAS em JSON válido, sem markdown ou code blocks.`,
        messages: [
          {
            role: 'user',
            content: userPromptSecond,
          },
        ],
      }),
    });

    if (!secondResponse.ok) {
      const errorData = await secondResponse.text();
      console.error('Erro na chamada à API Anthropic (criativa):', errorData);
      return NextResponse.json(
        { error: 'Erro ao gerar resposta criativa' },
        { status: 500 }
      );
    }

    const secondData: AnthropicMessage = await secondResponse.json();
    const secondText = secondData.content[0].text;

    let creativeAnswer: string;

    try {
      const secondJson = JSON.parse(secondText);
      creativeAnswer = secondJson.creative_answer;
    } catch (e) {
      console.error('Erro ao fazer parse da resposta criativa:', secondText);
      return NextResponse.json(
        { error: 'Erro ao processar resposta da IA' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        question,
        correctAnswer,
        creativeAnswer,
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
