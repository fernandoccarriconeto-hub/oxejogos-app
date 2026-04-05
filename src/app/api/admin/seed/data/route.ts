import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { count } = body;

  const perguntasFiles = [];

  // Dynamically load all question files
  for (let i = 0; i < 10; i++) {
    try {
      const file = await import(`../../../../data/perguntas_${i}.json`);
      perguntasFiles.push(file.default);
    } catch (error) {
      console.error(`Error loading perguntas_${i}.json:`, error);
    }
  }

  // Flatten and slice the array
  const allQuestions = perguntasFiles.flat().slice(0, count || 1000);

  return NextResponse.json({
    message: 'Seed data loaded successfully',
    count: allQuestions.length,
    questions: allQuestions,
  });
}
