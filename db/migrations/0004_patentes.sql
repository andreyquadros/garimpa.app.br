-- Pepita Social · patentes alinhadas ao guia visual (Explorador 0, Garimpeiro 100, Guia local 350, Guardião 900, Lenda local 1800).
-- A carência curta passa a valer a partir de Guardião (900 XP). Nomes de nível vivem no código; aqui só o limiar.
update settings set value = jsonb_set(value, '{xp_carencia_curta}', '900'), updated_at = now()
where key = 'economia' and (value->>'xp_carencia_curta')::int = 800;
