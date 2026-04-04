'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useGameStore } from '@/hooks/useGameStore';
import { formatTime, isSurpriseHouse, getPointsDescription, shuffleArray } from '@/lib/utils';
import type { GameSession, GamePlayer, Round, PlayerAnswer, Vote, RoundScore, ShuffledAnswer, ThemeId } from '@/types/game';
import { THEMES, GAME_MODE_CONFIG, DIFFICULTY_CONFIG, ANSWER_TIME_SECONDS, VOTE_TIME_SECONDS } from '@/types/game';

type GameScreenState = 'loading' | 'theme_voting' | 'question' | 'voting' | 'results' | 'game_over' | 'surprise_house';

interface CurrentScreen {
  state: GameScreenState;
  data?: any;
}

export default function GamePage() {
  const router = useRouter();
  const supabase = createClient();
  const gameStore = useGameStore();

  const [user, setUser] = useState<any>(null);
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [answers, setAnswers] = useState<PlayerAnswer[]>([]);
  const [userAnswer, setUserAnswer] = useState<string>('');
  const [shuffledAnswers, setShuffledAnswers] = useState<ShuffledAnswer[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [currentScreen, setCurrentScreen] = useState<CurrentScreen>({ state: 'loading' });
  const [selectedTheme, setSelectedTheme] = useState<ThemeId | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [showAICreativeToggle, setShowAICreativeToggle] = useState(false);
  const [roundScores, setRoundScores] = useState<RoundScore[]>([]);

  // Initialize
  useEffect(() => {
    const initialize = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        router.push('/auth');
        return;
      }

      setUser(authUser);
      const gameSessionId = sessionStorage.getItem('gameSessionId');

      if (!gameSessionId) {
        router.push('/lobby');
        return;
      }

      // Fetch game session
      const { data: session } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('id', gameSessionId)
        .single();

      if (session) {
        setGameSession(session);
        gameStore.setSession(session);

        // Determine initial screen
        if (session.status === 'theme_selection') {
          setCurrentScreen({ state: 'theme_voting' });
        } else if (session.status === 'in_progress') {
          setCurrentScreen({ state: 'question' });
        }
      }
    };

    initialize();
  }, [supabase, router, gameStore]);

  // Subscribe to game updates
  useEffect(() => {
    if (!gameSession) return;

    const subscription = supabase
      .channel(`game_${gameSession.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${gameSession.id}` },
        (payload) => {
          const updated = payload.new as GameSession;
          setGameSession(updated);

          if (updated.status === 'in_progress') {
            setCurrentScreen({ state: 'question' });
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [gameSession, supabase]);

  // Timer effect
  useEffect(() => {
    if (timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining]);

  // Handle theme selection
  const handleSelectTheme = async () => {
    if (!selectedTheme || !gameSession) return;

    await supabase.from('rounds').insert({
      game_session_id: gameSession.id,
      round_number: gameSession.current_round + 1,
      theme: selectedTheme,
      difficulty: gameSession.difficulty,
      question_text: 'Gerando pergunta...',
      ai_correct_answer: '',
      ai_creative_answer: '',
      status: 'answering',
      answer_deadline: new Date(Date.now() + ANSWER_TIME_SECONDS * 1000).toISOString(),
    });

    setCurrentScreen({ state: 'question' });
    setTimeRemaining(ANSWER_TIME_SECONDS);
  };

  // Handle answer submission
  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim() || !currentRound || !user) return;

    const { error } = await supabase.from('player_answers').insert({
      round_id: currentRound.id,
      player_id: user.id,
      answer_text: userAnswer,
      response_time_seconds: ANSWER_TIME_SECONDS - timeRemaining,
    });

    if (!error) {
      setUserAnswer('');
      setCurrentScreen({ state: 'voting' });
      setTimeRemaining(VOTE_TIME_SECONDS);
    }
  };

  // Handle vote submission
  const handleSubmitVote = async () => {
    if (!currentRound || !user) return;

    const { error } = await supabase.from('votes').insert({
      round_id: currentRound.id,
      voter_id: user.id,
      voted_answer_id: selectedAnswers[0],
      voted_ai_correct: selectedAnswers.includes('ai_correct'),
      voted_ai_creative: selectedAnswers.includes('ai_creative'),
    });

    if (!error) {
      setCurrentScreen({ state: 'results' });
      setSelectedAnswers([]);
    }
  };

  // Handle game over
  const handleGameOver = () => {
    router.push('/lobby');
  };

  const renderScreen = () => {
    switch (currentScreen.state) {
      case 'loading':
        return (
          <div className="min-h-screen bg-gradient-to-b from-oxe-light to-white flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-4 animate-bounce">\ud83c\udfae</div>
              <p className="font-fredoka text-xl text-oxe-navy">Preparando o jogo...</p>
            </div>
          </div>
        );

      case 'theme_voting':
        return (
          <div className="min-h-screen bg-gradient-to-b from-oxe-light via-white to-gray-50 px-4 py-8">
            <div className="max-w-6xl mx-auto">
              <h1 className="text-4xl font-fredoka font-bold text-center text-oxe-navy mb-2">
                Escolha o Tema
              </h1>
              <p className="text-center text-gray-600 font-nunito mb-12">
                Qual ser\u00e1 o tema dessa rodada?
              </p>

              <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                {THEMES.map((theme) => (
                  <motion.button
                    key={theme.id}
                    onClick={() => setSelectedTheme(theme.id as ThemeId)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`p-6 rounded-xl transition-all border-3 ${
                      selectedTheme === theme.id
                        ? 'bg-oxe-blue text-white border-oxe-blue shadow-lg'
                        : 'bg-white text-gray-800 border-gray-200 hover:border-oxe-blue'
                    }`}
                  >
                    <div className="text-3xl mb-2">{theme.emoji}</div>
                    <p className="font-fredoka text-sm">{theme.name}</p>
                  </motion.button>
                ))}
              </div>

              <button
                onClick={handleSelectTheme}
                disabled={!selectedTheme}
                className="w-full px-6 py-4 bg-oxe-gold text-oxe-navy rounded-lg font-fredoka font-bold text-lg hover:bg-opacity-90 transition-all disabled:opacity-50"
              >
                Come\u00e7ar Rodada
              </button>
            </div>
          </div>
        );

      case 'question':
        return (
          <div className="min-h-screen bg-gradient-to-b from-oxe-light via-white to-gray-50 px-4 py-8">
            <div className="max-w-4xl mx-auto">
              {/* Header with timer */}
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-fredoka text-oxe-navy">Responda a pergunta</h2>
                <div className="text-3xl font-fredoka text-oxe-blue">
                  {formatTime(timeRemaining)}
                </div>
              </div>

              {/* Game board preview */}
              <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
                <div className="bg-oxe-blue text-white rounded-lg p-6 mb-6">
                  <p className="text-sm text-oxe-light font-nunito mb-2">Pergunta</p>
                  <p className="text-xl font-fredoka text-white">
                    {currentRound?.question_text || 'Carregando pergunta...'}
                  </p>
                </div>

                <div className="space-y-4">
                  <label className="block text-sm font-fredoka font-semibold text-oxe-navy">
                    Sua Resposta
                  </label>
                  <textarea
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    placeholder="Digite sua resposta aqui..."
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg font-nunito focus:border-oxe-blue focus:bg-oxe-light transition-all resize-none h-24"
                  />

                  <button
                    onClick={handleSubmitAnswer}
                    disabled={!userAnswer.trim()}
                    className="w-full px-6 py-3 bg-oxe-blue text-white rounded-lg font-fredoka font-bold hover:bg-opacity-90 transition-all disabled:opacity-50"
                  >
                    Enviar Resposta
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      case 'voting':
        return (
          <div className="min-h-screen bg-gradient-to-b from-oxe-light via-white to-gray-50 px-4 py-8">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-fredoka text-oxe-navy">Vote na melhor resposta</h2>
                <div className="text-3xl font-fredoka text-oxe-blue">
                  {formatTime(timeRemaining)}
                </div>
              </div>

              <div className="space-y-4 mb-8">
                {shuffledAnswers.map((answer) => (
                  <motion.button
                    key={answer.id}
                    onClick={() =>
                      setSelectedAnswers(
                        selectedAnswers.includes(answer.id)
                          ? selectedAnswers.filter((id) => id !== answer.id)
                          : [...selectedAnswers, answer.id]
                      )
                    }
                    whileHover={{ scale: 1.02 }}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                      selectedAnswers.includes(answer.id)
                        ? 'bg-oxe-blue text-white border-oxe-blue'
                        : 'bg-white text-gray-800 border-gray-300 hover:border-oxe-blue'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-fredoka font-bold ${
                          selectedAnswers.includes(answer.id)
                            ? 'bg-white text-oxe-blue'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {answer.letter}
                      </div>
                      <p className="font-nunito flex-1">{answer.text}</p>
                    </div>
                  </motion.button>
                ))}
              </div>

              <button
                onClick={handleSubmitVote}
                disabled={selectedAnswers.length === 0}
                className="w-full px-6 py-3 bg-oxe-gold text-oxe-navy rounded-lg font-fredoka font-bold hover:bg-opacity-90 transition-all disabled:opacity-50"
              >
                Confirmar Voto
              </button>
            </div>
          </div>
        );

      case 'results':
        return (
          <div className="min-h-screen bg-gradient-to-b from-oxe-light via-white to-gray-50 px-4 py-8">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-fredoka text-center text-oxe-navy mb-8">
                Resultado da Rodada
              </h2>

              <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
                <p className="text-lg font-nunito text-center text-gray-700 mb-8">
                  A resposta correta era:
                </p>
                <p className="text-2xl font-fredoka text-center text-oxe-blue mb-12">
                  {currentRound?.ai_correct_answer}
                </p>

                <h3 className="text-xl font-fredoka text-oxe-navy mb-4">
                  Placar da Rodada
                </h3>
                <div className="space-y-3">
                  {roundScores.map((score, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-4 bg-oxe-light rounded-lg"
                    >
                      <div>
                        <p className="font-fredoka text-oxe-navy">
                          {players.find((p) => p.player_id === score.player_id)?.profile?.full_name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-fredoka text-oxe-blue">
                          +{score.total_round_points}
                        </p>
                        <p className="text-xs text-gray-600 font-nunito">
                          {getPointsDescription(score.total_round_points)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setCurrentScreen({ state: 'theme_voting' })}
                className="w-full px-6 py-4 bg-oxe-blue text-white rounded-lg font-fredoka font-bold text-lg hover:bg-opacity-90 transition-all"
              >
                Pr\u00f3xima Rodada
              </button>
            </div>
          </div>
        );

      case 'game_over':
        return (
          <div className="min-h-screen bg-gradient-to-b from-oxe-navy to-oxe-blue flex items-center justify-center px-4 py-8">
            <div className="max-w-2xl w-full text-center text-white">
              <div className="text-7xl mb-6">\ud83c\udfc6</div>
              <h1 className="text-5xl font-fredoka font-bold mb-4">Jogo Finalizado!</h1>

              <div className="bg-white bg-opacity-20 rounded-xl p-8 mb-8">
                <p className="text-xl font-nunito mb-4">Campe\u00e3o da Partida</p>
                <p className="text-3xl font-fredoka">
                  {players.reduce((winner, player) =>
                    player.total_score > winner.total_score ? player : winner
                  )?.profile?.full_name}
                </p>
              </div>

              <div className="space-y-4 mb-8">
                {players
                  .sort((a, b) => b.total_score - a.total_score)
                  .map((player, idx) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between bg-white bg-opacity-10 rounded-lg p-4"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-2xl font-fredoka w-8">{idx + 1}\u00ba</span>
                        <p className="font-fredoka">{player.profile?.full_name}</p>
                      </div>
                      <p className="text-xl font-fredoka">
                        {player.total_score} pts
                      </p>
                    </div>
                  ))}
              </div>

              <button
                onClick={handleGameOver}
                className="w-full px-6 py-4 bg-oxe-gold text-oxe-navy rounded-lg font-fredoka font-bold text-lg hover:bg-opacity-90 transition-all"
              >
                Voltar ao Lobby
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <AnimatePresence mode="wait">
      {renderScreen()}
    </AnimatePresence>
  );
}
