import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateCommitMessage } from './commit-msg.mjs';

const script = fileURLToPath(new URL('./commit-msg.mjs', import.meta.url));

test('aceita mensagens no formato tipo: descrição', () => {
  assert.deepEqual(validateCommitMessage('feat: adiciona o uuidv7'), []);
  assert.deepEqual(validateCommitMessage('fix(api): corrige o teto diário'), []);
  assert.deepEqual(validateCommitMessage('feat!: troca o formato do id'), []);
});

test('rejeita formato inválido, tipo desconhecido e descrição vazia', () => {
  assert.equal(validateCommitMessage('adiciona o uuidv7').length, 1);
  assert.equal(validateCommitMessage('feature: x').length, 1);
  assert.equal(validateCommitMessage('feat:').length, 1);
  assert.equal(validateCommitMessage('feat: ').length, 1);
});

test('limita a primeira linha a 72 caracteres', () => {
  const prefix = 'feat: ';
  assert.equal(validateCommitMessage(prefix + 'a'.repeat(73 - prefix.length)).length, 1);
  assert.deepEqual(validateCommitMessage(prefix + 'a'.repeat(72 - prefix.length)), []);
});

test('rejeita atribuição ao Claude no corpo', () => {
  assert.equal(validateCommitMessage('feat: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>').length, 1);
  assert.equal(validateCommitMessage('feat: x\n\nco-authored-by: claude opus').length, 1);
  assert.equal(validateCommitMessage('feat: x\n\nCo-Authored-By: Outro <x@noreply@anthropic.com>').length, 1);
  assert.equal(validateCommitMessage('feat: x\n\nGenerated with [Claude Code]').length, 1);
});

test('aceita co-autoria de pessoas', () => {
  assert.deepEqual(validateCommitMessage('feat: x\n\nCo-Authored-By: Andrey <andrey@exemplo.com>'), []);
});

test('ignora linhas de comentário do git', () => {
  assert.deepEqual(validateCommitMessage('feat: x\n# Please enter...'), []);
  assert.equal(validateCommitMessage('# só comentário\n# outro').length, 1);
  assert.equal(validateCommitMessage('').length, 1);
});

test('ignora linhas em branco no final', () => {
  assert.deepEqual(validateCommitMessage('feat: x\n\n\n'), []);
});

test('aceita fixup, squash, revert e merges gerados pelo git', () => {
  assert.deepEqual(validateCommitMessage('fixup! feat: x'), []);
  assert.deepEqual(validateCommitMessage('squash! feat: x'), []);
  assert.deepEqual(validateCommitMessage('Revert "feat: x"'), []);
  assert.deepEqual(validateCommitMessage("Merge branch 'main' into x"), []);
  assert.deepEqual(validateCommitMessage('Merge pull request #1 from a/b'), []);
});

test('--range aponta só o commit inválido', () => {
  const dir = mkdtempSync(join(tmpdir(), 'commit-msg-'));
  try {
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@t.t');
    git('config', 'user.name', 't');
    git('config', 'commit.gpgsign', 'false');
    git('commit', '-q', '--allow-empty', '-m', 'feat: base');
    git('commit', '-q', '--allow-empty', '-m', 'feat: válido');
    const ok = git('rev-parse', '--short=7', 'HEAD');
    git('commit', '-q', '--allow-empty', '-m', 'mensagem sem formato');
    const bad = git('rev-parse', '--short=7', 'HEAD');
    const r = spawnSync('node', [script, '--range', 'HEAD~2..HEAD'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 1);
    const out = r.stdout + r.stderr;
    assert.ok(out.includes(`${bad}: `));
    assert.ok(!out.includes(ok));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
