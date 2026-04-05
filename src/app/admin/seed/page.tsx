'use client';

import { useState, useCallback } from 'react';

export default function AdminSeedPage() {
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);

  const addLog = useCallback((msg: string) => {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const checkStatus = async () => {
    setLoading(true);
    addLog('Verificando status da tabela...');
    try {
      const res = await fetch('/api/admin/seed?action=status');
      const data = await res.json();
      setStats(data);
      if (!data.tableExists) {
        addLog('Tabela "perguntas" NAO existe. Crie ela primeiro.');
      } else {
        addLog(`Tabela existe! Total de perguntas: ${data.count}`);
        if (data.stats) {
          addLog(`Categorias: ${JSON.stringify(data.stats.categorias)}`);
          addLog(`Dificuldades: ${JSON.stringify(data.stats.dificuldades)}`);
        }
      }
    } catch (e: any) {
      addLog(`Erro: ${e.message}`);
    }
    setLoading(false);
  };

  const createTable = async () => {
    setLoading(true);
    addLog('Verificando/criando tabela...');
    try {
      const res = await fetch('/api/admin/seed?action=create_table');
      const data = await res.json();
      if (data.sql) {
        addLog('Tabela nao existe. Execute o SQL abaixo no Supabase SQL Editor:');
        addLog(data.sql);
      } else {
        addLog(data.message);
      }
    } catch (e: any) {
      addLog(`Erro: ${e.message}`);
    }
    setLoading(false);
  };

  const insertAll = async () => {
    setLoading(true);
    addLog('Iniciando insercao em lotes de 50...');
    let from = 0;
    let totalInserted = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        addLog(`Inserindo lote a partir de ${from}...`);
        const res = await fetch(`/api/admin/seed?action=insert&from=${from}`);
        const data = await res.json();

        if (data.error) {
          addLog(`Erro no lote ${from}: ${data.detail || data.error}`);
          break;
        }

        if (data.done) {
          addLog('Todas as perguntas ja foram inseridas!');
          hasMore = false;
        } else {
          totalInserted += data.inserted;
          addLog(`Lote inserido: +${data.inserted} (total: ${totalInserted}, restante: ${data.remaining})`);
          if (data.nextFrom === null) {
            hasMore = false;
          } else {
            from = data.nextFrom;
          }
        }

        await new Promise(r => setTimeout(r, 300));
      } catch (e: any) {
        addLog(`Erro: ${e.message}`);
        break;
      }
    }

    addLog(`Insercao concluida! Total inserido nesta sessao: ${totalInserted}`);
    setLoading(false);
    await checkStatus();
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 20, fontFamily: 'monospace' }}>
      <h1 style={{ color: '#1a5276' }}>OxeJogos - Admin Seed</h1>
      <p>Gerenciar perguntas do trivia no Supabase</p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={checkStatus}
          disabled={loading}
          style={{ padding: '10px 20px', background: '#2980b9', color: '#fff', border: 'none', borderRadius: 5, cursor: loading ? 'wait' : 'pointer' }}
        >
          Verificar Status
        </button>
        <button
          onClick={createTable}
          disabled={loading}
          style={{ padding: '10px 20px', background: '#e67e22', color: '#fff', border: 'none', borderRadius: 5, cursor: loading ? 'wait' : 'pointer' }}
        >
          Criar Tabela
        </button>
        <button
          onClick={insertAll}
          disabled={loading}
          style={{ padding: '10px 20px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: 5, cursor: loading ? 'wait' : 'pointer' }}
        >
          Inserir 1000 Perguntas
        </button>
      </div>

      {stats && (
        <div style={{ background: '#ecf0f1', padding: 15, borderRadius: 5, marginBottom: 15 }}>
          <strong>Status Atual:</strong>
          <p>Tabela existe: {stats.tableExists ? 'Sim' : 'Nao'}</p>
          <p>Total de perguntas: <strong>{stats.count}</strong></p>
          {stats.stats && (
            <>
              <p>Por categoria:</p>
              <ul>
                {Object.entries(stats.stats.categorias || {}).sort().map(([k, v]) => (
                  <li key={k}>{k}: {v as number}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div style={{ background: '#1a1a2e', color: '#0f0', padding: 15, borderRadius: 5, maxHeight: 500, overflow: 'auto', fontSize: 12 }}>
        <strong style={{ color: '#fff' }}>Log:</strong>
        {log.length === 0 && <p style={{ color: '#666' }}>Clique em um botao para comecar...</p>}
        {log.map((l, i) => (
          <div key={i} style={{ marginTop: 3, whiteSpace: 'pre-wrap' }}>{l}</div>
        ))}
      </div>
    </div>
  );
}
