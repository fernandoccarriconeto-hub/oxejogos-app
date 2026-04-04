'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { THEMES, GAME_MODE_CONFIG, DIFFICULTY_CONFIG } from '@/types/game';

const fadeInVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const staggerContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const FadeInSection = ({ children }: { children: React.ReactNode }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <motion.div
      initial="hidden"
      animate={isVisible ? 'visible' : 'hidden'}
      variants={fadeInVariants}
    >
      {children}
    </motion.div>
  );
};

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-oxe-light via-white to-gray-50">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4 pt-20">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <FadeInSection>
            <div className="space-y-6">
              <h1 className="text-5xl md:text-6xl font-fredoka font-bold text-oxe-navy leading-tight">
                OxeJogos
              </h1>
              <p className="text-xl md:text-2xl text-gray-700 font-nunito">
                O jogo de tabuleiro digital mais arretado do Brasil
              </p>
              <p className="text-lg text-gray-600 font-nunito leading-relaxed max-w-xl">
                Divirta-se com amigos, desafie a inteligência artificial criativa e prove que você tem as melhores respostas da galera.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Link
                  href="/auth"
                  className="px-8 py-4 bg-oxe-blue text-white rounded-lg font-nunito font-bold text-lg hover:bg-opacity-90 transition-all transform hover:scale-105 text-center"
                >
                  Começar Agora
                </Link>
                <button
                  onClick={() =>
                    document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' })
                  }
                  className="px-8 py-4 bg-white text-oxe-blue border-2 border-oxe-blue rounded-lg font-nunito font-bold text-lg hover:bg-oxe-light transition-all"
                >
                  Saber Mais
                </button>
              </div>
            </div>
          </FadeInSection>

          <FadeInSection>
            <div className="relative h-96 md:h-full">
              <Image
                src="/images/oxebot-hero.svg"
                alt="OxeMedic - Mascote OxeJogos"
                fill
                className="object-contain"
                priority
                unoptimized
              />
              <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-white rounded-xl shadow-xl p-4 max-w-xs">
                <p className="text-sm md:text-base text-gray-800 font-nunito">
                  Oxe, vem jogar com a gente! Tem perguntas legais, respostas criativas e muita diversão por aqui!
                </p>
              </div>
            </div>
          </FadeInSection>
        </div>
      </section>

      {/* Como Funciona Section */}
      <section id="como-funciona" className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <FadeInSection>
            <h2 className="text-4xl md:text-5xl font-fredoka font-bold text-center text-oxe-navy mb-16">
              Como Funciona?
            </h2>
          </FadeInSection>

          <motion.div
            variants={staggerContainerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid md:grid-cols-4 gap-8 mb-16"
          >
            {[
              {
                step: '1',
                title: 'Escolha o Jogo',
                description: 'Crie uma nova sala ou entre com um código de convite de amigos',
                emoji: '🎲',
              },
              {
                step: '2',
                title: 'Defina o Tema',
                description: 'Escolha entre 11 temas incríveis para as perguntas',
                emoji: '🎯',
              },
              {
                step: '3',
                title: 'Responda e Vote',
                description: 'Escreva sua resposta e vote nas respostas que achar melhores',
                emoji: '🧠',
              },
              {
                step: '4',
                title: 'Avance no Tabuleiro',
                description: 'Ganhe pontos e chegue primeiro ao final para vencer',
                emoji: '🏆',
              },
            ].map((item) => (
              <motion.div
                key={item.step}
                variants={fadeInVariants}
                className="bg-oxe-light rounded-xl p-6 text-center hover:shadow-lg transition-all"
              >
                <div className="text-4xl mb-3">{item.emoji}</div>
                <div className="text-3xl font-fredoka text-oxe-blue mb-2">{item.step}</div>
                <h3 className="text-xl font-fredoka text-oxe-navy mb-3">{item.title}</h3>
                <p className="text-gray-700 font-nunito">{item.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Game Modes Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <FadeInSection>
            <h2 className="text-4xl md:text-5xl font-fredoka font-bold text-center text-oxe-navy mb-16">
              Modos de Jogo
            </h2>
          </FadeInSection>

          <motion.div
            variants={staggerContainerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid md:grid-cols-3 gap-8"
          >
            {Object.entries(GAME_MODE_CONFIG).map(([key, config]) => (
              <motion.div
                key={key}
                variants={fadeInVariants}
                className={`rounded-xl p-8 text-white transition-all transform hover:scale-105 ${
                  key === 'classico'
                    ? 'bg-gradient-to-br from-oxe-blue to-oxe-navy shadow-2xl md:col-span-1 md:row-span-2 flex flex-col justify-center'
                    : 'bg-gradient-to-br from-oxe-brown to-orange-700'
                }`}
              >
                <div className="text-5xl mb-4">{config.emoji}</div>
                <h3 className="text-2xl font-fredoka mb-2">{config.label}</h3>
                <p className="font-nunito mb-4 text-sm">{config.description}</p>
                <p className="font-nunito text-xs opacity-90">
                  {config.boardSize} casas no tabuleiro
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Themes Section */}
      <section className="py-20 px-4 bg-oxe-light">
        <div className="max-w-6xl mx-auto">
          <FadeInSection>
            <h2 className="text-4xl md:text-5xl font-fredoka font-bold text-center text-oxe-navy mb-16">
              Temas Incríveis
            </h2>
          </FadeInSection>

          <motion.div
            variants={staggerContainerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid md:grid-cols-3 lg:grid-cols-4 gap-4"
          >
            {THEMES.map((theme) => (
              <motion.div
                key={theme.id}
                variants={fadeInVariants}
                className="bg-white rounded-lg p-4 text-center hover:shadow-lg transition-all"
              >
                <div className="text-3xl mb-2">{theme.emoji}</div>
                <h4 className="font-fredoka text-sm text-oxe-navy">{theme.name}</h4>
              </motion.div>
            ))}

            <motion.div
              variants={fadeInVariants}
              className="bg-white rounded-lg p-4 text-center hover:shadow-lg transition-all flex items-center justify-center"
            >
              <div>
                <div className="text-3xl mb-2">+ Subtemas</div>
                <p className="font-nunito text-xs text-gray-600">
                  Variações em cada tema
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Scoring Section */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <FadeInSection>
            <h2 className="text-4xl md:text-5xl font-fredoka font-bold text-center text-oxe-navy mb-12">
              Sistema de Pontos
            </h2>
          </FadeInSection>

          <motion.div
            variants={staggerContainerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="space-y-4"
          >
            {[
              { icon: '✅', label: 'Resposta Correta', points: '3 pontos' },
              { icon: '🗳️', label: 'Voto Recebido', points: '2 pontos' },
              { icon: '🎨', label: 'Bônus Criatividade', points: '+1 ponto' },
              { icon: '🎪', label: 'Casa Surpresa Certa', points: '+2 pontos' },
            ].map((item, idx) => (
              <motion.div
                key={idx}
                variants={fadeInVariants}
                className="flex items-center gap-4 bg-oxe-light rounded-lg p-4"
              >
                <div className="text-3xl">{item.icon}</div>
                <div className="flex-1">
                  <h4 className="font-fredoka text-oxe-navy">{item.label}</h4>
                </div>
                <div className="font-bold text-oxe-blue font-fredoka">{item.points}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Difficulty Levels Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <FadeInSection>
            <h2 className="text-4xl md:text-5xl font-fredoka font-bold text-center text-oxe-navy mb-16">
              Níveis de Dificuldade
            </h2>
          </FadeInSection>

          <motion.div
            variants={staggerContainerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid md:grid-cols-3 gap-6"
          >
            {Object.entries(DIFFICULTY_CONFIG).map(([key, config]) => (
              <motion.div
                key={key}
                variants={fadeInVariants}
                className="bg-gradient-to-br from-oxe-light to-white rounded-xl p-8 text-center border-2 border-oxe-blue"
              >
                <div className="text-5xl mb-4">{config.emoji}</div>
                <h3 className="text-2xl font-fredoka text-oxe-navy mb-2">{config.label}</h3>
                <p className="font-nunito text-gray-700">{config.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* AI Section */}
      <section className="py-20 px-4 bg-oxe-navy text-white">
        <div className="max-w-4xl mx-auto">
          <FadeInSection>
            <h2 className="text-4xl md:text-5xl font-fredoka font-bold text-center mb-8">
              Powered by Claude IA
            </h2>
          </FadeInSection>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInVariants}
            className="bg-oxe-blue rounded-xl p-8 md:p-12"
          >
            <p className="text-lg font-nunito leading-relaxed text-center max-w-3xl mx-auto">
              Sabe o Claude, aquela IA super inteligente que todo mundo tá usando? Então, ele é feito pela Anthropic — e é exatamente essa tecnologia que está por trás do OxeJogos!
            </p>
            <p className="text-lg font-nunito leading-relaxed text-center max-w-3xl mx-auto mt-6">
              A inteligência artificial gera respostas criativas para os desafios, tornando o jogo ainda mais imprevisível e divertido. Quer você acerte ou tente enganar, o Claude tá lá pra surpreender!
            </p>
          </motion.div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-oxe-blue to-oxe-navy">
        <div className="max-w-4xl mx-auto text-center">
          <FadeInSection>
            <h2 className="text-4xl md:text-5xl font-fredoka font-bold text-white mb-6">
              Tá esperando o quê?
            </h2>
            <p className="text-xl text-oxe-light font-nunito mb-8">
              Bora reunir a galera e começar uma partida agora mesmo!
            </p>
            <Link
              href="/auth"
              className="inline-block px-10 py-4 bg-oxe-gold text-oxe-navy rounded-lg font-fredoka font-bold text-lg hover:bg-opacity-90 transition-all transform hover:scale-105"
            >
              Começar Agora
            </Link>
          </FadeInSection>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-oxe-navy text-white text-center py-8 px-4">
        <p className="font-nunito">
          OxeJogos by Oxeteque © 2026
        </p>
      </footer>
    </main>
  );
}
