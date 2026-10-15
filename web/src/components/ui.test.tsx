import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Wordmark } from './brand';
import { Button, Spinner } from './ui';

describe('Button', () => {
  it('fica desabilitado em loading mesmo com disabled={false} explícito', () => {
    const html = renderToString(
      <Button loading disabled={false}>
        Entrar
      </Button>,
    );
    expect(html).toContain('disabled=""');
  });
  it('respeita disabled sem loading e fica livre quando nenhum dos dois', () => {
    expect(renderToString(<Button disabled>Ok</Button>)).toContain('disabled=""');
    expect(renderToString(<Button>Ok</Button>)).not.toContain('disabled=""');
  });
});

// `aria-label` em <span> sem papel é ignorado por leitores de tela; o papel é o que faz o nome valer.
describe('nomes acessíveis', () => {
  it('Spinner anuncia "carregando" como status', () => {
    const html = renderToString(<Spinner />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="carregando"');
  });
  it('Wordmark é uma imagem com o nome da marca', () => {
    const html = renderToString(<Wordmark />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Pepita Social"');
  });
});
