'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { formatTime, shuffleArray } from '@/lib/utils';
import type { GameSession, GamePlayer, Round, PlayerAnswer, RoundScore, ShuffledAnswer, ThemeId } from '@/types/game';
import { THEMES, ANSWER_TIME_SECONDS, VOTE_TIME_SECONDS, SURPRISE_HOUSES_INTERVAL } from '@/types/game';
import { isSurpriseHouse } from '@/lib/utils';

type GameScreenState = 'loading' | 'theme_voting' | 'waiting_question' | 'question' | 'waiting_votes' | 'voting' | 'results' | 'game_over';

// Board colors for players
const PLAYER_COLORS = ['#0E7490', '#DC2626', '#16A34A', '#9333EA', '#EA580C', '#2563EB', '#CA8A04', '#DB2777', '#059669', '#7C3AED', '#D97706', '#0891B2'];

// Board component showing player positions
function GameBoard({ players, boardSize, userId }: { players: GamePlayer[]; boardSize: number; userId: string | null }) {
  const houses = Array.from({ length: boardSize }, (_, i) => i + 1);

  return (
    <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
      <h3 className="text-lg font-fredoka text-oxe-navy mb-3 text-center">Tabuleiro</h3>

      {/* Player legend */}
      <div className="flex flex-wrap gap-2 mb-3 justify-center">
        {players.map((player, idx) => (
          <div key={player.id} className="flex items-center gap-1 text-xs font-nunito">
            <div
              className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: PLAYER_COLORS[idx % PLAYER_COLORS.length] }}
            />
            <span className={player.player_id === userId ? 'font-bold text-oxe-navy' : 'text-gray-600'}>
              {(player.profile as any)?.full_name || `J${idx + 1}`}
              {player.player_id === userId ? ' (você)' : ''}
            </span>
          </div>
        ))}
      </div>

      {/* Board houses */}
      <div className="grid grid-cols-7 gap-2">
        {houses.map((house) => {
          const playersOnHouse = players.filter((p) => p.board_position === house);

          return (
            <div
              key={house}
              className="bg-gradient-to-b from-oxe-beige to-oxe-light-orange rounded-lg p-3 aspect-square flex flex-col items-center justify-center border-2 border-oxe-orange shadow-md hover:shadow-lg transition-all"
            >
              <div className="text-xs font-fredoka text-oxe-navy font-bold mb-1">{house}</div>
              <div className="flex flex-col gap-1">
                {playersOnHouse.map((player, idx) => (
                  <div
                    key={player.id}
                    className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
                    style={{ backgroundColor: PLAYER_COLORS[players.indexOf(player) % PLAYER_COLORS.length] }}
                    title={(player.profile as any)?.full_name || `J${idx + 1}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function GamePage() {
  const router = useRouter();
  const supabase = createClient();
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [playerAnswers, setPlayerAnswers] = useState<PlayerAnswer[]>([]);
  const [roundScores, setRoundScores] = useState<RoundScore[]>([]);
  const [gameScreenState, setGameScreenState] = useState<GameScreenState>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [timeLeft, setTimeLeft] = useState(ANSWER_TIME_SECONDS);
  const [shuffledAnswers, setShuffledAnswers] = useState<ShuffledAnswer[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedVotes, setSelectedVotes] = useState<{ [key: string]: string | boolean }>({});
  const [roundResults, setRoundResults] = useState<any>(null);

  // Get user session
  useEffect(() => {
    const getSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getSession();
  }, [supabase.auth]);

  // Get game session from URL
  useEffect(() => {
    const fetchGameSession = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const inviteCode = searchParams.get('invite_code');
      if (!inviteCode) {
        router.push('/');
        return;
      }

      const { data, error } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('invite_code', inviteCode)
        .single();

      if (error || !data) {
        router.push('/');
        return;
      }

      setGameSession(data);
    };

    if (userId) {
      fetchGameSession();
    }
  }, [userId, supabase, router]);

  // Subscribe to game session changes
  useEffect(() => {
    if (!gameSession) return;

    const subscription = supabase
      .from('game_sessions')
      .on('*', (payload) => {
        if (payload.new) {
          setGameSession(payload.new);
        }
      })
      .subscribe();

    return () => {
      supabase.removeAllChannels();
    };
  }, [gameSession, supabase]);

  // Subscribe to players changes
  useEffect(() => {
    if (!gameSession) return;

    const subscription = supabase
      .from('game_players')
      .on('*', (payload) => {
        setPlayers((prev) => {
          if (payload.eventType === 'INSERT') {
            return [...prev, payload.new];
          }
          if (payload.eventType === 'UPDATE') {
            return prev.map((p) => (p.id === payload.new.id ? payload.new : p));
          }
          if (payload.eventType === 'DELETE') {
            return prev.filter((p) => p.id !== payload.old.id);
          }
          return prev;
        });
      })
      .eq('game_session_id', gameSession.id)
      .subscribe();

    return () => {
      supabase.removeAllChannels();
    };
  }, [gameSession, supabase]);

  // Get game session players
  useEffect(() => {
    const fetchPlayers = async () => {
      if (!gameSession) return;

      const { data, error } = await supabase.from('game_players').select('*').eq('game_session_id', gameSession.id);

      if (!error && data) {
        // Get profile info for each player
        const playersWithProfiles = await Promise.all(
          data.map(async (player) => {
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', player.player_id).single();
            return { ...player, profile };
          })
        );
        setPlayers(playersWithProfiles);
      }
    };

    if (gameSession) {
      fetchPlayers();
    }
  }, [gameSession, supabase]);

  // Manage game flow
  useEffect(() => {
    if (!gameSession) return;

    if (gameSession.status === 'waiting') {
      setGameScreenState('theme_voting');
    } else if (gameSession.status === 'in_progress') {
      fetchCurrentRound();
    } else if (gameSession.status === 'finished') {
      setGameScreenState('game_over');
    }
  }, [gameSession]);

  // Subscribe to current round changes
  useEffect(() => {
    if (!gameSession) return;

    const subscription = supabase
      .from('rounds')
      .on('*', (payload) => {
        if (payload.new) {
          setCurrentRound(payload.new);
        }
      })
      .eq('game_session_id', gameSession.id)
      .order('round_number', { ascending: false })
      .limit(1)
      .subscribe();

    return () => {
      supabase.removeAllChannels();
    };
  }, [gameSession, supabase]);

  // Fetch current round
  const fetchCurrentRound = useCallback(async () => {
    if (!gameSession) return;

    const { data, error } = await supabase
      .from('rounds')
      .select('*')
      .eq('game_session_id', gameSession.id)
      .order('round_number', { ascending: false })
      .limit(1)
      .single();

    if (!error && data) {
      setCurrentRound(data);
      handleRoundStatus(data.status);
    }
  }, [gameSession, supabase]);

  // Handle round status changes
  const handleRoundStatus = useCallback((status: RoundStatus) => {
    switch (status) {
      case 'answering':
        setGameScreenState('question');
        setTimeLeft(ANSWER_TIME_SECONDS);
        break;
      case 'voting':
        setGameScreenState('voting');
        setTimeLeft(VOTE_TIME_SECONDS);
        break;
      case 'results':
        setGameScreenState('results');
        break;
      default:
        setGameScreenState('loading');
    }
  }, []);

  // Timer effect
  useEffect(() => {
    if (gameScreenState !== 'question' && gameScreenState !== 'voting') return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameScreenState]);

  // Fetch player answers
  useEffect(() => {
    if (!currentRound) return;

    const fetchAnswers = async () => {
      const { data, error } = await supabase.from('player_answers').select('*').eq('round_id', currentRound.id);

      if (!error && data) {
        setPlayerAnswers(data);
        // Shuffle answers for voting
        const shuffled = shuffleAnswers(data, currentRound);
        setShuffledAnswers(shuffled);
      }
    };

    if (gameScreenState === 'voting') {
      fetchAnswers();
    }
  }, [gameScreenState, currentRound, supabase]);

  // Helper to shuffle answers
  const shuffleAnswers = (answers: PlayerAnswer[], round: Round): ShuffledAnswer[] => {
    const result: ShuffledAnswer[] = [
      {
        id: 'correct',
        letter: 'A',
        text: round.ai_correct_answer,
        type: 'ai_correct',
      },
      {
        id: 'creative',
        letter: 'B',
        text: round.ai_creative_answer,
        type: 'ai_creative',
      },
      ...answers.map((answer, idx) => ({
        id: answer.id,
        letter: String.fromCharCode(67 + idx), // C, D, E, etc
        text: answer.answer_text,
        type: 'player' as const,
        owner_id: answer.player_id,
      })),
    ];

    return shuffleArray(result);
  };

  const handleThemeSelection = async (themeId: ThemeId) => {
    if (!gameSession || !userId) return;

    // Create a new round
    const { data: newRound, error } = await supabase.from('rounds').insert({
      game_session_id: gameSession.id,
      round_number: gameSession.current_round + 1,
      theme: themeId,
      difficulty: gameSession.difficulty,
      question_text: 'Generating question...',
      ai_correct_answer: 'Loading...',
      ai_creative_answer: 'Loading...',
      status: 'answering',
      answer_deadline: new Date(Date.now() + ANSWER_TIME_SECONDS * 1000).toISOString(),
    });

    if (error) {
      console.error('Error creating round:', error);
      return;
    }

    setCurrentRound(newRound[0]);
  };

  const handleAnswerSubmit = async () => {
    if (!currentRound || !userId || !userAnswer.trim()) return;

    const { error } = await supabase.from('player_answers').insert({
      round_id: currentRound.id,
      player_id: userId,
      answer_text: userAnswer,
      response_time_seconds: ANSWER_TIME_SECONDS - timeLeft,
    });

    if (error) {
      console.error('Error submitting answer:', error);
      return;
    }

    setUserAnswer('');
  };

  const handleVoteSubmit = async () => {
    if (!currentRound || !userId) return;

    const { error } = await supabase.from('votes').insert({
      round_id: currentRound.id,
      voter_id: userId,
      voted_answer_id: selectedVotes.answer as string,
      voted_ai_correct: selectedVotes.correct === true,
      voted_ai_creative: selectedVotes.creative === true,
    });

    if (error) {
      console.error('Error submitting vote:', error);
      return;
    }

    setSelectedVotes({});
  };

  // Render different screens based on game state
  if (!gameSession || !userId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-oxe-orange to-oxe-yellow">
        <div className="text-center">
          <div className="text-4xl mb-4">🐪</div>
          <div className="text-xl font-fredoka text-oxe-navy">Carregando jogo...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-oxe-orange to-oxe-yellow p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header with score */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-fredoka text-oxe-navy">OxeJogos</h1>
            <div className="text-right">
              <div className="text-sm text-gray-600">Rodada {gameSession.current_round}</div>
              <div className="text-lg font-bold text-oxe-orange">Pontos: {players.find((p) => p.player_id === userId)?.total_score || 0}</div>
            </div>
          </div>
        </div>

        {/* Board component */}
        {gameScreenState !== 'loading' && <GameBoard players={players} boardSize={gameSession.board_size} userId={userId} />}

        {/* Theme voting screen */}
        {gameScreenState === 'theme_voting' && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-fredoka text-oxe-navy text-center mb-6">Escolha um Tema</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => handleThemeSelection(theme.id as ThemeId)}
                  className="bg-gradient-to-b from-oxe-beige to-oxe-light-orange rounded-lg p-4 border-2 border-oxe-orange hover:shadow-lg transition-all"
                >
                  <div className="text-3xl mb-2">{theme.emoji}</div>
                  <div className="font-fredoka text-oxe-navy text-sm font-bold">{theme.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Question screen */}
        {gameScreenState === 'question' && currentRound && (
          <AnimatePresence>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-fredoka text-oxe-navy flex-1">{currentRound.question_text}</h2>
                <div className="text-2xl font-bold text-oxe-orange ml-4">{formatTime(timeLeft)}</div>
              </div>

              <div className="mb-4">
                <textarea
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  placeholder="Sua resposta aqui..."
                  className="w-full px-4 py-2 border-2 border-oxe-orange rounded-lg font-nunito focus:outline-none focus:ring-2 focus:ring-oxe-navy"
                  rows={3}
                />
              </div>

              <button
                onClick={handleAnswerSubmit}
                disabled={!userAnswer.trim()}
                className="w-full bg-oxe-orange hover:bg-oxe-dark-orange text-white font-fredoka py-3 rounded-lg disabled:opacity-50 transition-all"
              >
                Enviar Resposta
              </button>
            </motion.div>
          </AnimatePresence>
        )}

        {/* Voting screen */}
        {gameScreenState === 'voting' && currentRound && (
          <AnimatePresence>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-fredoka text-oxe-navy">Vote na melhor resposta</h2>
                <div className="text-2xl font-bold text-oxe-orange">{formatTime(timeLeft)}</div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {shuffledAnswers.map((answer) => (
                  <button
                    key={answer.id}
                    onClick={() => setSelectedVotes({ answer: answer.id })}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      selectedVotes.answer === answer.id
                        ? 'bg-oxe-orange border-oxe-dark-orange text-white'
                        : 'bg-oxe-beige border-oxe-orange hover:bg-oxe-light-orange'
                    }`}
                  >
                    <div className="font-fredoka font-bold mb-1">
                      {answer.letter}. {answer.type === 'player' ? `${players.find((p) => p.id === answer.owner_id)?.profile?.full_name || 'Jogador'}'s answer` : answer.type === 'ai_correct' ? 'IA - Resposta Correta' : 'IA - Resposta Criativa'}
                    </div>
                    <div className="font-nunito">{answer.text}</div>
                  </button>
                ))}
              </div>

              <button
                onClick={handleVoteSubmit}
                disabled={!selectedVotes.answer}
                className="w-full bg-oxe-orange hover:bg-oxe-dark-orange text-white font-fredoka py-3 rounded-lg disabled:opacity-50 transition-all mt-4"
              >
                Votar
              </button>
            </motion.div>
          </AnimatePresence>
        )}

        {/* Results screen */}
        {gameScreenState === 'results' && currentRound && (
          <AnimatePresence>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-2xl font-fredoka text-oxe-navy text-center mb-6">Resultado da Rodada</h2>
              <div className="text-center mb-6">
                <div className="text-3xl font-bold text-oxe-orange mb-2">{currentRound.ai_correct_answer}</div>
                <div className="text-gray-600 font-nunito">Resposta Correta</div>
              </div>

              <div className="space-y-3 mb-6">
                {roundScores.map((score) => {
                  const player = players.find((p) => p.id === score.player_id);
                  return (
                    <div key={score.id} className="bg-oxe-beige rounded-lg p-4 flex justify-between items-center">
                      <div className="font-fredoka text-oxe-navy font-bold">{player?.profile?.full_name || 'Jogador'}</div>
                      <div className="text-lg font-bold text-oxe-orange">+{score.total_round_points} pts</div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={fetchCurrentRound}
                className="w-full bg-oxe-orange hover:bg-oxe-dark-orange text-white font-fredoka py-3 rounded-lg transition-all"
              >
                Próxima Rodada
              </button>
            </motion.div>
          </AnimatePresence>
        )}

        {/* Game over screen */}
        {gameScreenState === 'game_over' && (
          <AnimatePresence>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-3xl font-fredoka text-oxe-navy text-center mb-6">Fim de Jogo!</h2>
              <div className="space-y-3 mb-6">
                {players
                  .sort((a, b) => b.total_score - a.total_score)
                  .map((player, idx) => (
                    <div key={player.id} className="bg-oxe-beige rounded-lg p-4 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl font-bold text-oxe-orange">#{idx + 1}</div>
                        <div className="font-fredoka text-oxe-navy font-bold">{player.profile?.full_name || 'Jogador'}</div>
                      </div>
                      <div className="text-lg font-bold text-oxe-orange">{player.total_score} pts</div>
                    </div>
                  ))}
              </div>

              <button
                onClick={() => router.push('/')}
                className="w-full bg-oxe-orange hover:bg-oxe-dark-orange text-white font-fredoka py-3 rounded-lg transition-all"
              >
                Voltar ao Início
              </button>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}