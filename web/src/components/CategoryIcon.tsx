import { Baby, Car, Carrot, Dumbbell, Home, Package, PawPrint, Pencil, Pill, Plug, Shirt, Wrench } from 'lucide-react';

const ICONS: Record<string, typeof Home> = { casa: Home, eletronicos: Plug, ferramentas: Wrench, saude: Pill, alimentos: Carrot, pets: PawPrint, roupas: Shirt, papelaria: Pencil, auto: Car, bebe: Baby, esporte: Dumbbell, outros: Package };

/** Ícone da categoria na mesma linguagem Lucide do resto da interface (no lugar de emojis). */
export function CategoryIcon({ id, size = 18, className = '' }: { id: string; size?: number; className?: string }) {
  const Icon = ICONS[id] ?? Package;
  return <Icon size={size} className={className} aria-hidden="true" strokeWidth={2} />;
}
