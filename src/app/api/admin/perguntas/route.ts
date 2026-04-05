import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
};

async function ensureTable() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  // Try selecting from perguntas
  const check = await fetch(`${SUPABASE_URL}/rest/v1/perguntas?select=id&limit=1`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
  });
  if (check.status === 404 || check.status === 406) {
    // Table doesn't exist, create it
    const createSql = `
      CREATE TABLE IF NOT EXISTS public.perguntas (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        pergunta text NOT NULL,
        alternativas jsonb NOT NULL,
        resposta_correta text NOT NULL,
        categoria text NOT NULL,
        dificuldade text NOT NULL CHECK (dificuldade IN ('facim', 'marromeno', 'arrochado')),
        created_at timestamptz DEFAULT now()
      );
      ALTER TABLE public.perguntas ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Anyone can read perguntas" ON public.perguntas FOR SELECT USING (true);
      CREATE INDEX IF NOT EXISTS idx_perguntas_categoria ON public.perguntas(categoria);
      CREATE INDEX IF NOT EXISTS idx_perguntas_dificuldade ON public.perguntas(dificuldade);
    `;
    // Use the SQL endpoint
    const sqlRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: createSql }),
    });
    // If exec_sql doesn't exist, try pg_query
    if (!sqlRes.ok) {
      // Fallback: use the management API or just report
      return { created: false, error: 'Table does not exist. Please create it via Supabase dashboard.' };
    }
    return { created: true };
  }
  return { created: false, exists: true };
}

export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.searchParams.get('action');
    
    if (action === 'setup') {
      const result = await ensureTable();
      return NextResponse.json(result);
    }

    // Count total
    const countRes = await fetch(`${SUPABASE_URL}/rest/v1/perguntas?select=id`, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'count=exact',
        'Range': '0-0',
      },
    });
    
    if (!countRes.ok) {
      const errText = await countRes.text();
      return NextResponse.json({ error: 'Table may not exist', status: countRes.status, detail: errText }, { status: 400 });
    }
    
    const contentRange = countRes.headers.get('content-range');
    const total = contentRange ? parseInt(contentRange.split('/')[1]) || 0 : 0;

    // Get category breakdown
    const catRes = await fetch(`${SUPABASE_URL}/rest/v1/perguntas?select=categoria,dificuldade`, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
    });
    const allRows = catRes.ok ? await catRes.json() : [];
    
    const categorias: Record<string, number> = {};
    const dificuldades: Record<string, number> = {};
    const catDif: Record<string, Record<string, number>> = {};
    
    for (const row of allRows) {
      categorias[row.categoria] = (categorias[row.categoria] || 0) + 1;
      dificuldades[row.dificuldade] = (dificuldades[row.dificuldade] || 0) + 1;
      if (!catDif[row.categoria]) catDif[row.categoria] = {};
      catDif[row.categoria][row.dificuldade] = (catDif[row.categoria][row.dificuldade] || 0) + 1;
    }

    return NextResponse.json({ total, categorias, dificuldades, catDif });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { perguntas } = body;
    
    if (!perguntas || !Array.isArray(perguntas) || perguntas.length === 0) {
      return NextResponse.json({ error: 'Array de perguntas é obrigatório' }, { status: 400 });
    }

    // Insert in batch
    const res = await fetch(`${SUPABASE_URL}/rest/v1/perguntas`, {
      method: 'POST',
      headers: {
        ...headers,
        'Prefer': 'return=representation,count=exact',
      },
      body: JSON.stringify(perguntas),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: 'Insert failed', detail: errText }, { status: 400 });
    }

    const contentRange = res.headers.get('content-range');
    const inserted = perguntas.length;

    return NextResponse.json({ success: true, inserted });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
