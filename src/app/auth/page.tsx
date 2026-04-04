'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type AuthMode = 'login' | 'signup';

interface FormData {
  nome?: string;
  email: string;
  whatsapp?: string;
  senha: string;
  confirmarSenha?: string;
  termos?: boolean;
}

interface FormErrors {
  [key: string]: string;
}

export default function AuthPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState<FormData>({
    nome: '',
    email: '',
    whatsapp: '',
    senha: '',
    confirmarSenha: '',
    termos: false,
  });

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.email) {
      newErrors.email = 'E-mail é obrigatório';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'E-mail inválido';
    }

    if (!formData.senha) {
      newErrors.senha = 'Senha é obrigatória';
    } else if (formData.senha.length < 6) {
      newErrors.senha = 'Senha deve ter no mínimo 6 caracteres';
    }

    if (mode === 'signup') {
      if (!formData.nome) {
        newErrors.nome = 'Nome é obrigatório';
      }

      if (formData.senha !== formData.confirmarSenha) {
        newErrors.confirmarSenha = 'Senhas não coincidem';
      }

      if (!formData.termos) {
        newErrors.termos = 'Você deve aceitar os termos';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value, type, checked } = e.target;
    let finalValue: string | boolean = type === 'checkbox' ? checked : value;

    if (name === 'whatsapp') {
      finalValue = value
        .replace(/\D/g, '')
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
        .slice(0, 15);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: finalValue,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.senha,
      });

      if (error) {
        setErrors({ submit: error.message });
        setLoading(false);
        return;
      }

      if (data.user) {
        router.push('/lobby');
      }
    } catch (err) {
      setErrors({ submit: 'Erro ao conectar. Tente novamente.' });
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.senha,
        options: {
          data: {
            full_name: formData.nome,
          },
        },
      });

      if (authError) {
        setErrors({ submit: authError.message });
        setLoading(false);
        return;
      }

      if (authData.user) {
        // Profile is auto-created by database trigger
        // Update with additional info
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            full_name: formData.nome,
            whatsapp: formData.whatsapp,
          })
          .eq('id', authData.user.id);

        if (profileError) {
          console.error('Profile update error:', profileError);
        }

        router.push('/avatar');
      }
    } catch (err) {
      setErrors({ submit: 'Erro ao registrar. Tente novamente.' });
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    if (mode === 'login') {
      handleLogin(e);
    } else {
      handleSignup(e);
    }
  };

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
        <div className="bg-white rounded-lg shadow-md p-4 mb-8 border-2 border-oxe-blue">
          <p className="text-center font-nunito text-gray-700">
            {mode === 'login'
              ? 'Bem-vindo de volta! Bora jogar?'
              : 'Vamos criar sua conta e começar a diversão!'}
          </p>
        </div>

        {/* Auth Form Container */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Tab Buttons */}
          <div className="flex gap-2 mb-8">
            <button
              onClick={() => setMode('login')}
              className={cn(
                'flex-1 py-2 px-4 rounded-lg font-fredoka font-bold transition-all',
                mode === 'login'
                  ? 'bg-oxe-blue text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              Entrar
            </button>
            <button
              onClick={() => setMode('signup')}
              className={cn(
                'flex-1 py-2 px-4 rounded-lg font-fredoka font-bold transition-all',
                mode === 'signup'
                  ? 'bg-oxe-blue text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              Cadastro
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-nunito font-semibold text-gray-700 mb-2">
                  Nome
                </label>
                <input
                  type="text"
                  name="nome"
                  value={formData.nome}
                  onChange={handleInputChange}
                  placeholder="Seu nome"
                  className={cn(
                    'w-full px-4 py-3 rounded-lg border-2 font-nunito transition-all',
                    errors.nome
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-300 bg-gray-50 focus:border-oxe-blue focus:bg-white'
                  )}
                />
                {errors.nome && (
                  <p className="text-red-500 text-sm mt-1 font-nunito">{errors.nome}</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-nunito font-semibold text-gray-700 mb-2">
                E-mail
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="seu@email.com"
                className={cn(
                  'w-full px-4 py-3 rounded-lg border-2 font-nunito transition-all',
                  errors.email
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-300 bg-gray-50 focus:border-oxe-blue focus:bg-white'
                )}
              />
              {errors.email && (
                <p className="text-red-500 text-sm mt-1 font-nunito">{errors.email}</p>
              )}
            </div>

            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-nunito font-semibold text-gray-700 mb-2">
                  WhatsApp (opcional)
                </label>
                <input
                  type="tel"
                  name="whatsapp"
                  value={formData.whatsapp}
                  onChange={handleInputChange}
                  placeholder="(85) 98765-4321"
                  className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 bg-gray-50 font-nunito focus:border-oxe-blue focus:bg-white transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-nunito font-semibold text-gray-700 mb-2">
                Senha
              </label>
              <input
                type="password"
                name="senha"
                value={formData.senha}
                onChange={handleInputChange}
                placeholder="Sua senha"
                className={cn(
                  'w-full px-4 py-3 rounded-lg border-2 font-nunito transition-all',
                  errors.senha
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-300 bg-gray-50 focus:border-oxe-blue focus:bg-white'
                )}
              />
              {errors.senha && (
                <p className="text-red-500 text-sm mt-1 font-nunito">{errors.senha}</p>
              )}
            </div>

            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-nunito font-semibold text-gray-700 mb-2">
                  Confirmar Senha
                </label>
                <input
                  type="password"
                  name="confirmarSenha"
                  value={formData.confirmarSenha}
                  onChange={handleInputChange}
                  placeholder="Confirme sua senha"
                  className={cn(
                    'w-full px-4 py-3 rounded-lg border-2 font-nunito transition-all',
                    errors.confirmarSenha
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-300 bg-gray-50 focus:border-oxe-blue focus:bg-white'
                  )}
                />
                {errors.confirmarSenha && (
                  <p className="text-red-500 text-sm mt-1 font-nunito">{errors.confirmarSenha}</p>
                )}
              </div>
            )}

            {mode === 'signup' && (
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="termos"
                  checked={formData.termos}
                  onChange={handleInputChange}
                  className="mt-1 w-4 h-4"
                />
                <label className="text-sm font-nunito text-gray-700">
                  Aceito os termos de serviço e política de privacidade
                </label>
              </div>
            )}
            {errors.termos && (
              <p className="text-red-500 text-sm font-nunito">{errors.termos}</p>
            )}

            {errors.submit && (
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3">
                <p className="text-red-700 text-sm font-nunito">{errors.submit}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-oxe-blue text-white rounded-lg font-fredoka font-bold text-lg hover:bg-opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? 'Aguardando...'
                : mode === 'login'
                  ? 'Entrar'
                  : 'Criar Conta'}
            </button>
          </form>

          <div className="mt-6 space-y-3">
            {mode === 'login' && (
              <div className="text-center">
                <Link
                  href="#"
                  className="text-sm text-oxe-blue hover:underline font-nunito"
                >
                  Esqueceu a senha?
                </Link>
              </div>
            )}

            <div className="text-center text-sm text-gray-600 font-nunito">
              {mode === 'login' ? (
                <>
                  Não tem conta?{' '}
                  <button
                    onClick={() => setMode('signup')}
                    className="text-oxe-blue hover:underline font-semibold"
                  >
                    Cadastre-se
                  </button>
                </>
              ) : (
                <>
                  Já tem conta?{' '}
                  <button
                    onClick={() => setMode('login')}
                    className="text-oxe-blue hover:underline font-semibold"
                  >
                    Entre aqui
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
