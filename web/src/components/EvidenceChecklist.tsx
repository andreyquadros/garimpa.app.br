import { motion } from 'motion/react';
import { Check, AlertTriangle, Camera } from 'lucide-react';

export type Check = { ok: boolean | null; label: string; help?: string };

export function checksFromUpload(u: { flags: string[]; exif: { hasGps: boolean; takenAt: string | null }; device: { hasLocation: boolean } }): Check[] {
  const recent = u.exif.takenAt ? (Date.now() - new Date(u.exif.takenAt).getTime()) / 86400000 <= 30 : false;
  return [
    { ok: true, label: 'Foto enviada e limpa de dados pessoais' },
    { ok: u.exif.hasGps, label: u.exif.hasGps ? 'A foto tem GPS' : 'A foto não tem GPS', help: u.exif.hasGps ? 'Vamos conferir se bate com a loja.' : 'Tire pelo app da câmera com a localização ligada: vale mais.' },
    { ok: u.exif.takenAt ? recent : false, label: u.exif.takenAt ? (recent ? 'Foto recente' : 'Foto antiga') : 'Foto sem data', help: !u.exif.takenAt ? 'Prints e fotos encaminhadas perdem a data.' : undefined },
    { ok: u.device.hasLocation, label: u.device.hasLocation ? 'Enviada com a sua localização' : 'Sem a sua localização', help: u.device.hasLocation ? undefined : 'Permita a localização para provar que você esteve lá.' },
    ...(u.flags.includes('foto_reutilizada') ? [{ ok: false, label: 'Você já usou essa foto antes', help: 'Foto repetida não rende pepitas.' } as Check] : []),
  ];
}

export function EvidenceChecklist({ checks, score }: { checks: Check[]; score?: number }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <ul className="space-y-2">
        {checks.map((c, i) => (
          <motion.li key={c.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} className="flex gap-2.5 items-start">
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.12 + 0.1, type: 'spring', stiffness: 500, damping: 18 }}
              className={`mt-0.5 h-5 w-5 rounded-full grid place-items-center shrink-0 ${c.ok ? 'bg-mata-500 text-white' : c.ok === null ? 'bg-line' : 'bg-pepita-200 text-pepita-700'}`}>
              {c.ok ? <Check size={13} strokeWidth={3} /> : c.ok === null ? <Camera size={12} /> : <AlertTriangle size={12} strokeWidth={2.5} />}
            </motion.span>
            <span className="text-sm leading-snug">
              <span className="font-semibold">{c.label}</span>
              {c.help && <span className="block text-ink-2">{c.help}</span>}
            </span>
          </motion.li>
        ))}
      </ul>
      {score != null && (
        <div className="mt-3">
          <div className="flex justify-between text-xs font-semibold text-ink-2"><span>Força da prova</span><span>{score}/100</span></div>
          <div className="h-2 rounded-full bg-line mt-1 overflow-hidden">
            <motion.div className={`h-full rounded-full ${score >= 60 ? 'bg-mata-500' : 'bg-pepita-400'}`} initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
          </div>
          <p className="text-xs text-ink-2 mt-1">{score >= 60 ? 'Prova forte: rende XP já e pepitas assim que for aceita ou confirmada.' : 'Prova fraca: vale XP menor e precisa de confirmação de outras pessoas para render pepitas.'}</p>
        </div>
      )}
    </div>
  );
}
