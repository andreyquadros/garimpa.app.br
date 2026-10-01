export type Level = { level: number; name: string; xp: number; perk: string; next: { level: number; name: string; xp: number } | null; progress: number; toNext: number };
export type User = { id: string; name: string; handle: string; email: string | null; avatarUrl: string | null; xp: number; credits: number; creditsPending: number; trust: number; streakDays: number; role: 'user' | 'moderator' | 'admin'; createdAt: string };
export type Badge = { slug: string; name: string; description: string; icon: string; earnedAt?: string };
export type Me = { user: User; level: Level; badges: Badge[]; stats: { perguntas: number; respostas: number; achados: number; confirmacoes: number; gorjetasRecebidas: number; proximaLiberacao: string | null }; rank: number };
export type AppConfig = {
  city: { id: string; name: string; state: string; lat: number; lng: number; radiusM: number } | null;
  googleClientId: string | null; devLogin: boolean;
  levels: Array<{ level: number; name: string; xp: number; perk: string }>;
  economy: { xp: Record<string, number>; pepitas: Record<string, number>; limites_dia: Record<string, number>; carencia_dias: number; conversao: { pepitas_por_real: number; minimo_resgate_pepitas: number; percentual_cofre: number }; evidencia_forte: number };
  tiles: { url: string; fallbackUrl: string; minZoom: number; maxZoom: number };
};
export type PlaceLite = { id: string; name: string; lat: number; lng: number; kind: string; status?: string; priceCents?: number | null; address?: string | null; partnerTier?: string | null; finds?: number; distanceM?: number | null };
export type Similar = { id: string; title: string; status: string; category: string; answersCount: number; followersCount: number; createdAt: string; score: number; places: PlaceLite[] };
export type Find = { placeId: string; name: string; kind: string; lat: number; lng: number; address: string | null; partnerTier: string | null; finds: number; titles: string[]; lastFindAt: string };
export type OpenPin = { id: string; title: string; category: string; bounty: number; followersCount: number; lat: number; lng: number; createdAt: string };
export type QuestionListItem = {
  id: string; title: string; category: string; status: string; bounty: number; answersCount: number; followersCount: number; createdAt: string; solvedAt: string | null;
  lat: number | null; lng: number | null; photoPath: string | null; authorId: string; authorName: string; authorAvatar: string | null; authorXp: number; topPlace: string | null; distanceM: number | null;
};
export type Evidence = { id: string; url: string; kind: string; score: number; flags: string[]; width: number; height: number; hasGps: boolean; takenAt: string | null; distanceExifM: number | null; distanceDeviceM: number | null };
export type Answer = {
  id: string; note: string | null; priceCents: number | null; seenOn: string | null; status: string; evidenceScore: number; isFirstForPlace: boolean; confirms: number; denies: number; createdAt: string;
  placeId: string; placeName: string; placeAddress: string | null; placeLat: number; placeLng: number; placeKind: string; partnerTier: string | null;
  authorId: string; authorName: string; authorAvatar: string | null; authorXp: number;
  evidences: Evidence[]; tips: Array<{ id: string; amount: number; from: string }>; myVote: 1 | -1 | null;
};
export type Question = QuestionListItem & { details: string | null; tipBudgetLeft: number; acceptedAnswerId: string | null; authorHandle: string; iFollow: boolean };
export type QuestionDetail = { question: Question; answers: Answer[]; canAccept: boolean };
export type RankRow = { id: string; name: string; handle: string; avatarUrl: string | null; xp: number; pontos: number; streakDays: number; pos: number; level: Level };
export type LedgerItem = { id: number; kind: string; xp: number; credits: number; state: string; vestsAt: string | null; refType: string | null; refId: string | null; meta: Record<string, unknown>; createdAt: string };
export type UploadResult = { id: string; url: string; width: number; height: number; kind: string; flags: string[]; exif: { hasGps: boolean; takenAt: string | null }; device: { hasLocation: boolean } };
