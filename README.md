# OxeJogos - O Jogo de Tabuleiro Digital Mais Arretado do Brasil

Jogo de tabuleiro digital multiplayer de perguntas e respostas, desenvolvido pela **Oxeteque**, com tecnologia de IA do **Claude** (Anthropic).

## Como Rodar o Projeto

### 1. Instalar dependencias

```bash
cd oxejogos-app
npm install
```

### 2. Configurar variaveis de ambiente

Copie o arquivo de exemplo e preencha com suas credenciais:

```bash
cp .env.local.example .env.local
```

Edite `.env.local` com:

- **NEXT_PUBLIC_SUPABASE_URL** - URL do seu projeto Supabase
- **NEXT_PUBLIC_SUPABASE_ANON_KEY** - Chave publica do Supabase
- **SUPABASE_SERVICE_ROLE_KEY** - Chave de servico do Supabase
- **ANTHROPIC_API_KEY** - Chave da API da Anthropic (para gerar perguntas com Claude)

### 3. Configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Execute o schema SQL disponivel em `../supabase-schema.sql` no SQL Editor do Supabase
3. Ative o Realtime nas tabelas: `game_sessions`, `game_players`, `rounds`, `player_answers`, `votes`, `round_scores`
4. Configure a autenticacao por email no painel do Supabase

### 4. Rodar em desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000)

### 5. Build para producao

```bash
npm run build
npm start
```

## Estrutura do Projeto

```
src/
  app/
    page.tsx          # Landing page
    layout.tsx        # Layout raiz
    auth/             # Login e cadastro
    lobby/            # Sala de espera e criacao de jogo
    game/             # Tela principal do jogo (tabuleiro, rodadas, votacao)
    avatar/           # Selecao de avatar
    convite/[code]/   # Pagina de convite
    api/
      ai/generate/    # Geracao de perguntas via Claude
      ai/surprise/    # Perguntas da casa surpresa
      game/create/    # Criar sessao de jogo
      game/join/      # Entrar no jogo via convite
      game/start/     # Iniciar partida
      game/answer/    # Enviar resposta
      game/vote/      # Votar em resposta
      game/calculate-scores/  # Calcular pontuacao
  components/         # Componentes reutilizaveis
  hooks/              # Zustand store e hooks
  lib/                # Supabase clients, utils
  types/              # TypeScript types
  styles/             # CSS global
public/
  images/             # Imagens do mascote OxeBot
```

## Stack Tecnologica

- **Frontend:** Next.js 14 (App Router) + React 18 + TypeScript
- **Estilizacao:** Tailwind CSS + Framer Motion
- **Estado:** Zustand
- **Backend:** Next.js API Routes
- **Banco de Dados:** Supabase (PostgreSQL)
- **Realtime:** Supabase Realtime (WebSockets)
- **Autenticacao:** Supabase Auth
- **IA:** Claude API (Anthropic) - geracao de perguntas e respostas
- **Deploy:** Vercel (recomendado)

## Modos de Jogo

| Modo       | Casas | Tempo/Rodada | Descricao                  |
|------------|-------|--------------|----------------------------|
| Rapidinho  | 10    | 90 seg       | Pra quem quer diversao rapida |
| Classico   | 21    | 90 seg       | A experiencia completa     |
| Maratona   | 30    | 90 seg       | Pra quem aguenta o tranco  |

## Niveis de Dificuldade

- **Facim** - Pra aquecer os neuronios
- **Marromeno** - Ja pega no pe
- **Arrochado** - So os brabos aguentam

## Pontuacao

- Acertou a resposta correta: **+3 pontos**
- Alguem votou na sua resposta: **+2 pontos por voto**
- Identificou a resposta criativa da IA: **+1 ponto bonus**
- Errou a aposta na IA criativa: **-1 ponto**
- Cada ponto = 1 casa no tabuleiro

---

Feito com amor no Nordeste pela Oxeteque
