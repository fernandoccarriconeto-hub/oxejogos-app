import { NextRequest, NextResponse } from 'next/server';
import { Difficulty } from '@/types/game';

interface SurpriseRequest {
  theme: string;
  difficulty: string;
}

interface AnthropicMessage {
  content: Array<{ type: string; text: string }>;
}

const DIFFICULTY_INSTRUCTIONS: Record<string, string> = {
  facim: 'Nível FÁCIL - perguntas de cultura geral que a maioria das pessoas consegue responder',
  marromeno: 'Nível MÉDIO - requer conhecimento específico do tema',
  arrochado: 'Nível DIFÍCIL - apenas entusiastas ou especialistas saberiam',
};

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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY não configurada');
      return NextResponse.json(
        { error: 'Configuração do servidor incompleta' },
        { status: 500 }
      );
    }

    const difficultyInstruction = DIFFICULTY_INSTRUCTIONS[difficulty] || DIFFICULTY_INSTRUCTIONS.marromeno;

    const userPrompt = `
Gere uma pergunta SURPRESA para o jogo OxeJogos! O jogador caiu na casa surpresa do tabuleiro.

REGRAS:
1. A pergunta DEVE ser sobre o tema "${theme}" - diretamente relacionada
2. Deve ter resposta OBJETIVA e CURTA (1-3 palavras idealmente)
3. Deve ser DIRETA - o jogador tem apenas 30 segundos
4. A resposta deve ser VERIFICÁVEL (um nome, data, número, lugar)
5. Seja CRIATIVO - use curiosidades interessantes do tema

Nível de dificuldade: ${difficultyInstruction}

Responda APENAS em JSON válido, sem markdown:
{
  "question": "A pergunta aqui (direta e objetiva)",
  "answer": "A resposta correta aqui (curta)"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        temperature: 0.9,
        system: 'Você é o mestre das casas surpresa do OxeJogos! Crie perguntas rápidas, divertidas e ESPECÍFICAS sobre o tema pedido. A resposta deve ser curta e objetiva (1-3 palavras). Responda APENAS em JSON válido, sem markdown.',
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Erro na chamada à API Anthropic (surprise):', errorData);
      return NextResponse.json(
        { error: 'Erro ao gerar pergunta surpresa' },
        { status: 500 }
      );
    }

    const data: AnthropicMessage = await response.json();
    const responseText = data.content[0].text;

    let question: string;
    let correctAnswer: string;

    try {
      const jsonData = JSON.parse(responseText);
      question = jsonData.question;
      correctAnswer = jsonData.answer;
    } catch (e) {
      console.error('Erro ao fazer parse da resposta (surprise):', responseText);
      return NextResponse.json(
        { error: 'Erro ao processar resposta da IA' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        question,
        correctAnswer,
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