import { describe, expect, it } from 'vitest';
import { safeAppUrl, toNotificationOptions } from './notification-payload';

describe('toNotificationOptions', () => {
  it('monta título, corpo, ícones, tag e dados de clique', () => {
    const { title, options } = toNotificationOptions({
      id: 'n1',
      title: 'Nova evidência',
      body: 'Alguém respondeu',
      url: '/m/1',
      topic: 'missao-1',
    });
    expect(title).toBe('Nova evidência');
    expect(options).toMatchObject({
      body: 'Alguém respondeu',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'missao-1',
      data: { url: '/m/1', id: 'n1' },
    });
  });

  it('sem tópico não define tag', () => {
    const { options } = toNotificationOptions({ id: 'n2', title: 't', body: 'b', url: '/', topic: null });
    expect(options.tag).toBeUndefined();
  });

  it('troca url externa por /notificacoes nos dados', () => {
    const { options } = toNotificationOptions({ id: 'n3', title: 't', body: 'b', url: 'https://evil', topic: null });
    expect(options.data.url).toBe('/notificacoes');
  });
});

describe('safeAppUrl', () => {
  it('aceita caminhos do app', () => expect(safeAppUrl('/m/1')).toBe('/m/1'));
  it('rejeita URL absoluta', () => expect(safeAppUrl('https://evil')).toBe('/notificacoes'));
  it('rejeita URL sem protocolo', () => expect(safeAppUrl('//evil')).toBe('/notificacoes'));
  it('rejeita valores que não são texto', () => expect(safeAppUrl(undefined)).toBe('/notificacoes'));
});
