// e:/Proyecto/BACKGAMMON/BACKGAMMON-VIVO/src/features/ranking/constants.ts

export interface RankDefinition {
  id: string; // e.g., 'principiante'
  name: string; // e.g., 'Principiante'
  order: number; // 0 to 19
  message: string;
  badgeColor: string; // Taildwind color class or hex
}

export const RANKS: RankDefinition[] = [
  { id: 'principiante', order: 0, name: 'Principiante', message: 'Todos empiezan por algún lado. Al menos tú te presentaste.', badgeColor: 'text-slate-400' },
  { id: 'novato', order: 1, name: 'Novato', message: 'Estás aprendiendo el oficio. Intenta no tropezar con ellos.', badgeColor: 'text-orange-400' },
  { id: 'aprendiz', order: 2, name: 'Aprendiz', message: 'Estás mejorando, poco a poco, pero mejor.', badgeColor: 'text-orange-500' },
  { id: 'universitario', order: 3, name: 'Universitario', message: 'El progreso es progreso, aunque sea pequeño.', badgeColor: 'text-slate-300' },
  { id: 'perfeccionista', order: 4, name: 'Perfeccionista', message: 'Buscas la excelencia en cada movimiento.', badgeColor: 'text-slate-200' },
  { id: 'competidor', order: 5, name: 'Competidor', message: 'Eres oficialmente peligroso. Sigue perfeccionando esas habilidades.', badgeColor: 'text-slate-100' },
  { id: 'habilidoso', order: 6, name: 'Jugador Habilidoso', message: 'Tus habilidades empiezan a destacar.', badgeColor: 'text-yellow-200' },
  { id: 'estratega', order: 7, name: 'Estratega', message: 'Tus movimientos empiezan a parecer intencionados. Impresionantes.', badgeColor: 'text-yellow-300' },
  { id: 'tactico', order: 8, name: 'Táctico', message: 'Ves jugadas que otros ignoran.', badgeColor: 'text-yellow-400' },
  { id: 'avanzado', order: 9, name: 'Jugador Avanzado', message: 'Dominas los fundamentos y más allá.', badgeColor: 'text-cyan-200' },
  { id: 'experto', order: 10, name: 'Experto', message: 'La gente te teme ahora. Y debería.', badgeColor: 'text-cyan-300' },
  { id: 'veterano', order: 11, name: 'Veterano', message: 'Has visto de todo y sigues ganando.', badgeColor: 'text-cyan-400' },
  { id: 'maestro', order: 12, name: 'Maestro', message: 'Estás jugando a otro nivel. No te engreas.', badgeColor: 'text-emerald-400' },
  { id: 'gran_maestro', order: 13, name: 'Gran Maestro', message: 'Tus oponentes susurran tu nombre. Casi siempre con miedo.', badgeColor: 'text-emerald-500' },
  { id: 'maestro_juego', order: 14, name: 'Maestro del Juego', message: 'Perfección lograda. Intenta no caer del trono.', badgeColor: 'text-rose-400' },
  { id: 'leyenda', order: 15, name: 'Leyenda', message: 'Tu juego será recordado... a menos que empieces a perder.', badgeColor: 'text-rose-500' },
  { id: 'mitico', order: 16, name: 'Jugador Mítico', message: 'Básicamente eres un genio con una racha de victorias.', badgeColor: 'text-purple-400' },
  { id: 'inmortal', order: 17, name: 'Inmortal', message: 'Las derrotas te rebotan como gotas de lluvia.', badgeColor: 'text-purple-500' },
  { id: 'imparable', order: 18, name: 'Imparable', message: 'Nada se interpone en tu camino. Excepto quizás tú mismo.', badgeColor: 'text-fuchsia-500' },
  { id: 'dios', order: 19, name: 'Dios del Backgammon', message: 'Has ascendido. Como un inmortal. Los mortales ya no pueden ganarte.', badgeColor: 'text-yellow-500 animate-pulse' },
];

export const FALLING_RANKS = [
    { id: 'maestro_caido', name: 'Maestro Caído', message: 'Ay. La caída de la grandeza es dolorosa, ¿verdad?', badgeColor: 'text-stone-500' },
    { id: 'apuros', name: 'Jugador en Apuros', message: 'Está bien. Todos tenemos días malos... semanas... meses.', badgeColor: 'text-stone-600' },
    { id: 'perdedor', name: 'Perdedor', message: 'Bueno... esto es incómodo. Hora de redimirse.', badgeColor: 'text-stone-700' },
];

// Definition of Streak Tiers based on Wins out of Last X Games
// We evaluate these sequentially. If a player meets the criteria, they qualify for at least that tier's corresponding rank range.
// Simplification: We map tiers directly to ranks for linear progression, or use them as thresholds.
// Given 20 ranks and 10 streak tiers, we can map 1 tier to ~2 ranks.

export interface StreakTier {
  winsNeeded: number;
  gamesWindow: number;
  minRankOrder: number; // The rank you achieve if you hit this ratio
}

export const STREAK_TIERS: StreakTier[] = [
  { winsNeeded: 1, gamesWindow: 2, minRankOrder: 2 }, // 1/2 -> Rank 2 (Aprendiz)
  { winsNeeded: 2, gamesWindow: 3, minRankOrder: 4 }, // 2/3 -> Rank 4 (Perfeccionista)
  { winsNeeded: 4, gamesWindow: 5, minRankOrder: 6 }, // 4/5 -> Rank 6 (Habilidoso)
  { winsNeeded: 6, gamesWindow: 8, minRankOrder: 8 }, // 6/8 -> Rank 8 (Táctico)
  { winsNeeded: 8, gamesWindow: 10, minRankOrder: 10 }, // 8/10 -> Rank 10 (Experto)
  { winsNeeded: 10, gamesWindow: 12, minRankOrder: 12 }, // 10/12 -> Rank 12 (Maestro)
  { winsNeeded: 12, gamesWindow: 15, minRankOrder: 14 }, // 12/15 -> Rank 14 (Maestro del Juego)
  { winsNeeded: 15, gamesWindow: 20, minRankOrder: 16 }, // 15/20 -> Rank 16 (Jugador Mítico)
  { winsNeeded: 18, gamesWindow: 25, minRankOrder: 18 }, // 18/25 -> Rank 18 (Imparable)
  { winsNeeded: 20, gamesWindow: 30, minRankOrder: 19 }, // 20/30 -> Rank 19 (Dios)
];
