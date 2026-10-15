#!/usr/bin/env node
// Valida mensagens de commit (ADR-0002): formato `tipo(escopo)!: descrição` e proibição de atribuição ao Claude.
// Usado pelo hook commit-msg do lefthook (arquivo) e pelo CI (`--range base..head`).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const FORMAT = /^(feat|fix|refactor|perf|test|docs|infra|ci|chore|style)(\([a-z0-9-]+\))?!?: \S/;
const MAX_FIRST_LINE = 72;

// Mensagens que o próprio git gera; não seguem o formato, mas precisam passar (rebase --autosquash, reverts, merges).
const GIT_GENERATED = /^(fixup! |squash! |amend! |Revert "|Merge (branch|pull request|remote-tracking branch|tag) )/;

const ATTRIBUTION = [
  { pattern: /^co-authored-by:.*\bclaude\b/im, reason: 'Co-Authored-By do Claude' },
  { pattern: /noreply@anthropic\.com/i, reason: 'e-mail noreply@anthropic.com' },
  { pattern: /generated with \[?claude/i, reason: '"Generated with Claude Code"' },
];

/**
 * @param {string} message
 * @returns {string[]} erros em português; lista vazia significa mensagem válida
 */
export function validateCommitMessage(message) {
  // O git remove os comentários antes de gravar o commit; aqui fazemos o mesmo para o hook ver o texto final.
  const lines = message.split(/\r?\n/).filter((line) => !line.startsWith('#'));
  while (lines.length > 0 && lines.at(-1).trim() === '') lines.pop();

  if (lines.length === 0) return ['A mensagem de commit está vazia.'];

  const errors = [];
  const first = lines[0];

  if (!GIT_GENERATED.test(first)) {
    if (!FORMAT.test(first)) {
      errors.push(
        `A primeira linha deve seguir "tipo(escopo): descrição" com tipo em feat, fix, refactor, perf, test, docs, infra, ci, chore ou style (recebido: "${first}").`,
      );
    }
    if (first.length > MAX_FIRST_LINE) {
      errors.push(`A primeira linha tem ${first.length} caracteres; o máximo é ${MAX_FIRST_LINE}.`);
    }
  }

  const text = lines.join('\n');
  // Um erro só, mesmo que a atribuição case com mais de um padrão (ex.: Co-Authored-By com o e-mail).
  const found = ATTRIBUTION.find(({ pattern }) => pattern.test(text));
  if (found) errors.push(`A mensagem não pode conter atribuição ao Claude (${found.reason}); veja o CLAUDE.md.`);

  return errors;
}

function validateRange(range) {
  let output;
  try {
    output = execFileSync('git', ['log', '--format=%H%x00%B%x1e', range], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    console.error(
      `✖ Não foi possível ler o intervalo "${range}" no git: ${error.stderr?.toString().trim() || error.message}`,
    );
    return 2;
  }

  let failed = false;
  for (const record of output.split('\x1e')) {
    if (record.trim() === '') continue;
    const [hash, body = ''] = record.trim().split('\x00');
    for (const error of validateCommitMessage(body)) {
      failed = true;
      console.error(`${hash.slice(0, 7)}: ${error}`);
    }
  }
  return failed ? 1 : 0;
}

function main(args) {
  if (args[0] === '--range' && args.length === 2) return validateRange(args[1]);

  if (args.length === 1 && !args[0].startsWith('--')) {
    let message;
    try {
      message = readFileSync(args[0], 'utf8');
    } catch (error) {
      console.error(`✖ Não foi possível ler o arquivo da mensagem: ${error.message}`);
      return 2;
    }
    const errors = validateCommitMessage(message);
    for (const error of errors) console.error(`✖ ${error}`);
    return errors.length > 0 ? 1 : 0;
  }

  console.error('Uso: node scripts/commit-msg.mjs <arquivo> | --range <base>..<head>');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
