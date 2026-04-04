import { NextRequest, NextResponse } from 'next/server';
import { Difficulty } from '@/types/game';

interface GenerateRequest {
  theme: string;
  subTheme?: string;
  difficulty: Difficulty;
}

interface AnthropicMessage {
  content: Array<{ type: string; text: string }>;
}

const DIFFICULTY_INSTRUCTIONS: Record<Difficulty, string> = {
  facim: 'N\u00edvel f\u00e1cil - perguntas que a maioria das pessoas consegue responder',
  marromeno: 'N\u00edvel m\u00e9dio - requer algum conhecimento espec\u00edfico',
  arrochado: 'N\u00edvel dif\u00edcil - apenas especialistas saberiam',
};

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { theme, subTheme, difficulty } = body;

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

    // FIRST CALL: Generate the correct answer
    const userPromptFirst = `
Gere uma pergunta interessante e sua resposta correta para um jogo de trivia familiar.

Tema: ${theme}
${subTheme ? `Sub-tema: ${subTheme}` : ''}
N\u00edvel de dificuldade: ${DIFFICULTY_INSTRUCTIONS[difficulty]}

Responda em JSON com o seguinte formato:
{
  "question": "A pergunta aqui",
  "answer": "A resposta correta aqui"
}`;

    const firstResponse = await fetch('https://api.anthropic.com/v1/messages', {
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
        system: 'Voc\u00ea \u00e9 um gerador de perguntas para um jogo de trivia familiar chamado OxeJogos. Gere uma pergunta interessante e sua resposta correta.',
        messages: [
          {
            role: 'user',
            content: userPromptFirst,
          },
        ],
      }),
    });

    if (!firstResponse.ok) {
      const errorData = await firstResponse.text();
      console.error('Erro na chamada \u00e0 API Anthropic (primeira):', errorData);
      return NextResponse.json(
        { error: 'Erro ao gerar pergunta' },
        { status: 500 }
      );
    }

    const firstData: AnthropicMessage = await firstResponse.json();
    const firstText = firstData.content[0].text;

    let correctAnswer: string;
    let question: string;

    try {
      const firstJson = JSON.parse(firstText);
      question = firstJson.question;
      correctAnswer = firstJson.answer;
    } catch (e) {
      console.error('Erro ao fazer parse da resposta (primeira):', firstText);
      return NextResponse.json(
        { error: 'Erro ao processar resposta da IA' },
        { status: 500 }
      );
    }

    // SECOND CALL: Generate the creative wrong answer
    const userPromptSecond = `
Pergunta: "${question}"

Sua tarefa \u00e9 criar uma resposta que pare\u00e7a plaus\u00edvel mas que N\u00c3O \u00e9 a resposta correta. A resposta deve ser convincente o suficiente para enganar outros jogadores no jogo OxeJogos.

Responda em JSON com o seguinte formato:
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
        system: 'Voc\u00ea \u00e9 um jogador criativo num jogo de trivia. Sua tarefa \u00e9 criar uma resposta que pare\u00e7a plaus\u00edvel mas que N\u00c3O \u00e9 a resposta correta. A resposta deve ser convincente o suficiente para enganar outros jogadores.',
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
      console.error('Erro na chamada \u00e0 API Anthropic (segunda):', errorData);
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
      console.error('Erro ao fazer parse da resposta (segunda):', secondText);
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
