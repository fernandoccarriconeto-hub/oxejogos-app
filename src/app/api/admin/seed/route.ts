import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function supaFetch(path: string, options: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

async function getCount(): Promise<number> {
  const res = await supaFetch('perguntas?select=id', {
    headers: { 'Prefer': 'count=exact', 'Range': '0-0' },
  });
  if (!res.ok) return -1;
  const cr = res.headers.get('content-range');
  return cr ? parseInt(cr.split('/')[1]) || 0 : 0;
}

async function getStats() {
  const res = await supaFetch('perguntas?select=categoria,dificuldade');
  if (!res.ok) return null;
  const rows = await res.json();
  const cats: Record<string, number> = {};
  const difs: Record<string, number> = {};
  for (const r of rows) {
    cats[r.categoria] = (cats[r.categoria] || 0) + 1;
    difs[r.dificuldade] = (difs[r.dificuldade] || 0) + 1;
  }
  return { total: rows.length, categorias: cats, dificuldades: difs };
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  if (action === 'status') {
    const count = await getCount();
    if (count === -1) {
      return NextResponse.json({ tableExists: false, count: 0 });
    }
    const stats = count > 0 ? await getStats() : null;
    return NextResponse.json({ tableExists: true, count, stats });
  }

  if (action === 'create_table') {
    const check = await supaFetch('perguntas?select=id&limit=1');
    if (check.ok) {
      return NextResponse.json({ message: 'Table already exists' });
    }
    return NextResponse.json({
      message: 'Table does not exist. Run this SQL in the Supabase SQL Editor:',
      sql: "CREATE TABLE IF NOT EXISTS public.perguntas (\n  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\n  pergunta text NOT NULL,\n  alternativas jsonb NOT NULL,\n  resposta_correta text NOT NULL,\n  categoria text NOT NULL,\n  dificuldade text NOT NULL CHECK (dificuldade IN ('facim', 'marromeno', 'arrochado')),\n  created_at timestamptz DEFAULT now()\n);\nALTER TABLE public.perguntas ENABLE ROW LEVEL SECURITY;\nCREATE POLICY \"Anyone can read perguntas\" ON public.perguntas FOR SELECT USING (true);\nCREATE POLICY \"Service role can insert perguntas\" ON public.perguntas FOR INSERT WITH CHECK (true);\nCREATE INDEX IF NOT EXISTS idx_perguntas_categoria ON public.perguntas(categoria);\nCREATE INDEX IF NOT EXISTS idx_perguntas_dificuldade ON public.perguntas(dificuldade);"
    });
  }

  if (action === 'insert') {
    const batchSize = 50;
    const startFrom = parseInt(request.nextUrl.searchParams.get('from') || '0');

    // Fetch questions from the data endpoint
    const baseUrl = request.nextUrl.origin;
    const dataRes = await fetch(`${baseUrl}/api/admin/seed/data?from=${startFrom}&size=${batchSize}`);
    if (!dataRes.ok) {
      return NextResponse.json({ error: 'Failed to load question data' }, { status: 500 });
    }
    const { batch, total } = await dataRes.json();

    if (!batch || batch.length === 0) {
      return NextResponse.json({ done: true, message: 'All questions inserted', totalAvailable: total });
    }

    const res = await supaFetch('perguntas', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: 'Insert failed', detail: errText, from: startFrom }, { status: 400 });
    }

    const nextFrom = startFrom + batchSize;
    const remaining = total - nextFrom;
    return NextResponse.json({
      success: true,
      inserted: batch.length,
      from: startFrom,
      nextFrom: remaining > 0 ? nextFrom : null,
      remaining: Math.max(0, remaining),
      totalAvailable: total,
    });
  }

  return NextResponse.json({
    availableActions: ['status', 'create_table', 'insert'],
    usage: {
      status: '/api/admin/seed?action=status',
      create_table: '/api/admin/seed?action=create_table',
      insert: '/api/admin/seed?action=insert&from=0',
    },
  });
}