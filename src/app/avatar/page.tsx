'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';

const AVATAR_PRESETS = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  emoji: ['👨', '👩', '🧔', '👱', '🧑', '👨‍🦰', '👩‍🦰', '👨‍🦱', '👩‍🦱', '👨‍🦲', '👩‍🦲', '👨‍🦳', '👩‍🦳', '🧓', '👴', '👵', '👦', '👧', '🧒', '👶'][i],
}));

const COLORS = [
  '#0E7490',
  '#1E3A5F',
  '#B45309',
  '#DC2626',
  '#059669',
  '#7C3AED',
  '#DB2777',
  '#EA580C',
  '#4F46E5',
  '#0891B2',
  '#10B981',
  '#8B5CF6',
];

export default function AvatarPage() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<any>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<number>(1);
  const [selectedColor, setSelectedColor] = useState<string>(COLORS[0]);
  const [playerName, setPlayerName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

      // Load current profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_preset_id')
        .eq('id', authUser.id)
        .single();

      if (profile) {
        setPlayerName(profile.full_name);
        if (profile.avatar_preset_id) {
          setSelectedAvatar(profile.avatar_preset_id);
        }
      }

      setLoading(false);
    };

    checkAuth();
  }, [supabase, router]);

  const handleSaveAvatar = async () => {
    if (!user || !playerName.trim()) {
      alert('Por favor, preencha seu nome');
      return;
    }

    if (playerName.length > 15) {
      alert('Nome n\u00e3o pode ter mais de 15 caracteres');
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: playerName,
        avatar_preset_id: selectedAvatar,
      })
      .eq('id', user.id);

    if (error) {
      console.error('Error saving avatar:', error);
      alert('Erro ao salvar avatar');
      setSaving(false);
      return;
    }

    router.push('/lobby');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-oxe-light to-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">⌛</div>
          <p className="font-fredoka text-xl text-oxe-navy">Carregando...</p>
        </div>
      </div>
    );
  }

  const selectedAvatarEmoji = AVATAR_PRESETS.find((a) => a.id === selectedAvatar)?.emoji;

  return (
    <div className="min-h-screen bg-gradient-to-b from-oxe-light via-white to-gray-50 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-fredoka font-bold text-oxe-navy mb-2">
            Escolha seu Avatar
          </h1>
          <p className="text-gray-600 font-nunito text-lg">
            Customize sua apar\u00eancia e escolha um nome arretado
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Preview Section */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-lg p-8 h-fit sticky top-8"
          >
            <h2 className="text-xl font-fredoka text-oxe-navy mb-6 text-center">
              Pr\u00e9-visualiza\u00e7\u00e3o
            </h2>

            {/* Avatar Preview */}
            <div
              className="w-32 h-32 rounded-full flex items-center justify-center text-6xl mx-auto mb-6 shadow-lg border-4 border-white"
              style={{ backgroundColor: selectedColor }}
            >
              {selectedAvatarEmoji}
            </div>

            {/* Name Preview */}
            <div className="text-center mb-6">
              <p className="text-sm text-gray-600 font-nunito mb-1">Seu Nome</p>
              <p className="text-2xl font-fredoka text-oxe-navy truncate">
                {playerName || 'Seu Nome'}
              </p>
            </div>

            {/* Color Legend */}
            <div className="bg-oxe-light rounded-lg p-4">
              <p className="text-xs text-gray-600 font-nunito mb-3">Cor Selecionada</p>
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full border-2 border-gray-300"
                  style={{ backgroundColor: selectedColor }}
                />
                <span className="font-nunito text-sm text-gray-700">
                  {selectedColor}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Selection Section */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="md:col-span-2 space-y-8"
          >
            {/* Player Name Input */}
            <div>
              <label className="block text-sm font-fredoka font-bold text-oxe-navy mb-3">
                Nome do Jogador (m\u00e1x. 15 caracteres)
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.slice(0, 15))}
                placeholder="Digite seu nome"
                maxLength={15}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg font-nunito focus:border-oxe-blue focus:bg-oxe-light transition-all"
              />
              <p className="text-xs text-gray-500 font-nunito mt-2">
                {playerName.length}/15 caracteres
              </p>
            </div>

            {/* Avatar Selection */}
            <div>
              <label className="block text-sm font-fredoka font-bold text-oxe-navy mb-3">
                Escolha seu Avatar
              </label>
              <div className="grid grid-cols-5 gap-3">
                {AVATAR_PRESETS.map((preset) => (
                  <motion.button
                    key={preset.id}
                    onClick={() => setSelectedAvatar(preset.id)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`w-16 h-16 rounded-lg text-3xl flex items-center justify-center transition-all border-2 ${
                      selectedAvatar === preset.id
                        ? 'border-oxe-blue bg-oxe-light shadow-lg'
                        : 'border-gray-200 bg-white hover:border-oxe-blue'
                    }`}
                  >
                    {preset.emoji}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Color Selection */}
            <div>
              <label className="block text-sm font-fredoka font-bold text-oxe-navy mb-3">
                Escolha a Cor do Avatar
              </label>
              <div className="grid grid-cols-6 gap-3">
                {COLORS.map((color) => (
                  <motion.button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className={`w-12 h-12 rounded-lg transition-all border-4 ${
                      selectedColor === color
                        ? 'border-gray-800 shadow-lg'
                        : 'border-gray-200'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>

            {/* Upload Photo Option */}
            <div className="bg-oxe-light rounded-lg p-6 text-center">
              <p className="text-sm text-gray-700 font-nunito mb-3">
                Prefere usar uma foto sua?
              </p>
              <button className="px-6 py-2 bg-white text-oxe-blue rounded-lg font-fredoka font-bold hover:bg-gray-100 transition-all border-2 border-oxe-blue">
                \ud83d\udcf7 Upload Foto
              </button>
            </div>

            {/* Save Button */}
            <motion.button
              onClick={handleSaveAvatar}
              disabled={saving || !playerName.trim()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full px-6 py-4 bg-gradient-to-r from-oxe-gold to-orange-500 text-oxe-navy rounded-lg font-fredoka font-bold text-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Salvando...' : '\ud83d\ude80 T\u00f4 Pronto! Bora Jogar!'}
            </motion.button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
