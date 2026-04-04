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
  facim: 'N\u00edvel f\u00e1cil - perguntas que a maioria das pessoas consegue responder',
  marromeno: 'N\u00edvel m\u00e9dio - requer algum conhecimento espec\u00edfico',
  arrochado: 'N\u00edvel dif\u00edcil - apenas especialistas saberiam',
};

export async function POST(request: NextRequest) {
  try {
    const body: SurpriseRequest = await request.json();
    const { theme, difficulty } = body;

    if (!theme || !difficulty) {
      return NextResponse.json(
        { error: 'Tema e dificuldade s\u00e3o obrigat\u00f3rios' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY n\u00e3o configurada');
      return NextResponse.json(
        { error: 'Configura\u00e7\u00e3o do servidor incompleta' },
        { status: 500 }
      );
    }

    const difficultyInstruction = DIFFICULTY_INSTRUCTIONS[difficulty] || DIFFICULTY_INSTRUCTIONS.marromeno;

    const userPrompt = `
Gere uma pergunta interessante e sua resposta correta para um jogo de trivia familiar em uma "casa surpresa".

Tema: ${theme}
N\u00edvel de dificuldade: ${difficultyInstruction}
Tempo dispon\u00edvel: 30 segundos (perguntas mais diretas e objetivas)

A pergunta deve ser respondida rapidamente, ent\u00e3o seja direto e objetivo.

Responda em JSON com o seguinte formato:
{
  "question": "A pergunta aqui (bem direta e objetiva)",
  "answer": "A resposta correta aqui"
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
        temperature: 0.1,
        system: 'Voc\u00ea \u00e9 um gerador de perguntas para um jogo de trivia familiar chamado OxeJogos. Para as casas surpresa, gere perguntas diretas e objetivas que possam ser respondidas em 30 segundos.',
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
      console.error('Erro na chamada \u00e0 API Anthropic (surprise):', errorData);
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
