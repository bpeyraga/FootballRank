import { describe, expect, it } from 'vitest';
import { challengeExpiry, parseChallenge, powErrorText, sha256Hex, solve, type PowChallenge } from './pow';

const make = async (n: number, maxnumber = 2000): Promise<PowChallenge> => {
  const salt = 'abcdef0123456789abcdef01?expires=4102444800';
  return { algorithm: 'SHA-256', salt, challenge: await sha256Hex(salt + n), maxnumber, signature: 'f'.repeat(64) };
};

describe('prueba de trabajo del registro', () => {
  it('sha256Hex da el hash conocido', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('encuentra el número secreto', async () => {
    const c = await make(1234);
    expect(await solve(c)).toEqual({ salt: c.salt, challenge: c.challenge, signature: c.signature, number: '1234' });
  });

  it('encuentra el 0 y el máximo', async () => {
    expect((await solve(await make(0, 50)))?.number).toBe('0');
    expect((await solve(await make(50, 50)))?.number).toBe('50');
  });

  it('null si el número está fuera de rango o se cancela', async () => {
    expect(await solve(await make(80, 50))).toBeNull();
    let calls = 0;
    expect(await solve(await make(1500), sha256Hex, () => ++calls > 1, 100)).toBeNull();
  });

  it('valida el desafío que manda la base', async () => {
    const c = await make(1);
    expect(parseChallenge(c)).toEqual(c);
    expect(parseChallenge(null)).toBeNull();
    expect(parseChallenge({ ...c, algorithm: 'MD5' })).toBeNull();
    expect(parseChallenge({ ...c, challenge: 'xyz' })).toBeNull();
    expect(parseChallenge({ ...c, maxnumber: 0 })).toBeNull();
    expect(parseChallenge({ ...c, maxnumber: 5_000_000 })).toBeNull();
    expect(parseChallenge({ ...c, salt: '' })).toBeNull();
  });

  it('lee el vencimiento del salt', () => {
    expect(challengeExpiry('aa?expires=1700000000')).toBe(1_700_000_000_000);
    expect(challengeExpiry('aa')).toBeNull();
  });

  it('traduce el rechazo de la base', () => {
    expect(powErrorText('Database error saving new user')).toMatch(/verificar/);
    expect(powErrorText('Invalid login credentials')).toBeNull();
  });
});
