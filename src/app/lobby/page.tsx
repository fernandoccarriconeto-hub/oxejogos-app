'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { generateInviteCode } from '@/lib/utils';
import type { GameSession, GamePlayer, Profile } from '@/types/game';
import { GAME_MODE_CONFIG, DIFFICULTY_CONFIG } from '@/types/game';

type GameMode = 'rapidinho' | 'classico' | 'maratona';
type Difficulty = 'facim' | 'marromeno' | 'arrochado';

export default function LobbyPage() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [selectedMode, setSelectedMode] = useState<GameMode>('classico');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('marromeno');
  const [inviteCode, setInviteCode] = useState<string>('');
  const [joinCode, setJoinCode] = useState<string>('');
  const [gameStarting, setGameStarting] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        router.push('/auth');
        return;
      }

      setUser(authUser);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (profileData) {
        setProfile(profileData);
      }

      setLoading(false);
    };

    checkAuth();
  }, [supabase, router]);

  const handleCreateGame = async () => {
    if (!user) return;

    setLoading(true);
    const code = generateInviteCode();

    const { data: sessionData, error: sessionError } = await supabase
      .from('game_sessions')
      .insert({
        captain_id: user.id,
        invite_code: code,
        game_mode: selectedMode,
        difficulty: selectedDifficulty,
        board_size: selectedMode === 'rapidinho' ? 10 : selectedMode === 'classico' ? 21 : 30,
        status: 'waiting',
        current_round: 0,
        max_players: 12,
        theme_picker_order: [user.id],
        current_theme_picker_index: 0,
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Error creating game:', sessionError);
      setLoading(false);
      return;
    }

    if (sessionData) {
      await supabase.from('game_players').insert({
        game_session_id: sessionData.id,
        player_id: user.id,
        board_position: 0,
        total_score: 0,
        is_connected: true,
      });

      setGameSession(sessionData);
      setInviteCode(code);
      setShowCreatePanel(false);
    }

    setLoading(false);
  };

  const handleJoinGame = async () => {
    if (!user || !joinCode.trim()) return;

    setLoading(true);

    const { data: sessionData, error: sessionError } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('invite_code', joinCode.toUpperCase())
      .single();

    if (sessionError || !sessionData) {
      alert('C\u00f3digo de convite inv\u00e1lido!');
      setLoading(false);
      return;
    }

    const { data: playerData, error: playerError } = await supabase
      .from('game_players')
      .insert({
        game_session_id: sessionData.id,
        player_id: user.id,
        board_position: 0,
        total_score: 0,
        is_connected: true,
      })
      .select();

    if (playerError) {
      alert('Erro ao entrar na sala!');
      setLoading(false);
      return;
    }

    sessionStorage.setItem('gameSessionId', sessionData.id);
    router.push('/game');
  };

  const handleStartGame = async () => {
    if (!gameSession || players.length < 2) return;

    setGameStarting(true);

    const { error } = await supabase
      .from('game_sessions')
      .update({ status: 'theme_selection', started_at: new Date().toISOString() })
      .eq('id', gameSession.id);

    if (!error) {
      sessionStorage.setItem('gameSessionId', gameSession.id);
      router.push('/game');
    }

    setGameStarting(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteCode);
    alert('C\u00f3digo copiado para a \u00e1rea de transfer\u00eancia!');
  };

  const shareOnWhatsApp = () => {
    const text = `Oxe! Vem jogar OxeJogos comigo! C\u00f3digo: ${inviteCode}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-oxe-light to-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">\u231b</div>
          <p className="font-fredoka text-xl text-oxe-navy">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-oxe-light via-white to-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-fredoka font-bold text-oxe-navy">
              Bem-vindo, {profile?.full_name || 'Jogador'}!
            </h1>
            <p className="text-gray-600 font-nunito">
              Pronto para uma partida \u00e9pica?
            </p>
          </div>
          <Link
            href="#profile"
            className="w-12 h-12 bg-oxe-blue text-white rounded-full flex items-center justify-center font-fredoka text-xl"
          >
            \ud83d\udc64
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-12">
        {!gameSession ? (
          // Main Lobby
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid md:grid-cols-2 gap-8 mb-12"
          >
            {/* Create Game Card */}
            <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-all">
              <div className="text-5xl mb-4">\u2728</div>
              <h2 className="text-2xl font-fredoka text-oxe-navy mb-4">
                Criar Nova Divers\u00e3o
              </h2>
              <p className="text-gray-600 font-nunito mb-6">
                Crie uma nova sala e convide seus amigos para jogar
              </p>
              <button
                onClick={() => setShowCreatePanel(!showCreatePanel)}
                className="w-full px-6 py-3 bg-oxe-blue text-white rounded-lg font-fredoka font-bold hover:bg-opacity-90 transition-all"
              >
                {showCreatePanel ? 'Cancelar' : 'Criar Sala'}
              </button>
            </div>

            {/* Join Game Card */}
            <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-all">
              <div className="text-5xl mb-4">\ud83c\udf9f\ufe0f</div>
              <h2 className="text-2xl font-fredoka text-oxe-navy mb-4">
                Entrar com Convite
              </h2>
              <p className="text-gray-600 font-nunito mb-6">
                Cole o c\u00f3digo que seu amigo enviou
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="C\u00f3digo (ex: ABC12345)"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg font-nunito uppercase tracking-wider"
                />
                <button
                  onClick={handleJoinGame}
                  disabled={!joinCode.trim()}
                  className="w-full px-6 py-3 bg-oxe-gold text-oxe-navy rounded-lg font-fredoka font-bold hover:bg-opacity-90 transition-all disabled:opacity-50"
                >
                  Entrar na Sala
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          // Game Creation Panel
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            {/* Invite Link Section */}
            <div className="bg-gradient-to-r from-oxe-blue to-oxe-navy text-white rounded-xl p-8">
              <h2 className="text-3xl font-fredoka font-bold mb-4">Sua Sala Est\u00e1 Pronta!</h2>
              <p className="text-oxe-light font-nunito mb-6">
                Compartilhe este c\u00f3digo com seus amigos para que eles possam entrar
              </p>

              <div className="bg-white bg-opacity-20 rounded-lg p-6 mb-6">
                <p className="text-sm text-oxe-light font-nunito mb-2">C\u00f3digo de Convite</p>
                <p className="text-4xl font-fredoka font-bold tracking-wider text-center mb-4">
                  {inviteCode}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={copyToClipboard}
                    className="flex-1 px-4 py-2 bg-white text-oxe-blue rounded-lg font-fredoka font-bold hover:bg-opacity-90 transition-all"
                  >
                    \ud83d\udccb Copiar
                  </button>
                  <button
                    onClick={shareOnWhatsApp}
                    className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg font-fredoka font-bold hover:bg-green-600 transition-all"
                  >
                    \ud83d\udcac WhatsApp
                  </button>
                </div>
              </div>

              {/* Game Config Display */}
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="bg-white bg-opacity-10 rounded-lg p-4">
                  <p className="text-sm text-oxe-light mb-1">Modo</p>
                  <p className="font-fredoka text-xl">
                    {GAME_MODE_CONFIG[selectedMode].label}
                  </p>
                </div>
                <div className="bg-white bg-opacity-10 rounded-lg p-4">
                  <p className="text-sm text-oxe-light mb-1">Dificuldade</p>
                  <p className="font-fredoka text-xl">
                    {DIFFICULTY_CONFIG[selectedDifficulty].label}
                  </p>
                </div>
              </div>
            </div>

            {/* Players List */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h3 className="text-2xl font-fredoka text-oxe-navy mb-4">
                Jogadores ({players.length})
              </h3>
              <div className="space-y-3">
                {players.length > 0 ? (
                  players.map((player, idx) => (
                    <div
                      key={player.id}
                      className="flex items-center gap-3 p-3 bg-oxe-light rounded-lg"
                    >
                      <div className="w-8 h-8 bg-oxe-blue text-white rounded-full flex items-center justify-center font-fredoka">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="font-fredoka text-oxe-navy">
                          {player.profile?.full_name || 'Jogador'}
                        </p>
                      </div>
                      {player.player_id === user.id && (
                        <span className="ml-auto text-sm bg-oxe-blue text-white px-3 py-1 rounded-full font-nunito">
                          Voc\u00ea
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 font-nunito">Aguardando jogadores...</p>
                )}
              </div>
            </div>

            {/* Start Game Button */}
            <button
              onClick={handleStartGame}
              disabled={players.length < 2 || gameStarting}
              className="w-full px-6 py-4 bg-gradient-to-r from-oxe-gold to-orange-500 text-oxe-navy rounded-lg font-fredoka font-bold text-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {gameStarting ? 'Iniciando...' : '\ud83d\ude80 Come\u00e7ar o Jogo!'}
            </button>

            {/* Back Button */}
            <button
              onClick={() => {
                setGameSession(null);
                setInviteCode('');
              }}
              className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-fredoka hover:bg-gray-300 transition-all"
            >
              Voltar
            </button>
          </motion.div>
        )}

        {/* Create Game Panel */}
        {showCreatePanel && !gameSession && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-lg p-8 mb-8"
          >
            <h3 className="text-2xl font-fredoka text-oxe-navy mb-6">
              Configurar Jogo
            </h3>

            {/* Game Mode Selection */}
            <div className="mb-8">
              <p className="font-fredoka text-oxe-navy mb-4">Modo de Jogo</p>
              <div className="grid md:grid-cols-3 gap-4">
                {(['rapidinho', 'classico', 'maratona'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setSelectedMode(mode)}
                    className={`p-4 rounded-lg transition-all ${
                      selectedMode === mode
                        ? 'bg-oxe-blue text-white shadow-lg'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <div className="text-2xl mb-2">{GAME_MODE_CONFIG[mode].emoji}</div>
                    <p className="font-fredoka">{GAME_MODE_CONFIG[mode].label}</p>
                    <p className="text-xs font-nunito mt-1">
                      {GAME_MODE_CONFIG[mode].boardSize} casas
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty Selection */}
            <div className="mb-8">
              <p className="font-fredoka text-oxe-navy mb-4">Dificuldade</p>
              <div className="grid md:grid-cols-3 gap-4">
                {(['facim', 'marromeno', 'arrochado'] as const).map((difficulty) => (
                  <button
                    key={difficulty}
                    onClick={() => setSelectedDifficulty(difficulty)}
                    className={`p-4 rounded-lg transition-all ${
                      selectedDifficulty === difficulty
                        ? 'bg-oxe-blue text-white shadow-lg'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <div className="text-2xl mb-2">
                      {DIFFICULTY_CONFIG[difficulty].emoji}
                    </div>
                    <p className="font-fredoka">{DIFFICULTY_CONFIG[difficulty].label}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Create Button */}
            <button
              onClick={handleCreateGame}
              disabled={loading}
              className="w-full px-6 py-3 bg-oxe-gold text-oxe-navy rounded-lg font-fredoka font-bold hover:bg-opacity-90 transition-all disabled:opacity-50"
            >
              {loading ? 'Criando...' : 'Criar Sala'}
            </button>
          </motion.div>
        )}
      </main>
    </div>
  );
}
