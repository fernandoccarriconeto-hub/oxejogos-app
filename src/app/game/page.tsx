'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { formatTime, shuffleArray } from '@/lib/utils';
import type { GameSession, GamePlayer, Round, PlayerAnswer, RoundScore, ShuffledAnswer, ThemeId } from '@/types/game';
import { THEMES, ANSWER_TIME_SECONDS, VOTE_TIME_SECONDS } from '@/types/game';

type GameScreenState = 'loading' | 'theme_voting' | 'waiting_question' | 'question' | 'waiting_votes' | 'voting' | 'results' | 'game_over';

export default function GamePage() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<any>(null);
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [userAnswer, setUserAnswer] = useState<string>('');
  const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
  const [shuffledAnswers, setShuffledAnswers] = useState<ShuffledAnswer[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [currentScreen, setCurrentScreen] = useState<GameScreenState>('loading');
  const [selectedTheme, setSelectedTheme] = useState<ThemeId | null>(null);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [roundScores, setRoundScores] = useState<RoundScore[]>([]);
  const [isMyTurnToPick, setIsMyTurnToPick] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch players with profiles
  const fetchPlayers = useCallback(async (sessionId: string) => {
    const { data: playersData } = await supabase
      .from('game_players')
      .select('*')
      .eq('game_session_id', sessionId);

    if (!playersData) return;

    const playerIds = playersData.map((p) => p.player_id);
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', playerIds);

    const profileMap = new Map(profilesData?.map((p) => [p.id, p]) || []);
    const merged = playersData.map((player) => ({
      ...player,
      profile: profileMap.get(player.player_id) || null,
    }));

    setPlayers(merged);
  }, [supabase]);

  // Initialize
  useEffect(() => {
    const initialize = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push('/auth'); return; }
      setUser(authUser);

      const gameSessionId = sessionStorage.getItem('gameSessionId');
      if (!gameSessionId) { router.push('/lobby'); return; }

      // Fetch game session
      const { data: session } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('id', gameSessionId)
        .single();

      if (!session) { router.push('/lobby'); return; }

      setGameSession(session);
      await fetchPlayers(session.id);

      // Check if it's my turn to pick theme
      const myTurn = session.theme_picker_order?.[session.current_theme_picker_index] === authUser.id;
      setIsMyTurnToPick(myTurn);

      // Determine initial screen based on game status
      if (session.status === 'theme_selection') {
        // Check if there's already an active round
        const { data: activeRound } = await supabase
          .from('rounds')
          .select('*')
          .eq('game_session_id', session.id)
          .eq('round_number', session.current_round)
          .single();

        if (activeRound) {
          setCurrentRound(activeRound);
          if (activeRound.status === 'answering' && activeRound.question_text !== 'Gerando pergunta...') {
            setCurrentScreen('question');
            const deadline = new Date(activeRound.answer_deadline || '').getTime();
            const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
            setTimeRemaining(remaining);
          } else if (activeRound.status === 'voting') {
            await loadShuffledAnswers(activeRound);
            setCurrentScreen('voting');
            const deadline = new Date(activeRound.vote_deadline || '').getTime();
            const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
            setTimeRemaining(remaining);
          } else if (activeRound.status === 'results') {
            setCurrentScreen('results');
          } else {
            setCurrentScreen('theme_voting');
          }
        } else {
          setCurrentScreen('theme_voting');
        }
      } else if (session.status === 'finished') {
        setCurrentScreen('game_over');
      }
    };

    initialize();
  }, [supabase, router, fetchPlayers]);

  // Load shuffled answers for voting
  const loadShuffledAnswers = async (round: Round) => {
    const { data: playerAnswers } = await supabase
      .from('player_answers')
      .select('*')
      .eq('round_id', round.id);

    const answers: ShuffledAnswer[] = [];
    const letters = 'ABCDEFGHIJKLMNOP';
    let letterIdx = 0;

    // Add player answers
    if (playerAnswers) {
      playerAnswers.forEach((pa) => {
        // Don't show own answer for voting
        answers.push({
          id: pa.id,
          letter: letters[letterIdx++],
          text: pa.answer_text,
          type: 'player',
          owner_id: pa.player_id,
        });
      });
    }

    // Add AI correct answer
    if (round.ai_correct_answer) {
      answers.push({
        id: `ai_correct_${round.id}`,
        letter: letters[letterIdx++],
        text: round.ai_correct_answer,
        type: 'ai_correct',
      });
    }

    // Add AI creative answer
    if (round.ai_creative_answer) {
      answers.push({
        id: `ai_creative_${round.id}`,
        letter: letters[letterIdx++],
        text: round.ai_creative_answer,
        type: 'ai_creative',
      });
    }

    setShuffledAnswers(shuffleArray(answers).map((a, i) => ({ ...a, letter: letters[i] })));
  };

  // Subscribe to game updates via Realtime
  useEffect(() => {
    if (!gameSession) return;

    const channel = supabase
      .channel(`game_realtime_${gameSession.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'game_sessions',
        filter: `id=eq.${gameSession.id}`,
      }, (payload) => {
        const updated = payload.new as GameSession;
        setGameSession(updated);
        if (updated.status === 'finished') {
          setCurrentScreen('game_over');
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'rounds',
        filter: `game_session_id=eq.${gameSession.id}`,
      }, (payload) => {
        const newRound = payload.new as Round;
        setCurrentRound(newRound);
        if (newRound.question_text && newRound.question_text !== 'Gerando pergunta...') {
          setCurrentScreen('question');
          setTimeRemaining(ANSWER_TIME_SECONDS);
          setHasSubmittedAnswer(false);
          setUserAnswer('');
        } else {
          setCurrentScreen('waiting_question');
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'rounds',
        filter: `game_session_id=eq.${gameSession.id}`,
      }, async (payload) => {
        const updatedRound = payload.new as Round;
        setCurrentRound(updatedRound);

        if (updatedRound.status === 'answering' && updatedRound.question_text !== 'Gerando pergunta...') {
          setCurrentScreen('question');
          const deadline = new Date(updatedRound.answer_deadline || '').getTime();
          const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
          setTimeRemaining(remaining > 0 ? remaining : ANSWER_TIME_SECONDS);
          setHasSubmittedAnswer(false);
          setUserAnswer('');
        } else if (updatedRound.status === 'voting') {
          await loadShuffledAnswers(updatedRound);
          setCurrentScreen('voting');
          setTimeRemaining(VOTE_TIME_SECONDS);
          setSelectedVote(null);
        } else if (updatedRound.status === 'results') {
          // Fetch round scores
          const { data: scores } = await supabase
            .from('round_scores')
            .select('*')
            .eq('round_id', updatedRound.id);
          if (scores) setRoundScores(scores);
          setCurrentScreen('results');
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [gameSession?.id, supabase]);

  // Timer effect
  useEffect(() => {
    if (timeRemaining <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timeRemaining]);

  // Handle theme selection and generate question
  const handleSelectTheme = async () => {
    if (!selectedTheme || !gameSession || !user) return;

    setCurrentScreen('waiting_question');

    // Create the round
    const { data: roundData, error: roundError } = await supabase
      .from('rounds')
      .insert({
        game_session_id: gameSession.id,
        round_number: gameSession.current_round,
        theme: selectedTheme,
        difficulty: gameSession.difficulty,
        question_text: 'Gerando pergunta...',
        ai_correct_answer: '',
        ai_creative_answer: '',
        status: 'answering',
        answer_deadline: new Date(Date.now() + (ANSWER_TIME_SECONDS + 10) * 1000).toISOString(),
      })
      .select()
      .single();

    if (roundError || !roundData) {
      console.error('Error creating round:', roundError);
      setCurrentScreen('theme_voting');
      return;
    }

    setCurrentRound(roundData);

    // Call AI to generate question
    try {
      const themeName = THEMES.find((t) => t.id === selectedTheme)?.name || selectedTheme;
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: themeName,
          difficulty: gameSession.difficulty,
        }),
      });

      if (!res.ok) throw new Error('AI generation failed');

      const aiData = await res.json();

      // Update the round with the actual question and answers
      await supabase
        .from('rounds')
        .update({
          question_text: aiData.question,
          ai_correct_answer: aiData.correctAnswer,
          ai_creative_answer: aiData.creativeAnswer,
          answer_deadline: new Date(Date.now() + ANSWER_TIME_SECONDS * 1000).toISOString(),
        })
        .eq('id', roundData.id);

    } catch (error) {
      console.error('Error generating question:', error);
      // Fallback question
      await supabase
        .from('rounds')
        .update({
          question_text: 'Qual é a capital do Brasil?',
          ai_correct_answer: 'Brasília',
          ai_creative_answer: 'São Paulo, por ser a maior cidade',
          answer_deadline: new Date(Date.now() + ANSWER_TIME_SECONDS * 1000).toISOString(),
        })
        .eq('id', roundData.id);
    }
  };

  // Handle answer submission
  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim() || !currentRound || !user || hasSubmittedAnswer) return;

    const { error } = await supabase.from('player_answers').insert({
      round_id: currentRound.id,
      player_id: user.id,
      answer_text: userAnswer.trim(),
      response_time_seconds: ANSWER_TIME_SECONDS - timeRemaining,
    });

    if (!error) {
      setHasSubmittedAnswer(true);
      setUserAnswer('');
    }
  };

  // Handle moving to voting phase (captain action)
  const handleMoveToVoting = async () => {
    if (!currentRound || !gameSession || gameSession.captain_id !== user?.id) return;

    await supabase
      .from('rounds')
      .update({
        status: 'voting',
        vote_deadline: new Date(Date.now() + VOTE_TIME_SECONDS * 1000).toISOString(),
      })
      .eq('id', currentRound.id);
  };

  // Handle vote submission
  const handleSubmitVote = async () => {
    if (!currentRound || !user || !selectedVote) return;

    const isAiCorrect = selectedVote.startsWith('ai_correct_');
    const isAiCreative = selectedVote.startsWith('ai_creative_');

    const { error } = await supabase.from('votes').insert({
      round_id: currentRound.id,
      voter_id: user.id,
      voted_answer_id: (!isAiCorrect && !isAiCreative) ? selectedVote : null,
      voted_ai_correct: isAiCorrect,
      voted_ai_creative: isAiCreative,
    });

    if (!error) {
      setCurrentScreen('waiting_votes');
    }
  };

  // Handle calculate scores (captain action)
  const handleCalculateScores = async () => {
    if (!currentRound || !gameSession || gameSession.captain_id !== user?.id) return;

    try {
      const res = await fetch('/api/game/calculate-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId: currentRound.id }),
      });

      if (res.ok) {
        const data = await res.json();

        // Update round status to results
        await supabase
          .from('rounds')
          .update({ status: 'results' })
          .eq('id', currentRound.id);

        if (data.gameFinished) {
          await supabase
            .from('game_sessions')
            .update({ status: 'finished', finished_at: new Date().toISOString() })
            .eq('id', gameSession.id);
        }
      }
    } catch (error) {
      console.error('Error calculating scores:', error);
    }
  };

  // Handle next round
  const handleNextRound = async () => {
    if (!gameSession || gameSession.captain_id !== user?.id) return;

    const nextPickerIndex = (gameSession.current_theme_picker_index + 1) % gameSession.theme_picker_order.length;

    await supabase
      .from('game_sessions')
      .update({
        current_round: gameSession.current_round + 1,
        current_theme_picker_index: nextPickerIndex,
      })
      .eq('id', gameSession.id);

    setCurrentScreen('theme_voting');
    setSelectedTheme(null);
    setCurrentRound(null);
    setShuffledAnswers([]);
    setRoundScores([]);
    setHasSubmittedAnswer(false);
  };

  // Check if user is captain
  const isCaptain = gameSession?.captain_id === user?.id;

  const renderScreen = () => {
    switch (currentScreen) {
      case 'loading':
        return (
          <div className="min-h-screen bg-gradient-to-b from-oxe-light to-white flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-4 animate-bounce">🎮</div>
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
              <p className="text-center text-gray-600 font-nunito mb-4">
                Rodada {gameSession?.current_round || 1}
              </p>
              {isMyTurnToPick ? (
                <p className="text-center text-oxe-blue font-fredoka font-bold mb-8">
                  É a sua vez de escolher!
                </p>
              ) : (
                <p className="text-center text-gray-500 font-nunito mb-8">
                  Aguardando outro jogador escolher o tema...
                </p>
              )}

              {isMyTurnToPick && (
                <>
                  <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
                    {THEMES.map((theme) => (
                      <motion.button
                        key={theme.id}
                        onClick={() => setSelectedTheme(theme.id as ThemeId)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`p-6 rounded-xl transition-all border-2 ${
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
                    Começar Rodada
                  </button>
                </>
              )}
            </div>
          </div>
        );

      case 'waiting_question':
        return (
          <div className="min-h-screen bg-gradient-to-b from-oxe-light to-white flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-4 animate-spin">🤖</div>
              <p className="font-fredoka text-xl text-oxe-navy">A IA está gerando a pergunta...</p>
              <p className="text-gray-500 font-nunito mt-2">Isso pode levar alguns segundos</p>
            </div>
          </div>
        );

      case 'question':
        return (
          <div className="min-h-screen bg-gradient-to-b from-oxe-light via-white to-gray-50 px-4 py-8">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-fredoka text-oxe-navy">
                  {hasSubmittedAnswer ? 'Resposta enviada!' : 'Responda a pergunta'}
                </h2>
                <div className={`text-3xl font-fredoka ${timeRemaining <= 10 ? 'text-red-500 animate-pulse' : 'text-oxe-blue'}`}>
                  {formatTime(timeRemaining)}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
                <div className="bg-oxe-blue text-white rounded-lg p-6 mb-6">
                  <p className="text-sm text-oxe-light font-nunito mb-2">Pergunta</p>
                  <p className="text-xl font-fredoka">
                    {currentRound?.question_text || 'Carregando pergunta...'}
                  </p>
                </div>

                {!hasSubmittedAnswer ? (
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
                ) : (
                  <div className="text-center py-8">
                    <div className="text-5xl mb-4">✅</div>
                    <p className="font-fredoka text-xl text-oxe-navy">Resposta enviada!</p>
                    <p className="text-gray-500 font-nunito mt-2">Aguardando os outros jogadores...</p>
                    {isCaptain && (
                      <button
                        onClick={handleMoveToVoting}
                        className="mt-6 px-6 py-3 bg-oxe-gold text-oxe-navy rounded-lg font-fredoka font-bold hover:bg-opacity-90 transition-all"
                      >
                        Ir para Votação
                      </button>
                    )}
                  </div>
                )}
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
                <div className={`text-3xl font-fredoka ${timeRemaining <= 10 ? 'text-red-500 animate-pulse' : 'text-oxe-blue'}`}>
                  {formatTime(timeRemaining)}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6 mb-4">
                <p className="text-sm text-gray-500 font-nunito mb-2">Pergunta</p>
                <p className="font-fredoka text-oxe-navy">{currentRound?.question_text}</p>
              </div>

              <div className="space-y-4 mb-8">
                {shuffledAnswers
                  .filter((a) => a.owner_id !== user?.id)
                  .map((answer) => (
                  <motion.button
                    key={answer.id}
                    onClick={() => setSelectedVote(answer.id)}
                    whileHover={{ scale: 1.02 }}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                      selectedVote === answer.id
                        ? 'bg-oxe-blue text-white border-oxe-blue'
                        : 'bg-white text-gray-800 border-gray-300 hover:border-oxe-blue'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-fredoka font-bold ${
                        selectedVote === answer.id ? 'bg-white text-oxe-blue' : 'bg-gray-200 text-gray-700'
                      }`}>
                        {answer.letter}
                      </div>
                      <p className="font-nunito flex-1">{answer.text}</p>
                    </div>
                  </motion.button>
                ))}
              </div>

              <button
                onClick={handleSubmitVote}
                disabled={!selectedVote}
                className="w-full px-6 py-3 bg-oxe-gold text-oxe-navy rounded-lg font-fredoka font-bold hover:bg-opacity-90 transition-all disabled:opacity-50"
              >
                Confirmar Voto
              </button>
            </div>
          </div>
        );

      case 'waiting_votes':
        return (
          <div className="min-h-screen bg-gradient-to-b from-oxe-light to-white flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-4">🗳️</div>
              <p className="font-fredoka text-xl text-oxe-navy">Voto registrado!</p>
              <p className="text-gray-500 font-nunito mt-2">Aguardando os outros jogadores votarem...</p>
              {isCaptain && (
                <button
                  onClick={handleCalculateScores}
                  className="mt-6 px-6 py-3 bg-oxe-gold text-oxe-navy rounded-lg font-fredoka font-bold hover:bg-opacity-90 transition-all"
                >
                  Calcular Pontuação
                </button>
              )}
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
                <p className="text-lg font-nunito text-center text-gray-700 mb-4">
                  A resposta correta era:
                </p>
                <p className="text-2xl font-fredoka text-center text-oxe-blue mb-8">
                  {currentRound?.ai_correct_answer}
                </p>

                {roundScores.length > 0 && (
                  <>
                    <h3 className="text-xl font-fredoka text-oxe-navy mb-4">Placar da Rodada</h3>
                    <div className="space-y-3">
                      {roundScores
                        .sort((a, b) => b.total_round_points - a.total_round_points)
                        .map((score, idx) => {
                          const player = players.find((p) => p.player_id === score.player_id);
                          return (
                            <div key={idx} className="flex items-center justify-between p-4 bg-oxe-light rounded-lg">
                              <p className="font-fredoka text-oxe-navy">
                                {(player?.profile as any)?.full_name || 'Jogador'}
                              </p>
                              <p className="text-lg font-fredoka text-oxe-blue">
                                +{score.total_round_points} pts
                              </p>
                            </div>
                          );
                        })}
                    </div>
                  </>
                )}
              </div>

              {isCaptain && (
                <button
                  onClick={handleNextRound}
                  className="w-full px-6 py-4 bg-oxe-blue text-white rounded-lg font-fredoka font-bold text-lg hover:bg-opacity-90 transition-all"
                >
                  Próxima Rodada
                </button>
              )}
              {!isCaptain && (
                <p className="text-center text-gray-500 font-nunito">
                  Aguardando o capitão iniciar a próxima rodada...
                </p>
              )}
            </div>
          </div>
        );

      case 'game_over':
        return (
          <div className="min-h-screen bg-gradient-to-b from-oxe-navy to-oxe-blue flex items-center justify-center px-4 py-8">
            <div className="max-w-2xl w-full text-center text-white">
              <div className="text-7xl mb-6">🏆</div>
              <h1 className="text-5xl font-fredoka font-bold mb-4">Jogo Finalizado!</h1>

              {players.length > 0 && (
                <>
                  <div className="bg-white bg-opacity-20 rounded-xl p-8 mb-8">
                    <p className="text-xl font-nunito mb-4">Campeão da Partida</p>
                    <p className="text-3xl font-fredoka">
                      {(() => {
                        const winner = players.reduce((w, p) => p.total_score > w.total_score ? p : w);
                        return (winner?.profile as any)?.full_name || 'Jogador';
                      })()}
                    </p>
                  </div>

                  <div className="space-y-4 mb-8">
                    {players
                      .sort((a, b) => b.total_score - a.total_score)
                      .map((player, idx) => (
                        <div key={player.id} className="flex items-center justify-between bg-white bg-opacity-10 rounded-lg p-4">
                          <div className="flex items-center gap-4">
                            <span className="text-2xl font-fredoka w-8">{idx + 1}º</span>
                            <p className="font-fredoka">{(player.profile as any)?.full_name || 'Jogador'}</p>
                          </div>
                          <p className="text-xl font-fredoka">{player.total_score} pts</p>
                        </div>
                      ))}
                  </div>
                </>
              )}

              <button
                onClick={() => router.push('/lobby')}
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
      <motion.div key={currentScreen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        {renderScreen()}
      </motion.div>
    </AnimatePresence>
  );
}