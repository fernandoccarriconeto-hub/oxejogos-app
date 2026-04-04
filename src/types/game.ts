// Game modes
export type GameMode = 'rapidinho' | 'classico' | 'maratona';
export type Difficulty = 'facim' | 'marromeno' | 'arrochado';
export type GameStatus = 'waiting' | 'theme_selection' | 'in_progress' | 'finished';
export type RoundStatus = 'theme_voting' | 'answering' | 'voting' | 'results' | 'completed';

export const GAME_MODE_CONFIG: Record<GameMode, { label: string; emoji: string; boardSize: number; description: string }> = {
  rapidinho: { label: 'Rapidinho', emoji: '⚡', boardSize: 10, description: 'Pra quem quer diversão rápida' },
  classico: { label: 'Clássico', emoji: '🎯', boardSize: 21, description: 'A experiência completa' },
  maratona: { label: 'Maratona', emoji: '🏆', boardSize: 30, description: 'Pra quem aguenta o tranco' },
};

export const DIFFICULTY_CONFIG: Record<Difficulty, { label: string; emoji: string; description: string }> = {
  facim: { label: 'Facim', emoji: '😊', description: 'Pra aquecer os neurônios' },
  marromeno: { label: 'Marromeno', emoji: '🤔', description: 'Já pega no pé' },
  arrochado: { label: 'Arrochado', emoji: '🔥', description: 'Só os brabos aguentam' },
};

export const THEMES = [
  { id: 'medicina', name: 'Medicina e Saúde', emoji: '🏥' },
  { id: 'ia', name: 'Inteligência Artificial', emoji: '🤖' },
  { id: 'matematica', name: 'Matemática', emoji: '🔢' },
  { id: 'historia', name: 'História', emoji: '📜' },
  { id: 'geografia', name: 'Geografia', emoji: '🌍' },
  { id: 'esportes', name: 'Esportes', emoji: '⚽' },
  { id: 'direito', name: 'Direito', emoji: '⚖️' },
  { id: 'comiccon', name: 'COMIC-CON', emoji: '🦸' },
  { id: 'ciencias', name: 'Ciências', emoji: '🔬' },
  { id: 'filmes', name: 'Filmes, Séries e TV', emoji: '🎬' },
] as const;

export type ThemeId = typeof THEMES[number]['id'];

export const ANSWER_TIME_SECONDS = 90;
export const VOTE_TIME_SECONDS = 60;
export const SURPRISE_TIME_SECONDS = 30;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;
export const SURPRISE_HOUSES_INTERVAL = 3;

// Points
export const POINTS_CORRECT_ANSWER = 3;
export const POINTS_RECEIVED_VOTE = 2;
export const POINTS_AI_CREATIVE_BONUS = 1;
export const POINTS_AI_CREATIVE_PENALTY = -1;
export const SURPRISE_CORRECT_BONUS = 2;
export const SURPRISE_WRONG_PENALTY = -1;

// Interfaces
export interface Profile {
  id: string;
  full_name: string;
  whatsapp?: string;
  avatar_type: 'custom' | 'preset';
  avatar_url?: string;
  avatar_preset_id?: number;
  total_games_played: number;
  total_wins: number;
  total_points: number;
}

export interface GameSession {
  id: string;
  invite_code: string;
  captain_id: string;
  game_mode: GameMode;
  difficulty: Difficulty;
  board_size: number;
  status: GameStatus;
  current_round: number;
  max_players: number;
  theme_picker_order: string[];
  current_theme_picker_index: number;
  created_at: string;
  started_at?: string;
  finished_at?: string;
}

export interface GamePlayer {
  id: string;
  game_session_id: string;
  player_id: string;
  board_position: number;
  total_score: number;
  is_connected: boolean;
  joined_at: string;
  profile?: Profile;
}

export interface Round {
  id: string;
  game_session_id: string;
  round_number: number;
  theme: string;
  sub_theme?: string;
  difficulty: Difficulty;
  question_text: string;
  ai_correct_answer: string;
  ai_creative_answer: string;
  status: RoundStatus;
  answer_deadline?: string;
  vote_deadline?: string;
}

export interface PlayerAnswer {
  id: string;
  round_id: string;
  player_id: string;
  answer_text: string;
  response_time_seconds: number;
  created_at: string;
}

export interface Vote {
  id: string;
  round_id: string;
  voter_id: string;
  voted_answer_id?: string;
  voted_ai_correct: boolean;
  voted_ai_creative: boolean;
  flagged_as_ai_creative_id?: string;
}

export interface RoundScore {
  id: string;
  round_id: string;
  player_id: string;
  points_correct_answer: number;
  points_received_votes: number;
  points_ai_creative_bonus: number;
  points_ai_creative_penalty: number;
  total_round_points: number;
  houses_moved: number;
}

export interface ShuffledAnswer {
  id: string;
  letter: string;
  text: string;
  type: 'player' | 'ai_correct' | 'ai_creative';
  owner_id?: string;
}
