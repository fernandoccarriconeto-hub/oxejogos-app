import { create } from 'zustand';
import type { GameSession, GamePlayer, Round, PlayerAnswer, Vote, RoundScore, Profile, ShuffledAnswer } from '@/types/game';

interface GameState {
  // Session
  session: GameSession | null;
  players: GamePlayer[];
  currentPlayer: GamePlayer | null;
  profile: Profile | null;

  // Round
  currentRound: Round | null;
  answers: PlayerAnswer[];
  shuffledAnswers: ShuffledAnswer[];
  votes: Vote[];
  roundScores: RoundScore[];

  // UI
  timeRemaining: number;
  isLoading: boolean;
  error: string | null;

  // Actions
  setSession: (session: GameSession) => void;
  setPlayers: (players: GamePlayer[]) => void;
  setCurrentPlayer: (player: GamePlayer) => void;
  setProfile: (profile: Profile) => void;
  setCurrentRound: (round: Round) => void;
  setAnswers: (answers: PlayerAnswer[]) => void;
  setShuffledAnswers: (answers: ShuffledAnswer[]) => void;
  setVotes: (votes: Vote[]) => void;
  setRoundScores: (scores: RoundScore[]) => void;
  setTimeRemaining: (time: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  session: null,
  players: [],
  currentPlayer: null,
  profile: null,
  currentRound: null,
  answers: [],
  shuffledAnswers: [],
  votes: [],
  roundScores: [],
  timeRemaining: 0,
  isLoading: false,
  error: null,
};

export const useGameStore = create<GameState>((set) => ({
  ...initialState,
  setSession: (session) => set({ session }),
  setPlayers: (players) => set({ players }),
  setCurrentPlayer: (player) => set({ currentPlayer: player }),
  setProfile: (profile) => set({ profile }),
  setCurrentRound: (round) => set({ currentRound: round }),
  setAnswers: (answers) => set({ answers }),
  setShuffledAnswers: (answers) => set({ shuffledAnswers: answers }),
  setVotes: (votes) => set({ votes }),
  setRoundScores: (scores) => set({ roundScores: scores }),
  setTimeRemaining: (time) => set({ timeRemaining: time }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}));
