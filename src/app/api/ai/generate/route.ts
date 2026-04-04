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
  facim: 'Nível FÁCIL - perguntas de cultura geral que a maioria das pessoas consegue responder. Use fatos conhecidos e populares.',
  marromeno: 'Nível MÉDIO - requer conhecimento específico do tema. Use fatos menos óbvios mas que uma pessoa curiosa saberia.',
  arrochado: 'Nível DIFÍCIL - apenas entusiastas ou especialistas saberiam. Use detalhes obscuros, datas específicas, nomes pouco conhecidos.',
};

const THEME_EXAMPLES: Record<string, string> = {
  'Medicina e Saúde': 'Ex: "Qual órgão do corpo humano é responsável por filtrar o sangue?", "Que doença é transmitida pelo mosquito Aedes aegypti?", "Qual vitamina é produzida pela exposição ao sol?"',
  'Inteligência Artificial': 'Ex: "Quem é considerado o pai da inteligência artificial?", "Em que ano o ChatGPT foi lançado?", "Como se chama o teste criado por Alan Turing para avaliar se uma máquina pode pensar?"',
  'Matemática': 'Ex: "Qual o único número primo que é par?", "Como se chama um polígono de 8 lados?", "Quanto é a raiz quadrada de 144?"',
  'História': 'Ex: "Em que ano Napoleão invadiu a Espanha?", "Quem foi o primeiro presidente do Brasil?", "Em que cidade foi assinada a Declaração de Independência dos EUA?"',
  'Geografia': 'Ex: "Qual o maior deserto do mundo?", "Que rio corta a cidade de Paris?", "Qual o país mais populoso da África?"',
  'Esportes': 'Ex: "Quem é o piloto de F1 que mais venceu corridas?", "Em que ano o Brasil ganhou sua primeira Copa do Mundo?", "Qual o esporte mais praticado no mundo?"',
  'Direito': 'Ex: "O que significa a sigla STF?", "Quantos anos dura o mandato de um senador no Brasil?", "Qual a idade mínima para ser presidente do Brasil?"',
  'COMIC-CON': 'Ex: "Qual o nome verdadeiro do Homem-Aranha?", "Em que ano foi publicada a primeira HQ do Batman?", "Quem interpreta Wolverine nos filmes dos X-Men?"',
  'Ciências': 'Ex: "Qual o símbolo químico do ouro?", "Quantos planetas tem o sistema solar?", "Qual gás as plantas absorvem durante a fotossíntese?"',
  'Filmes, Séries e TV': 'Ex: "Quem dirigiu o filme Titanic?", "Em que ano a série Breaking Bad estreou?", "Qual ator interpretou Jack Sparrow em Piratas do Caribe?"',
};

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { theme, subTheme, difficulty } = body;

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

    // FIRST CALL: Generate the correct answer
    const themeExamples = THEME_EXAMPLES[theme] || '';
    const userPromptFirst = `
Você deve gerar UMA pergunta de trivia ESPECÍFICA e CRIATIVA sobre o tema "${theme}" para um jogo familiar brasileiro chamado OxeJogos.

REGRAS IMPORTANTES:
1. A pergunta DEVE ser diretamente relacionada ao tema "${theme}" - não pode ser genérica ou sobre outro assunto
2. A pergunta deve ter uma resposta OBJETIVA e VERIFICÁVEL (um nome, uma data, um número, um lugar)
3. A pergunta deve ser CRIATIVA e INTERESSANTE - evite perguntas óbvias demais
4. A resposta deve ser CURTA (máximo 1-2 frases)
5. Use linguagem clara e acessível para famílias brasileiras
6. NUNCA repita exemplos - crie algo original

${subTheme ? `Sub-tema específico: ${subTheme}` : ''}
Nível de dificuldade: ${DIFFICULTY_INSTRUCTIONS[difficulty]}

${themeExamples ? `Exemplos do estilo desejado para o tema "${theme}":\n${themeExamples}\nCrie uma pergunta DIFERENTE desses exemplos, mas no mesmo estilo.` : ''}

Responda APENAS em JSON válido, sem markdown:
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
        temperature: 0.9,
        system: `Você é o mestre de perguntas do OxeJogos, um jogo de trivia familiar brasileiro com alma nordestina. Sua missão é criar perguntas ESPECÍFICAS, CRIATIVAS e DIVERTIDAS que sejam diretamente relacionadas ao tema pedido. Cada pergunta deve ter uma resposta objetiva e verificável. Você é especialista em criar perguntas que provocam curiosidade e debate entre os jogadores. NUNCA faça perguntas genéricas - sempre mergulhe fundo no tema com fatos interessantes, datas marcantes, personagens importantes ou curiosidades surpreendentes. Responda APENAS em JSON válido, sem markdown ou code blocks.`,
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
      console.error('Erro na chamada à API Anthropic (primeira):', errorData);
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
      console.error('Erro na chamada à API Anthropic (segunda):', errorData);
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
