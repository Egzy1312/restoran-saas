import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy, JwtPayload } from './jwt.strategy';

describe('JwtStrategy', () => {
  let prisma: any;
  let strategy: JwtStrategy;

  const payload: JwtPayload = { sub: 'user-1', restaurant_id: 'rest-1', role: 'WAITER' as any, email: 'a@b.ba' };

  beforeEach(() => {
    // JWT_SECRET nije bitan ovdje - strategija ga koristi samo interno u passport-jwt konstruktoru.
    const config = { get: jest.fn().mockReturnValue('test-secret') };
    prisma = { staffUser: { findUnique: jest.fn() } };
    strategy = new JwtStrategy(config as any, prisma);
  });

  it('propusta aktivan nalog sa aktivnim restoranom, koristeci SVJEZE podatke iz baze (ne JWT payload)', async () => {
    prisma.staffUser.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.ba',
      role: 'ADMIN', // promijenjeno u bazi nakon izdavanja tokena (payload i dalje kaze WAITER)
      restaurantId: 'rest-1',
      isActive: true,
      restaurant: { id: 'rest-1', isActive: true },
    });

    const result = await strategy.validate(payload);

    expect(result).toEqual({ userId: 'user-1', restaurantId: 'rest-1', role: 'ADMIN', email: 'a@b.ba' });
  });

  it('baca UnauthorizedException ako je nalog deaktiviran', async () => {
    prisma.staffUser.findUnique.mockResolvedValue({
      id: 'user-1',
      isActive: false,
      restaurant: { isActive: true },
    });

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('baca UnauthorizedException ako je restoran suspendovan - ovo je bio propust prije popravke (suspendovanje nije blokiralo osoblje)', async () => {
    prisma.staffUser.findUnique.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      restaurantId: 'rest-1',
      restaurant: { id: 'rest-1', isActive: false },
    });

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('baca UnauthorizedException ako nalog vise ne postoji (npr. obrisan nakon izdavanja tokena)', async () => {
    prisma.staffUser.findUnique.mockResolvedValue(null);
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('SUPER_ADMIN (bez restorana) prolazi bez provjere suspenzije', async () => {
    prisma.staffUser.findUnique.mockResolvedValue({
      id: 'super-1',
      isActive: true,
      restaurantId: null,
      role: 'SUPER_ADMIN',
      email: 'super@platforma.test',
      restaurant: null,
    });

    const result = await strategy.validate({ ...payload, sub: 'super-1' });
    expect(result.restaurantId).toBe('');
  });
});
