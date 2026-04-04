import type { Metadata } from 'next';
import { Fredoka, Nunito } from 'next/font/google';
import '../styles/globals.css';

const fredoka = Fredoka({
  variable: '--font-fredoka',
  subsets: ['latin'],
  weight: ['400', '700'],
});

const nunito = Nunito({
  variable: '--font-nunito',
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'OxeJogos - O Jogo de Tabuleiro Digital Mais Arretado do Brasil',
  description: 'Jogo de perguntas multiplayer com IA, tabuleiro de 21 casas e mascote cangaceiro. Jogos emocionantes com amigos, inteligência artificial criativa e desafios nordestinos.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={`${fredoka.variable} ${nunito.variable}`}>
        {children}
      </body>
    </html>
  );
}
