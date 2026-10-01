import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Button } from './ui';

describe('Button', () => {
  it('fica desabilitado em loading mesmo com disabled={false} explícito', () => {
    const html = renderToString(<Button loading disabled={false}>Entrar</Button>);
    expect(html).toContain('disabled=""');
  });
  it('respeita disabled sem loading e fica livre quando nenhum dos dois', () => {
    expect(renderToString(<Button disabled>Ok</Button>)).toContain('disabled=""');
    expect(renderToString(<Button>Ok</Button>)).not.toContain('disabled=""');
  });
});
