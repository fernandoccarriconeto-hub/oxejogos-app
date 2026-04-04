import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { GAME_MODE_CONFIG, DIFFICULTY_CONFIG, type GameMode, type Difficulty } from '@/types/game';

interface ConvitePageProps {
  params: { code: string };
}

export default async function ConvitePage({ params }: ConvitePageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch game session by invite code
  const { data: gameSession, error: sessionError } = await supabase
    .from('game_sessions')
    .select(
      `
      *,
      captain:profiles(full_name)
    `
    )
    .eq('invite_code', params.code.toUpperCase())
    .single();

  if (sessionError || !gameSession) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-oxe-light to-white flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-3xl font-fredoka font-bold text-oxe-navy mb-4">
            Convite Inválido
          </h1>
          <p className="text-gray-600 font-nunito mb-8">
            Desculpa, esse código de convite não foi encontrado. Verifique se digitou corretamente.
          </p>
          <Link
            href="/lobby"
            className="inline-block px-6 py-3 bg-oxe-blue text-white rounded-lg font-fredoka font-bold hover:bg-opacity-90 transition-all"
          >
            Voltar ao Lobby
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-oxe-light via-white to-gray-50 flex flex-col items-center justify-center px-4 py-8">
      <div className="max-w-md w-full">
        {/* Mascot */}
        <div className="text-center mb-8 relative h-40">
          <Image
            src="/images/oxebot-hero.png"
            alt="OxeMedic"
            fill
            className="object-contain"
            priority
          />
        </div>

        {/* Speech Bubble */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-8 border-2 border-oxe-blue text-center">
          <p className="text-center font-nunito text-gray-700">
            Oxe! Você foi convidado pra uma partida de OxeJogos! Tá afim?
          </p>
        </div>

        {/* Game Info Card */}
        <div className="bg-white rounded-xl shadow-lg p-8 space-y-6">
          <div>
            <h2 className="text-2xl font-fredoka text-oxe-navy mb-4">
              Detalhes da Sala
            </h2>

            <div className="space-y-4">
              {/* Creator */}
              <div className="bg-oxe-light rounded-lg p-4">
                <p className="text-xs text-gray-600 font-nunito mb-1">
                  Criada por
                </p>
                <p className="font-fredoka text-lg text-oxe-navy">
                  {gameSession.captain?.full_name || 'Capitão'}
                </p>
              </div>

              {/* Game Mode */}
              <div className="bg-oxe-light rounded-lg p-4">
                <p className="text-xs text-gray-600 font-nunito mb-1">
                  Modo de Jogo
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">
                    {GAME_MODE_CONFIG[gameSession.game_mode as GameMode]?.emoji}
                  </span>
                  <p className="font-fredoka text-lg text-oxe-navy">
                    {GAME_MODE_CONFIG[gameSession.game_mode as GameMode]?.label}
                  </p>
                </div>
              </div>

              {/* Difficulty */}
              <div className="bg-oxe-light rounded-lg p-4">
                <p className="text-xs text-gray-600 font-nunito mb-1">
                  Dificuldade
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">
                    {DIFFICULTY_CONFIG[gameSession.difficulty as Difficulty]?.emoji}
                  </span>
                  <p className="font-fredoka text-lg text-oxe-navy">
                    {DIFFICULTY_CONFIG[gameSession.difficulty as Difficulty]?.label}
                  </p>
                </div>
              </div>

              {/* Board Size */}
              <div className="bg-oxe-light rounded-lg p-4">
                <p className="text-xs text-gray-600 font-nunito mb-1">
                  Tamanho do Tabuleiro
                </p>
                <p className="font-fredoka text-lg text-oxe-navy">
                  {gameSession.board_size} casas
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-4">
            {user ? (
              <Link
                href={`/lobby?join=${params.code}`}
                className="block w-full px-6 py-3 bg-oxe-blue text-white rounded-lg font-fredoka font-bold hover:bg-opacity-90 transition-all text-center"
              >
                ✨ Entrar na Sala
              </Link>
            ) : (
              <Link
                href={`/auth?returnUrl=/convite/${params.code}`}
                className="block w-full px-6 py-3 bg-oxe-blue text-white rounded-lg font-fredoka font-bold hover:bg-opacity-90 transition-all text-center"
              >
                Fazer Login para Entrar
              </Link>
            )}

            <Link
              href="/lobby"
              className="block w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-fredoka font-bold hover:bg-gray-300 transition-all text-center"
            >
              Voltar
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
