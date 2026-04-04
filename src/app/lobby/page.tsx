'use client';

import { useState, useEffect, useRef } from 'react';
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

interface PlayerWithProfile extends GamePlayer {
  profile?: Profile;
}

export default function LobbyPage() {
  const router = useRouter();
  const supabase = createClient();
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<PlayerWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [selectedMode, setSelectedMode] = useState<GameMode>('classico');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('marromeno');
  const [inviteCode, setInviteCode] = useState<string>('');
  const [joinCode, setJoinCode] = useState<string>('');
  const [gameStarting, setGameStarting] = useState(false);

  // Fetch players with their profile data
  const fetchPlayers = async (gameSessionId: string) => {
    // Fetch game players
    const { data: playersData, error: playersError } = await supabase
      .from('game_players')
      .select('*')
      .eq('game_session_id', gameSessionId)
      .order('joined_at', { ascending: true });

    if (playersError) {
      console.error('Error fetching players:', playersError);
      return;
    }

    if (!playersData || playersData.length === 0) {
      setPlayers([]);
      return;
    }

    // Fetch profiles for all player IDs
    const playerIds = playersData.map((p) => p.player_id);
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_type, avatar_preset_id, avatar_color')
      .in('id', playerIds);

    // Merge profiles into players
    const profileMap = new Map(profilesData?.map((p) => [p.id, p]) || []);
    const merged = playersData.map((player) => ({
      ...player,
      profile: profileMap.get(player.player_id) || null,
    }));

    setPlayers(merged as PlayerWithProfile[]);
  };

  // Subscribe to realtime updates
  const subscribeToGameUpdates = (gameSessionId: string) => {
    // Unsubscribe from previous subscription if exists
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    // Subscribe to game_players changes
    const playerSubscription = supabase
      .channel(`players:${gameSessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_players',
          filter: `game_session_id=eq.${gameSessionId}`,
        },
        (payload: any) => {
          // Refetch players whenever there's a change
          fetchPlayers(gameSessionId);
        }
      )
      .subscribe();

    // Subscribe to game_sessions status changes
    const gameSubscription = supabase
      .channel(`session:${gameSessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${gameSessionId}`,
        },
        (payload: any) => {
          const updatedSession = payload.new as GameSession;

          // If status changed to theme_selection, all players go to /game
          if (updatedSession.status === 'theme_selection') {
            sessionStorage.setItem('gameSessionId', gameSessionId);
            router.push('/game');
          } else {
            // Update the game session state
            setGameSession(updatedSession);
          }
        }
      )
      .subscribe();

    // Store unsubscribe function
    unsubscribeRef.current = () => {
      supabase.removeChannel(playerSubscription);
      supabase.removeChannel(gameSubscription);
    };
  };

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

    return () => {
      // Cleanup subscription on unmount
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
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
      const { error: playerError } = await supabase.from('game_players').insert({
        game_session_id: sessionData.id,
        player_id: user.id,
        board_position: 0,
        total_score: 0,
        is_connected: true,
      });

      if (!playerError) {
        setGameSession(sessionData);
        setInviteCode(code);
        setShowCreatePanel(false);

        // Fetch players immediately after creating game
        await fetchPlayers(sessionData.id);

        // Subscribe to realtime updates
        subscribeToGameUpdates(sessionData.id);
      }
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
      alert('Código de convite inválido!');
      setLoading(false);
      return;
    }

    // Check if game is still in waiting status
    if (sessionData.status !== 'waiting') {
      alert('Esta sala já começou!');
      setLoading(false);
      return;
    }

    // Check if player already joined this game
    const { data: existingPlayer } = await supabase
      .from('game_players')
      .select('id')
      .eq('game_session_id', sessionData.id)
      .eq('player_id', user.id)
      .maybeSingle();

    if (!existingPlayer) {
      // Player not yet in this game, insert them
      const { error: playerError } = await supabase
        .from('game_players')
        .insert({
          game_session_id: sessionData.id,
          player_id: user.id,
          board_position: 0,
          total_score: 0,
          is_connected: true,
        });

      if (playerError) {
        console.error('Error joining game:', playerError);
        alert('Erro ao entrar na sala!');
        setLoading(false);
        return;
      }

    }

    // Set game session and go to waiting room
    setGameSession(sessionData);
    setJoinCode('');

    // Fetch players for this game
    await fetchPlayers(sessionData.id);

    // Subscribe to realtime updates
    subscribeToGameUpdates(sessionData.id);

    setLoading(false);
  };

  const handleStartGame = async () => {
    if (!gameSession || players.length < 2) return;

    setGameStarting(true);

    // Shuffle theme_picker_order
    const shuffledOrder = [...players].sort(() => Math.random() - 0.5).map(p => p.player_id);

    const { error } = await supabase
      .from('game_sessions')
      .update({
        status: 'theme_selection',
        current_round: 1,
        theme_picker_order: shuffledOrder,
        started_at: new Date().toISOString(),
      })
      .eq('id', gameSession.id);

    if (error) {
      console.error('Error starting game:', error);
      setGameStarting(false);
      return;
    }

    // Save gameSessionId to sessionStorage and redirect
    sessionStorage.setItem('gameSessionId', gameSession.id);
    router.push('/game');
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteCode);
    alert('Código copiado para a área de transferência!');
  };

  const shareOnWhatsApp = () => {
    const text = `Oxe! Vem jogar OxeJogos comigo! Código: ${inviteCode}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-oxe-light to-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">⏳</div>
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
              Pronto para uma partida épica?
            </p>
          </div>
          <Link
            href="#profile"
            className="w-12 h-12 bg-oxe-blue text-white rounded-full flex items-center justify-center font-fredoka text-xl"
          >
            👤
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
              <div className="text-5xl mb-4">✨</div>
              <h2 className="text-2xl font-fredoka text-oxe-navy mb-4">
                Criar Nova Diversão
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
              <div className="text-5xl mb-4">🎟️</div>
              <h2 className="text-2xl font-fredoka text-oxe-navy mb-4">
                Entrar com Convite
              </h2>
              <p className="text-gray-600 font-nunito mb-6">
                Cole o código que seu amigo enviou
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Código (ex: ABC12345)"
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
          // Game Waiting Room Panel
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            {/* Invite Link Section */}
            <div className="bg-gradient-to-r from-oxe-blue to-oxe-navy text-white rounded-xl p-8">
              <h2 className="text-3xl font-fredoka font-bold mb-4">Sua Sala Está Pronta!</h2>
              <p className="text-oxe-light font-nunito mb-6">
                Compartilhe este código com seus amigos para que eles possam entrar
              </p>

              <div className="bg-white bg-opacity-20 rounded-lg p-6 mb-6">
                <p className="text-sm text-oxe-light font-nunito mb-2">Código de Convite</p>
                <p className="text-4xl font-fredoka font-bold tracking-wider text-center mb-4">
                  {inviteCode}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={copyToClipboard}
                    className="flex-1 px-4 py-2 bg-white text-oxe-blue rounded-lg font-fredoka font-bold hover:bg-opacity-90 transition-all"
                  >
                    📋 Copiar
                  </button>
                  <button
                    onClick={shareOnWhatsApp}
                    className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg font-fredoka font-bold hover:bg-green-600 transition-all"
                  >
                    💬 WhatsApp
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
                          Você
                        </span>
                      )}
                      {gameSession?.captain_id === player.player_id && (
                        <span className="ml-auto text-sm bg-oxe-gold text-oxe-navy px-3 py-1 rounded-full font-nunito">
                          Capitão
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 font-nunito">Aguardando jogadores...</p>
                )}
              </div>
            </div>

            {/* Start Game Button - Only for Captain */}
            {gameSession?.captain_id === user.id && (
              <button
                onClick={handleStartGame}
                disabled={players.length < 2 || gameStarting}
                className="w-full px-6 py-4 bg-gradient-to-r from-oxe-gold to-orange-500 text-oxe-navy rounded-lg font-fredoka font-bold text-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {gameStarting ? 'Iniciando...' : '🚀 Começar o Jogo!'}
              </button>
            )}

            {/* Back Button */}
            <button
              onClick={() => {
                setGameSession(null);
                setInviteCode('');
                setPlayers([]);
                if (unsubscribeRef.current) {
                  unsubscribeRef.current();
                }
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