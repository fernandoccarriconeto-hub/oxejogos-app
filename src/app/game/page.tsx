
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { formatTime, shuffleArray } from '@/lib/utils';
import type { GameSession, GamePlayer, Round, PlayerAnswer, RoundScore, ShuffledAnswer, ThemeId } from '@/types/game';
import { THEMES, ANSWER_TIME_SECONDS, VOTE_TIME_SECONDS, SURPRISE_HOUSES_INTERVAL, SURPRISE_TIME_SECONDS } from '@/types/game';
import { isSurpriseHouse } from '@/lib/utils';

// Type for surprise multiple choice options
interface SurpriseOption {
  letter: string;
  text: string;
  isCorrect: boolean;
}

type GameScreenState = 'loading' | 'theme_voting' | 'waiting_question' | 'question' | 'waiting_votes' | 'voting' | 'results' | 'surprise' | 'game_over';

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
              {player.name.length > 10 ? player.name.substring(0, 10) + '...' : player.name}
            </span>
          </div>
        ))}
      </div>

      {/* Board grid */}
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {houses.map((house) => {
          const player = players.find((p) => p.current_position === house);
          return (
            <div
              key={house}
              className="aspect-square flex items-center justify-center rounded-lg border-2 border-gray-200 bg-gray-50 font-nunito font-bold text-xs"
            >
              {player ? (
                <div
                  className="w-full h-full rounded-lg flex items-center justify-center text-white transition-all hover:scale-110"
                  style={{ backgroundColor: PLAYER_COLORS[players.indexOf(player) % PLAYER_COLORS.length] }}
                  title={player.name}
                >
                  {house}
                </div>
              ) : (
                <span className="text-gray-400">{house}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Question display component
function QuestionDisplay({ question, theme }: { question: string; theme: ThemeId }) {
  const themeData = THEMES[theme];
  const bgColor = themeData.color;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-xl shadow-lg p-6 mb-4"
      style={{ borderTop: `4px solid ${bgColor}` }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{themeData.emoji}</span>
        <h2 className="text-lg font-fredoka text-gray-700">{themeData.name}</h2>
      </div>
      <p className="text-xl font-nunito text-oxe-navy leading-relaxed">{question}</p>
    </motion.div>
  );
}

// Single answer option component
function AnswerOption({
  option,
  index,
  onSelect,
  disabled,
  isSelected,
  showResult,
  isCorrect,
  selectedCount,
}: {
  option: ShuffledAnswer;
  index: number;
  onSelect: () => void;
  disabled: boolean;
  isSelected: boolean;
  showResult: boolean;
  isCorrect: boolean;
  selectedCount: number;
}) {
  const getBackgroundColor = () => {
    if (showResult) {
      if (isCorrect) return 'bg-green-100 border-green-500';
      if (isSelected) return 'bg-red-100 border-red-500';
    }
    if (isSelected) return 'bg-blue-100 border-blue-500';
    return 'bg-gray-50 border-gray-200';
  };

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      onClick={onSelect}
      disabled={disabled}
      className={`w-full p-4 text-left rounded-lg border-2 transition-all font-nunito ${getBackgroundColor()} ${
        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-opacity-50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="font-bold text-sm mb-1 text-gray-600">{option.letter}</div>
          <p className="text-base text-gray-700">{option.text}</p>
        </div>
        {selectedCount > 0 && (
          <div className="text-xs font-bold bg-gray-800 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">
            {selectedCount}
          </div>
        )}
      </div>
    </motion.button>
  );
}

// Surprise house modal for multiple choice
function SurpriseHouseModal({
  options,
  onSelect,
  disabled,
  selectedLetter,
}: {
  options: SurpriseOption[];
  onSelect: (letter: string) => void;
  disabled: boolean;
  selectedLetter: string | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl p-8 max-w-md w-full shadow-2xl"
      >
        <h2 className="text-3xl font-fredoka text-white mb-2 text-center">Casa de Surpresa!</h2>
        <p className="text-white text-center mb-6 text-sm">Escolha uma alternativa:</p>

        <div className="space-y-3">
          {options.map((option) => (
            <motion.button
              key={option.letter}
              whileHover={!disabled ? { scale: 1.05 } : {}}
              whileTap={!disabled ? { scale: 0.95 } : {}}
              onClick={() => onSelect(option.letter)}
              disabled={disabled}
              className={`w-full p-4 rounded-lg font-fredoka text-lg font-bold transition-all ${
                selectedLetter === option.letter
                  ? 'bg-white text-purple-600 scale-105'
                  : 'bg-white/20 text-white hover:bg-white/30'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {option.letter}. {option.text}
            </motion.button>
          ))}
        </div>

        <p className="text-white/80 text-xs text-center mt-6">Você tem {SURPRISE_TIME_SECONDS} segundos para escolher</p>
      </motion.div>
    </motion.div>
  );
}

// Results display component
function ResultsDisplay({
  correct,
  selectedAnswer,
  explanation,
  answersShuffled,
}: {
  correct: string;
  selectedAnswer: string | null;
  explanation: string;
  answersShuffled: ShuffledAnswer[];
}) {
  const correctOption = answersShuffled.find((a) => a.text === correct);
  const selectedOption = answersShuffled.find((a) => a.text === selectedAnswer);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="bg-white rounded-xl shadow-lg p-6 mb-4"
    >
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{selectedAnswer === correct ? '✅' : '❌'}</span>
          <h3 className="text-xl font-fredoka">
            {selectedAnswer === correct ? 'Resposta correta!' : 'Resposta incorreta'}
          </h3>
        </div>
        {selectedAnswer !== correct && (
          <p className="text-sm text-gray-600">
            Você escolheu: <span className="font-bold">{selectedOption?.letter}</span>
          </p>
        )}
      </div>

      <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-gray-600 mb-1">Resposta correta:</p>
        <p className="text-base font-bold text-green-700">
          {correctOption?.letter} - {correct}
        </p>
      </div>

      {explanation && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Explicação:</p>
          <p className="text-sm text-gray-700">{explanation}</p>
        </div>
      )}
    </motion.div>
  );
}

// Voting component
function VotingComponent({
  players,
  currentPlayerId,
  onVoteSubmit,
  submitting,
  hasVoted,
}: {
  players: GamePlayer[];
  currentPlayerId: string | null;
  onVoteSubmit: (votedPlayerId: string) => Promise<void>;
  submitting: boolean;
  hasVoted: boolean;
}) {
  const [selectedVote, setSelectedVote] = useState<string | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="bg-white rounded-xl shadow-lg p-6 mb-4"
    >
      <h3 className="text-lg font-fredoka text-oxe-navy mb-4">Votação - Quem acertou?</h3>

      <div className="grid grid-cols-2 gap-3">
        {players
          .filter((p) => p.player_id !== currentPlayerId)
          .map((player) => (
            <motion.button
              key={player.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setSelectedVote(player.player_id);
                onVoteSubmit(player.player_id);
              }}
              disabled={submitting || hasVoted}
              className={`p-3 rounded-lg font-nunito font-bold transition-all ${
                selectedVote === player.player_id
                  ? 'bg-blue-500 text-white scale-105'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              } ${submitting || hasVoted ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {player.name}
            </motion.button>
          ))}
      </div>

      <p className="text-xs text-gray-500 text-center mt-4">
        {hasVoted ? 'Voto submetido' : 'Clique no nome do jogador'}
      </p>
    </motion.div>
  );
}

// Main Game component
export default function GamePage() {
  const router = useRouter();
  const supabase = createClient();

  // Game state
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [currentScreen, setCurrentScreen] = useState<GameScreenState>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answersShuffled, setAnswersShuffled] = useState<ShuffledAnswer[]>([]);
  const [selectedVoteId, setSelectedVoteId] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<ThemeId | null>(null);
  const [selectedThemeIndex, setSelectedThemeIndex] = useState<number | null>(null);
  const [surpriseModalOpen, setSurpriseModalOpen] = useState(false);
  const [selectedSurpriseAnswer, setSelectedSurpriseAnswer] = useState<string | null>(null);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);

  const roundTimerRef = useRef<NodeJS.Timeout | null>(null);
  const answerTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialization
  useEffect(() => {
    const init = async () => {
      try {
        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push('/');
          return;
        }
        setUserId(user.id);

        // Get game session
        const { data: session, error: sessionError } = await supabase
          .from('game_sessions')
          .select('*')
          .eq('id', localStorage.getItem('gameSessionId'))
          .single();

        if (sessionError || !session) {
          router.push('/lobby');
          return;
        }

        setGameSession(session as GameSession);

        // Subscribe to game session changes
        const sessionChannel = supabase
          .channel(`session:${session.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${session.id}` }, (payload) => {
            if (payload.new) {
              setGameSession(payload.new as GameSession);
            }
          })
          .subscribe();

        // Get all players
        const { data: allPlayers, error: playersError } = await supabase
          .from('game_players')
          .select('*')
          .eq('session_id', session.id);

        if (playersError) {
          console.error('Error fetching players:', playersError);
          return;
        }

        setPlayers(allPlayers as GamePlayer[]);

        const playersChannel = supabase
          .channel(`players:${session.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `session_id=eq.${session.id}` }, (payload) => {
            if (payload.new) {
              setPlayers((prev) => {
                const index = prev.findIndex((p) => p.id === payload.new.id);
                if (index >= 0) {
                  const updated = [...prev];
                  updated[index] = payload.new as GamePlayer;
                  return updated;
                }
                return [...prev, payload.new as GamePlayer];
              });
            }
          })
          .subscribe();

        return () => {
          sessionChannel.unsubscribe();
          playersChannel.unsubscribe();
        };
      } catch (error) {
        console.error('Error initializing game:', error);
      }
    };

    init();
  }, [supabase, router]);

  // Game loop
  useEffect(() => {
    const gameLoop = async () => {
      if (!gameSession || !userId) return;

      // Map screen states to session states
      if (gameSession.state === 'waiting_start') {
        setCurrentScreen('loading');
        return;
      }

      if (gameSession.state === 'theme_voting') {
        setCurrentScreen('theme_voting');
        return;
      }

      if (gameSession.state === 'in_progress') {
        // Check if we're between rounds
        const { data: lastRound, error } = await supabase
          .from('rounds')
          .select('*')
          .eq('session_id', gameSession.id)
          .order('round_number', { ascending: false })
          .limit(1)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching last round:', error);
          return;
        }

        if (!lastRound) {
          // First round - fetch instant questions and create the round
          setCurrentScreen('waiting_question');
          
          try {
            // Fetch questions from database before creating round
            const { data: questionsData, error: questionsError } = await supabase
              .from('questions')
              .select('id, question, theme_id, correct_answer, answers, explanation')
              .eq('theme_id', gameSession.current_theme || 'history')
              .limit(1);

            if (questionsError || !questionsData || questionsData.length === 0) {
              console.error('Error fetching questions:', questionsError);
              return;
            }

            const question = questionsData[0];

            // Create round
            const { data: newRound, error: roundError } = await supabase
              .from('rounds')
              .insert({
                session_id: gameSession.id,
                round_number: 1,
                question_id: question.id,
                theme_id: question.theme_id,
                question: question.question,
                correct_answer: question.correct_answer,
                answers: question.answers,
                explanation: question.explanation,
                state: 'in_progress',
                current_answering_player_id: gameSession.current_turn_player_id,
                created_at: new Date().toISOString(),
              })
              .select()
              .single();

            if (roundError) {
              console.error('Error creating round:', roundError);
              return;
            }

            setCurrentRound(newRound as Round);
          } catch (err) {
            console.error('Error in first round setup:', err);
          }
          return;
        }

        // We have a last round
        setCurrentRound(lastRound as Round);

        if (lastRound.state === 'in_progress') {
          setCurrentScreen('question');
          return;
        }

        if (lastRound.state === 'showing_results') {
          setCurrentScreen('results');
          return;
        }

        if (lastRound.state === 'voting') {
          setCurrentScreen('voting');
          return;
        }

        if (lastRound.state === 'finished') {
          // Check if game is over
          const maxRounds = gameSession.max_rounds || 10;
          if (lastRound.round_number >= maxRounds) {
            setCurrentScreen('game_over');
          } else {
            // Start next round - fetch fresh questions again
            setCurrentScreen('waiting_question');
            try {
              const nextRoundNumber = lastRound.round_number + 1;

              // Fetch questions from database before creating round
              const { data: questionsData, error: questionsError } = await supabase
                .from('questions')
                .select('id, question, theme_id, correct_answer, answers, explanation')
                .eq('theme_id', gameSession.current_theme || 'history')
                .limit(1);

              if (questionsError || !questionsData || questionsData.length === 0) {
                console.error('Error fetching questions:', questionsError);
                return;
              }

              const question = questionsData[0];

              // Create round
              const { data: newRound, error: roundError } = await supabase
                .from('rounds')
                .insert({
                  session_id: gameSession.id,
                  round_number: nextRoundNumber,
                  question_id: question.id,
                  theme_id: question.theme_id,
                  question: question.question,
                  correct_answer: question.correct_answer,
                  answers: question.answers,
                  explanation: question.explanation,
                  state: 'in_progress',
                  current_answering_player_id: gameSession.current_turn_player_id,
                  created_at: new Date().toISOString(),
                })
                .select()
                .single();

              if (roundError) {
                console.error('Error creating round:', roundError);
                return;
              }

              setCurrentRound(newRound as Round);
            } catch (err) {
              console.error('Error in next round setup:', err);
            }
          }
        }
      }

      if (gameSession.state === 'finished') {
        setCurrentScreen('game_over');
      }
    };

    gameLoop();
  }, [gameSession, userId, supabase]);

  // Subscribe to round changes
  useEffect(() => {
    if (!gameSession?.id) return;

    const roundsChannel = supabase
      .channel(`rounds:${gameSession.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `session_id=eq.${gameSession.id}` }, (payload) => {
        if (payload.new) {
          const newRound = payload.new as Round;
          setCurrentRound(newRound);

          // Handle surprise houses
          if (newRound.state === 'in_progress' && isSurpriseHouse(newRound.round_number)) {
            setCurrentScreen('surprise');
          }
        }
      })
      .subscribe();

    return () => {
      roundsChannel.unsubscribe();
    };
  }, [gameSession?.id, supabase]);

  // Handle answer submission
  const handleAnswerSubmit = useCallback(
    async (answerText: string) => {
      if (!currentRound || !userId || submittingAnswer) return;

      setSubmittingAnswer(true);
      try {
        const currentPlayer = players.find((p) => p.player_id === userId);
        if (!currentPlayer) return;

        // Save player answer
        const { error: answerError } = await supabase.from('player_answers').insert({
          round_id: currentRound.id,
          player_id: currentPlayer.id,
          answer_text: answerText,
          is_correct: answerText === currentRound.correct_answer,
        });

        if (answerError) {
          console.error('Error submitting answer:', answerError);
          return;
        }

        setSelectedAnswer(answerText);

        // Check if this is the last answer
        const { data: allAnswers } = await supabase
          .from('player_answers')
          .select('*')
          .eq('round_id', currentRound.id);

        if (allAnswers && allAnswers.length === players.length) {
          // All players answered, update round state
          await supabase.from('rounds').update({ state: 'showing_results' }).eq('id', currentRound.id);
        }
      } catch (error) {
        console.error('Error handling answer:', error);
      } finally {
        setSubmittingAnswer(false);
      }
    },
    [currentRound, userId, players, supabase, submittingAnswer],
  );

  // Handle surprise house answer
  const handleSurpriseAnswer = useCallback(
    async (letter: string) => {
      if (!currentRound || !userId || submittingAnswer) return;

      setSubmittingAnswer(true);
      try {
        const selectedOption = (currentRound.surprise_options || []).find((opt) => opt.letter === letter);
        if (!selectedOption) return;

        const currentPlayer = players.find((p) => p.player_id === userId);
        if (!currentPlayer) return;

        // Save answer
        const { error: answerError } = await supabase.from('player_answers').insert({
          round_id: currentRound.id,
          player_id: currentPlayer.id,
          answer_text: selectedOption.text,
          is_correct: selectedOption.isCorrect,
        });

        if (answerError) {
          console.error('Error submitting surprise answer:', answerError);
          return;
        }

        setSelectedSurpriseAnswer(letter);
        setSurpriseModalOpen(false);

        // Check if all players answered
        const { data: allAnswers } = await supabase
          .from('player_answers')
          .select('*')
          .eq('round_id', currentRound.id);

        if (allAnswers && allAnswers.length === players.length) {
          // All players answered
          await supabase.from('rounds').update({ state: 'showing_results' }).eq('id', currentRound.id);
        }
      } catch (error) {
        console.error('Error handling surprise answer:', error);
      } finally {
        setSubmittingAnswer(false);
      }
    },
    [currentRound, userId, players, supabase, submittingAnswer],
  );

  // Handle vote submission
  const handleVoteSubmit = useCallback(
    async (votedPlayerId: string) => {
      if (!currentRound || !userId) return;

      const currentPlayer = players.find((p) => p.player_id === userId);
      const votedPlayer = players.find((p) => p.player_id === votedPlayerId);

      if (!currentPlayer || !votedPlayer) return;

      try {
        // Save vote
        const { error: voteError } = await supabase.from('votes').insert({
          round_id: currentRound.id,
          voter_id: currentPlayer.id,
          voted_for_id: votedPlayer.id,
        });

        if (voteError) {
          console.error('Error submitting vote:', voteError);
          return;
        }

        setHasVoted(true);
        setSelectedVoteId(votedPlayerId);

        // Check if all players voted
        const { data: allVotes } = await supabase
          .from('votes')
          .select('*')
          .eq('round_id', currentRound.id);

        if (allVotes && allVotes.length === players.length - 1) {
          // All players voted, update round state and calculate scores
          const correctPlayers = players.filter((p) => {
            const answer = (currentRound.player_answers || []).find((a) => a.player_id === p.id);
            return answer?.is_correct;
          });

          const votesByPlayer: { [key: string]: number } = {};
          allVotes.forEach((vote) => {
            votesByPlayer[vote.voted_for_id] = (votesByPlayer[vote.voted_for_id] || 0) + 1;
          });

          // Update scores
          const scoresToInsert: RoundScore[] = correctPlayers.map((player) => ({
            round_id: currentRound.id,
            player_id: player.id,
            correct: true,
            votes_received: votesByPlayer[player.id] || 0,
          }));

          if (scoresToInsert.length > 0) {
            await supabase.from('round_scores').insert(scoresToInsert);
          }

          await supabase.from('rounds').update({ state: 'finished' }).eq('id', currentRound.id);
        }
      } catch (error) {
        console.error('Error handling vote:', error);
      }
    },
    [currentRound, userId, players, supabase],
  );

  // Shuffle answers when round changes
  useEffect(() => {
    if (currentRound && currentRound.answers) {
      const answersArray = Array.isArray(currentRound.answers) ? currentRound.answers : [currentRound.answers];

      const shuffledAnswers: ShuffledAnswer[] = answersArray.map((answer, idx) => ({
        letter: String.fromCharCode(65 + idx),
        text: answer,
      }));

      setAnswersShuffled(shuffleArray(shuffledAnswers));
      setSelectedAnswer(null);
      setHasVoted(false);
      setSelectedVoteId(null);
    }
  }, [currentRound?.id]);

  // Render different screens
  const renderScreen = () => {
    if (!gameSession) return null;

    switch (currentScreen) {
      case 'loading':
        return (
          <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-oxe-navy to-blue-600">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity }}>
              <div className="text-6xl mb-4">🐂</div>
            </motion.div>
            <p className="text-white text-xl font-fredoka">Carregando jogo...</p>
          </div>
        );

      case 'theme_voting':
        return (
          <div className="min-h-screen bg-gradient-to-br from-oxe-navy to-blue-600 p-4 flex flex-col items-center justify-center">
            <h1 className="text-3xl font-fredoka text-white mb-8 text-center">Escolha um Tema</h1>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-2xl w-full">
              {Object.entries(THEMES).map(([themeId, theme], idx) => (
                <motion.button
                  key={themeId}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={async () => {
                    if (!gameSession || !userId) return;

                    const currentPlayer = players.find((p) => p.player_id === userId);
                    if (!currentPlayer) return;

                    // Save vote
                    const { error: voteError } = await supabase.from('theme_votes').insert({
                      session_id: gameSession.id,
                      player_id: currentPlayer.id,
                      theme_id: themeId as ThemeId,
                    });

                    if (voteError) {
                      console.error('Error voting for theme:', voteError);
                      return;
                    }

                    setSelectedTheme(themeId as ThemeId);
                    setSelectedThemeIndex(idx);

                    // Check if all players voted
                    const { data: allThemeVotes } = await supabase
                      .from('theme_votes')
                      .select('theme_id')
                      .eq('session_id', gameSession.id);

                    if (allThemeVotes && allThemeVotes.length === players.length) {
                      // Count votes
                      const voteCounts: { [key: string]: number } = {};
                      allThemeVotes.forEach((vote) => {
                        voteCounts[vote.theme_id] = (voteCounts[vote.theme_id] || 0) + 1;
                      });

                      const winningTheme = Object.entries(voteCounts).sort(([, a], [, b]) => b - a)[0];

                      // Update game session with winning theme
                      await supabase
                        .from('game_sessions')
                        .update({ current_theme: winningTheme[0], state: 'in_progress' })
                        .eq('id', gameSession.id);
                    }
                  }}
                  className={`p-6 rounded-xl font-fredoka text-center transition-all ${
                    selectedTheme === themeId
                      ? 'bg-white shadow-lg scale-105'
                      : 'bg-white/10 hover:bg-white/20 border-2 border-white/30'
                  }`}
                  style={selectedTheme === themeId ? { backgroundColor: theme.color } : {}}
                >
                  <div className="text-4xl mb-2">{theme.emoji}</div>
                  <div className={`font-bold ${selectedTheme === themeId ? 'text-white' : 'text-white'}`}>{theme.name}</div>
                </motion.button>
              ))}
            </div>
          </div>
        );

      case 'waiting_question':
        return (
          <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-oxe-navy to-blue-600">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-6xl mb-4"
            >
              ⏳
            </motion.div>
            <p className="text-white text-xl font-fredoka">Gerando pergunta...</p>
          </div>
        );

      case 'surprise':
        return (
          <div className="min-h-screen bg-gradient-to-br from-purple-600 to-pink-600 p-4 flex flex-col">
            <div className="flex-1 flex items-center justify-center">
              {currentRound && (
                <SurpriseHouseModal
                  options={currentRound.surprise_options || []}
                  onSelect={handleSurpriseAnswer}
                  disabled={submittingAnswer}
                  selectedLetter={selectedSurpriseAnswer}
                />
              )}
            </div>
          </div>
        );

      case 'question':
        return (
          <div className="min-h-screen bg-gradient-to-br from-oxe-navy to-blue-600 p-4 flex flex-col">
            <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col">
              {/* Header with timer and board */}
              <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-fredoka text-white">Pergunta</h1>
                <div className="text-white text-lg font-bold">⏱️ {Math.ceil((currentRound?.answer_time_remaining || 0) / 1000)}s</div>
              </div>

              <GameBoard players={players} boardSize={21} userId={userId} />

              {currentRound && (
                <>
                  <QuestionDisplay question={currentRound.question} theme={currentRound.theme_id} />

                  <div className="space-y-3 flex-1">
                    {answersShuffled.map((option, idx) => (
                      <AnswerOption
                        key={idx}
                        option={option}
                        index={idx}
                        onSelect={() => handleAnswerSubmit(option.text)}
                        disabled={submittingAnswer || selectedAnswer !== null}
                        isSelected={selectedAnswer === option.text}
                        showResult={false}
                        isCorrect={option.text === currentRound.correct_answer}
                        selectedCount={0}
                      />
                    ))}
                  </div>

                  {selectedAnswer && (
                    <div className="mt-4 text-center text-white font-fredoka">
                      ✅ Resposta submetida
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );

      case 'results':
        return (
          <div className="min-h-screen bg-gradient-to-br from-oxe-navy to-blue-600 p-4 flex flex-col">
            <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col">
              <h1 className="text-2xl font-fredoka text-white mb-4">Resultados</h1>

              <GameBoard players={players} boardSize={21} userId={userId} />

              {currentRound && (
                <>
                  <QuestionDisplay question={currentRound.question} theme={currentRound.theme_id} />

                  <ResultsDisplay
                    correct={currentRound.correct_answer}
                    selectedAnswer={selectedAnswer}
                    explanation={currentRound.explanation || ''}
                    answersShuffled={answersShuffled}
                  />

                  <div className="mt-4 text-white text-center font-fredoka text-sm">
                    Próxima tela em alguns segundos...
                  </div>
                </>
              )}
            </div>
          </div>
        );

      case 'voting':
        return (
          <div className="min-h-screen bg-gradient-to-br from-oxe-navy to-blue-600 p-4 flex flex-col">
            <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col">
              <h1 className="text-2xl font-fredoka text-white mb-4">Votação</h1>

              <GameBoard players={players} boardSize={21} userId={userId} />

              {currentRound && (
                <>
                  <QuestionDisplay question={currentRound.question} theme={currentRound.theme_id} />

                  <VotingComponent
                    players={players}
                    currentPlayerId={userId}
                    onVoteSubmit={handleVoteSubmit}
                    submitting={submittingAnswer}
                    hasVoted={hasVoted}
                  />

                  {hasVoted && (
                    <div className="mt-4 text-white text-center font-fredoka text-sm">
                      Aguardando votação dos outros jogadores...
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );

      case 'game_over':
        return (
          <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-oxe-navy to-blue-600 p-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5 }}
              className="text-6xl mb-6"
            >
              🏆
            </motion.div>
            <h1 className="text-4xl font-fredoka text-white mb-4 text-center">Jogo Finalizado!</h1>

            <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full mb-8">
              <h2 className="text-2xl font-fredoka text-oxe-navy mb-6 text-center">Placar Final</h2>
              <div className="space-y-3">
                {players
                  .sort((a, b) => (b.score || 0) - (a.score || 0))
                  .map((player, idx) => (
                    <div key={player.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '⚪'}</span>
                        <span className={`font-fredoka font-bold ${player.player_id === userId ? 'text-oxe-navy' : 'text-gray-700'}`}>
                          {player.name}
                        </span>
                      </div>
                      <span className="font-bold text-oxe-navy">{player.score || 0}</span>
                    </div>
                  ))}
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push('/lobby')}
              className="bg-white text-oxe-navy px-8 py-3 rounded-lg font-fredoka font-bold text-lg hover:shadow-lg transition-all"
            >
              Voltar ao Lobby
            </motion.button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <AnimatePresence mode="wait">{renderScreen()}</AnimatePresence>
    </>
  );
}
