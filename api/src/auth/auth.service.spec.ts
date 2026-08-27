import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

// otplib (2FA) tranzitivno zavisi od @scure/base i @noble/hashes, koji su
// cist ESM ("export ...") - ts-jest/Jest u ovom CJS test okruzenju ne mogu
// da ih parsiraju ("Unexpected token export"), bez obzira na
// transformIgnorePatterns (lanac ESM zavisnosti ide nekoliko nivoa dublje).
// Umjesto da lovimo svaki tranzitivni paket, mockujemo 'otplib' STVARNOM
// (ne lazno-uvijek-tacnom) RFC 6238 TOTP implementacijom preko Node-ovog
// ugradjenog `crypto` HMAC-a - test i dalje provjerava pravu matematiku
// (pogresan kod STVARNO ne prolazi), samo bez otplib-ovog ESM lanca.
jest.mock('otplib', () => {
  const nodeCrypto = require('crypto');
  const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  function base32Decode(input: string): Buffer {
    let bits = '';
    for (const char of input.toUpperCase().replace(/=+$/, '')) {
      const val = BASE32_ALPHABET.indexOf(char);
      if (val === -1) continue;
      bits += val.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.substr(i, 8), 2));
    return Buffer.from(bytes);
  }

  function base32Encode(buffer: Buffer): string {
    let bits = '';
    for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
    let output = '';
    for (let i = 0; i + 5 <= bits.length; i += 5) output += BASE32_ALPHABET[parseInt(bits.substr(i, 5), 2)];
    return output;
  }

  function hotp(secretBuffer: Buffer, counter: number): string {
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const hmac = nodeCrypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const code =
      ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
    return (code % 1000000).toString().padStart(6, '0');
  }

  function totpToken(secret: string): string {
    return hotp(base32Decode(secret), Math.floor(Date.now() / 1000 / 30));
  }

  return {
    generateSecret: () => base32Encode(nodeCrypto.randomBytes(20)),
    generateURI: ({ issuer, label, secret }: { issuer: string; label: string; secret: string }) =>
      `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}`,
    generate: async ({ secret }: { secret: string }) => totpToken(secret),
    verify: async ({ secret, token }: { secret: string; token: string }) => ({ valid: totpToken(secret) === token }),
  };
});

import { generate as generateTotp, generateSecret as generateTotpSecret } from 'otplib';

describe('AuthService', () => {
  const validPassword = 'super-secret-1';
  let passwordHash: string;

  const baseUser = {
    id: 'user-1',
    restaurantId: 'rest-1',
    role: 'MANAGER',
    email: 'manager@restoran.test',
    fullName: 'Test Manager',
    isActive: true,
    failedLoginAttempts: 0,
    lockedUntil: null as Date | null,
    totpEnabled: false,
    totpSecret: null as string | null,
    emailVerifiedAt: null as Date | null,
  };

  let prisma: {
    staffUser: { findUnique: jest.Mock; update: jest.Mock };
    restaurant: { create: jest.Mock; findUnique: jest.Mock };
    passwordResetToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    emailVerificationToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let config: { get: jest.Mock };
  let email: { sendPasswordReset: jest.Mock; sendEmailVerification: jest.Mock };
  let service: AuthService;

  beforeAll(async () => {
    // Pravi bcrypt hash (ne mock) - da compare() test bude stvarna provjera
    // lozinke, ne samo da vraca ono sto smo mu rekli da vrati.
    passwordHash = await bcrypt.hash(validPassword, 4);
  });

  beforeEach(() => {
    prisma = {
      staffUser: { findUnique: jest.fn(), update: jest.fn() },
      restaurant: { create: jest.fn(), findUnique: jest.fn() },
      passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      emailVerificationToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    };
    jwt = {
      signAsync: jest.fn().mockImplementation((payload) => Promise.resolve(`signed:${JSON.stringify(payload)}`)),
      verifyAsync: jest.fn(),
    };
    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const defaults: Record<string, unknown> = { MAX_LOGIN_ATTEMPTS: 5, LOGIN_LOCKOUT_MINUTES: 15, REFRESH_EXPIRES_IN: '30d' };
        return defaults[key] ?? fallback;
      }),
    };
    email = { sendPasswordReset: jest.fn().mockResolvedValue({ sent: true }), sendEmailVerification: jest.fn().mockResolvedValue({ sent: true }) };
    service = new AuthService(prisma as any, jwt as any, config as any, email as any);
  });

  describe('login', () => {
    it('vraca access_token, refresh_token i user pri ispravnim kredencijalima', async () => {
      prisma.staffUser.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

      const result = await service.login({ email: baseUser.email, password: validPassword });
      if (!('access_token' in result)) throw new Error('Očekivani direktni tokeni (bez 2FA), dobiven requires_2fa.');

      expect(result.access_token).toContain('signed:');
      expect(result.refresh_token).toContain('"type":"refresh"');
      expect(result.user).toEqual({
        id: baseUser.id,
        email: baseUser.email,
        full_name: baseUser.fullName,
        role: baseUser.role,
        restaurant_id: baseUser.restaurantId,
        email_verified: false,
        totp_enabled: false,
      });
    });

    it('vraca requires_2fa + pre_auth_token (BEZ pravih tokena) kad nalog ima ukljucen 2FA', async () => {
      prisma.staffUser.findUnique.mockResolvedValue({ ...baseUser, passwordHash, totpEnabled: true, totpSecret: 'JBSWY3DPEHPK3PXP' });

      const result = await service.login({ email: baseUser.email, password: validPassword });

      expect(result).toEqual({ requires_2fa: true, pre_auth_token: expect.stringContaining('signed:') });
    });

    it('zakljucava nalog nakon MAX_LOGIN_ATTEMPTS pogresnih lozinki zaredom', async () => {
      config.get.mockImplementation((key: string, fallback?: unknown) => {
        if (key === 'MAX_LOGIN_ATTEMPTS') return 3;
        if (key === 'LOGIN_LOCKOUT_MINUTES') return 15;
        return fallback ?? '30d';
      });
      prisma.staffUser.findUnique.mockResolvedValue({ ...baseUser, passwordHash, failedLoginAttempts: 2 });

      await expect(service.login({ email: baseUser.email, password: 'pogresna' })).rejects.toThrow(UnauthorizedException);

      expect(prisma.staffUser.update).toHaveBeenCalledWith({
        where: { id: baseUser.id },
        data: { failedLoginAttempts: 0, lockedUntil: expect.any(Date) },
      });
    });

    it('odbija login ako je nalog trenutno zakljucan (cak i sa ISPRAVNOM lozinkom)', async () => {
      prisma.staffUser.findUnique.mockResolvedValue({ ...baseUser, passwordHash, lockedUntil: new Date(Date.now() + 5 * 60000) });

      await expect(service.login({ email: baseUser.email, password: validPassword })).rejects.toThrow(UnauthorizedException);
      // Ne smije stici do faze koja resetuje/mijenja pokusaje - odbijeno je prije provjere lozinke.
      expect(prisma.staffUser.update).not.toHaveBeenCalled();
    });

    it('baca UnauthorizedException za pogresnu lozinku', async () => {
      prisma.staffUser.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

      await expect(service.login({ email: baseUser.email, password: 'pogresna' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('baca UnauthorizedException za nepostojeceg korisnika', async () => {
      prisma.staffUser.findUnique.mockResolvedValue(null);

      await expect(service.login({ email: 'nema@nikog.test', password: validPassword })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('baca UnauthorizedException za deaktivirani nalog', async () => {
      prisma.staffUser.findUnique.mockResolvedValue({ ...baseUser, passwordHash, isActive: false });

      await expect(service.login({ email: baseUser.email, password: validPassword })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('izdaje nov par tokena za validan refresh token', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: baseUser.id, type: 'refresh' });
      prisma.staffUser.findUnique.mockResolvedValue(baseUser);

      const result = await service.refresh({ refresh_token: 'neki-refresh-token' });

      expect(result.access_token).toContain('signed:');
      expect(result.user.id).toBe(baseUser.id);
    });

    it('baca UnauthorizedException ako verifyAsync baci gresku (istekao/nevazeci token)', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(service.refresh({ refresh_token: 'bilo-sta' })).rejects.toThrow(UnauthorizedException);
    });

    it('baca UnauthorizedException ako payload.type nije "refresh" (npr. neko posalje access token)', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: baseUser.id, restaurant_id: baseUser.restaurantId, role: baseUser.role, email: baseUser.email });

      await expect(service.refresh({ refresh_token: 'access-token-umjesto-refresh' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('baca UnauthorizedException ako korisnik vise ne postoji ili je deaktiviran', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'obrisan-user', type: 'refresh' });
      prisma.staffUser.findUnique.mockResolvedValue(null);

      await expect(service.refresh({ refresh_token: 'neki-refresh-token' })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register - self-service registracija tenanta', () => {
    it('kreira restoran + prvi ADMIN nalog i vraca tokene', async () => {
      prisma.staffUser.findUnique.mockResolvedValue(null); // email slobodan
      prisma.restaurant.findUnique.mockResolvedValue(null); // slug slobodan (nema kolizije)
      const createdRestaurant = { id: 'rest-nov', slug: 'nova-konoba' };
      const createdStaffUser = { id: 'user-nov', restaurantId: 'rest-nov', role: 'ADMIN', email: 'vlasnik@test.ba', fullName: 'Vlasnik' };
      prisma.$transaction.mockImplementation(async (cb: any) =>
        cb({
          restaurant: { create: jest.fn().mockResolvedValue(createdRestaurant) },
          staffUser: { create: jest.fn().mockResolvedValue(createdStaffUser) },
        }),
      );

      const result = await service.register({
        restaurant_name: 'Nova Konoba',
        address: 'Ulica 1',
        owner_full_name: 'Vlasnik',
        email: 'vlasnik@test.ba',
        password: 'lozinka123',
      });

      expect(result.access_token).toContain('signed:');
      expect(result.user).toMatchObject({ email: 'vlasnik@test.ba', role: 'ADMIN', restaurant_id: 'rest-nov' });
    });

    it('baca ConflictException ako email vec postoji', async () => {
      prisma.staffUser.findUnique.mockResolvedValue({ id: 'postojeci' });

      await expect(
        service.register({
          restaurant_name: 'Nova Konoba',
          address: 'Ulica 1',
          owner_full_name: 'Vlasnik',
          email: 'zauzet@test.ba',
          password: 'lozinka123',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('dodaje sufiks slug-u ako je bazni slug vec zauzet', async () => {
      prisma.staffUser.findUnique.mockResolvedValue(null);
      // Prvi poziv (bazni slug) vraca "zauzeto", drugi (sa -2) vraca slobodno.
      prisma.restaurant.findUnique.mockResolvedValueOnce({ id: 'neko-drugi' }).mockResolvedValueOnce(null);
      let capturedSlug = '';
      prisma.$transaction.mockImplementation(async (cb: any) =>
        cb({
          restaurant: {
            create: jest.fn().mockImplementation(({ data }: any) => {
              capturedSlug = data.slug;
              return Promise.resolve({ id: 'rest-nov', slug: data.slug });
            }),
          },
          staffUser: { create: jest.fn().mockResolvedValue({ id: 'u', restaurantId: 'rest-nov', role: 'ADMIN', email: 'a@b.ba', fullName: 'A' }) },
        }),
      );

      await service.register({
        restaurant_name: 'Konoba Adriatic',
        address: 'Ulica 1',
        owner_full_name: 'A',
        email: 'a@b.ba',
        password: 'lozinka123',
      });

      expect(capturedSlug).toBe('konoba-adriatic-2');
    });
  });

  describe('forgotPassword', () => {
    it('kreira reset token i salje email kad nalog postoji i aktivan je', async () => {
      prisma.staffUser.findUnique.mockResolvedValue(baseUser);

      const result = await service.forgotPassword({ email: baseUser.email });

      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      expect(email.sendPasswordReset).toHaveBeenCalledTimes(1);
      expect(result.message).toContain('Ako nalog postoji');
    });

    it('NE kreira token niti salje email za nepostojeci nalog, ali vraca ISTU poruku (bez otkrivanja da nalog ne postoji)', async () => {
      prisma.staffUser.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword({ email: 'nepostojeci@test.ba' });

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(email.sendPasswordReset).not.toHaveBeenCalled();
      expect(result.message).toContain('Ako nalog postoji');
    });

    it('NE kreira token za deaktiviran nalog', async () => {
      prisma.staffUser.findUnique.mockResolvedValue({ ...baseUser, isActive: false });

      await service.forgotPassword({ email: baseUser.email });

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('mijenja lozinku i oznacava token kao iskoristen za validan token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        staffUserId: baseUser.id,
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
      });
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await service.resetPassword({ token: 'validan-token', password: 'novaLozinka1' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.message).toContain('uspješno promijenjena');
    });

    it('baca BadRequestException za nepostojeci token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword({ token: 'ne-postoji', password: 'novaLozinka1' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('baca BadRequestException za istekao token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        staffUserId: baseUser.id,
        expiresAt: new Date(Date.now() - 60000),
        usedAt: null,
      });

      await expect(service.resetPassword({ token: 'istekao', password: 'novaLozinka1' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('baca BadRequestException za vec iskoristen token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        staffUserId: baseUser.id,
        expiresAt: new Date(Date.now() + 60000),
        usedAt: new Date(),
      });

      await expect(service.resetPassword({ token: 'iskoristen', password: 'novaLozinka1' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('2FA (TOTP)', () => {
    it('setupTwoFactor generise tajnu i cuva je (totpEnabled i dalje false)', async () => {
      prisma.staffUser.findUnique.mockResolvedValue(baseUser);

      const result = await service.setupTwoFactor(baseUser.id);

      expect(result.secret).toBeTruthy();
      expect(result.otpauth_url).toContain('otpauth://totp/');
      expect(prisma.staffUser.update).toHaveBeenCalledWith({
        where: { id: baseUser.id },
        data: { totpSecret: result.secret, totpEnabled: false },
      });
    });

    it('enableTwoFactor prihvata VALIDAN kod generisan sa stvarnim otplib-om i ukljucuje 2FA', async () => {
      const secret = generateTotpSecret();
      const validCode = await generateTotp({ secret });
      prisma.staffUser.findUnique.mockResolvedValue({ ...baseUser, totpSecret: secret });

      const result = await service.enableTwoFactor(baseUser.id, validCode);

      expect(result).toEqual({ enabled: true });
      expect(prisma.staffUser.update).toHaveBeenCalledWith({ where: { id: baseUser.id }, data: { totpEnabled: true } });
    });

    it('enableTwoFactor odbija NEISPRAVAN kod', async () => {
      const secret = generateTotpSecret();
      prisma.staffUser.findUnique.mockResolvedValue({ ...baseUser, totpSecret: secret });

      await expect(service.enableTwoFactor(baseUser.id, '000000')).rejects.toThrow(BadRequestException);
    });

    it('enableTwoFactor baca BadRequestException ako setup nije pokrenut (nema totpSecret)', async () => {
      prisma.staffUser.findUnique.mockResolvedValue(baseUser);

      await expect(service.enableTwoFactor(baseUser.id, '123456')).rejects.toThrow(BadRequestException);
    });

    it('login sa 2FA nalogom vraca pre_auth_token, pa verifyTwoFactor sa validnim kodom izdaje prave tokene', async () => {
      const secret = generateTotpSecret();
      const user2fa = { ...baseUser, passwordHash, totpEnabled: true, totpSecret: secret };
      prisma.staffUser.findUnique.mockResolvedValue(user2fa);

      const loginResult = await service.login({ email: baseUser.email, password: validPassword });
      if (!('pre_auth_token' in loginResult)) throw new Error('Očekivan requires_2fa odgovor.');

      // verifyAsync mora "razumjeti" nas jwt.signAsync mock format (JSON string nakon "signed:")
      jwt.verifyAsync.mockImplementation((token: string) => Promise.resolve(JSON.parse(token.replace('signed:', ''))));

      const validCode = await generateTotp({ secret });
      const verifyResult = await service.verifyTwoFactor({ pre_auth_token: loginResult.pre_auth_token, token: validCode });

      expect(verifyResult.access_token).toContain('signed:');
      expect(verifyResult.user.id).toBe(baseUser.id);
    });

    it('verifyTwoFactor odbija NEISPRAVAN kod', async () => {
      const secret = generateTotpSecret();
      jwt.verifyAsync.mockResolvedValue({ sub: baseUser.id, type: 'pre_2fa' });
      prisma.staffUser.findUnique.mockResolvedValue({ ...baseUser, totpEnabled: true, totpSecret: secret });

      await expect(service.verifyTwoFactor({ pre_auth_token: 'nebitno', token: '000000' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('verifyTwoFactor odbija istekao/nevazeci pre_auth_token', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(service.verifyTwoFactor({ pre_auth_token: 'istekao', token: '123456' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('disableTwoFactor zahtijeva ISPRAVNU lozinku (ne samo vazeci JWT)', async () => {
      prisma.staffUser.findUnique.mockResolvedValue({ ...baseUser, passwordHash, totpEnabled: true, totpSecret: 'ABC' });

      await expect(service.disableTwoFactor(baseUser.id, 'pogresna-lozinka')).rejects.toThrow(UnauthorizedException);

      const result = await service.disableTwoFactor(baseUser.id, validPassword);
      expect(result).toEqual({ enabled: false });
      expect(prisma.staffUser.update).toHaveBeenCalledWith({ where: { id: baseUser.id }, data: { totpEnabled: false, totpSecret: null } });
    });

    it('disableTwoFactor baca NotFoundException za nepostojeci nalog', async () => {
      prisma.staffUser.findUnique.mockResolvedValue(null);

      await expect(service.disableTwoFactor('ne-postoji', 'bilo-sta')).rejects.toThrow(NotFoundException);
    });
  });

  describe('email verifikacija', () => {
    it('register() kreira verifikacioni token i salje email (email_verified: false u odgovoru)', async () => {
      prisma.staffUser.findUnique.mockResolvedValue(null);
      prisma.restaurant.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (cb: any) =>
        cb({
          restaurant: { create: jest.fn().mockResolvedValue({ id: 'rest-nov', slug: 'nova-konoba' }) },
          staffUser: {
            create: jest.fn().mockResolvedValue({ id: 'user-nov', restaurantId: 'rest-nov', role: 'ADMIN', email: 'a@b.ba', fullName: 'A', emailVerifiedAt: null }),
          },
        }),
      );

      const result = await service.register({
        restaurant_name: 'Nova Konoba',
        address: 'Ulica 1',
        owner_full_name: 'A',
        email: 'a@b.ba',
        password: 'lozinka123',
      });

      expect(prisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
      expect(email.sendEmailVerification).toHaveBeenCalledTimes(1);
      expect(result.user.email_verified).toBe(false);
    });

    it('verifyEmail oznacava nalog kao verifikovan za validan token', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        staffUserId: baseUser.id,
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
      });
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await service.verifyEmail({ token: 'validan' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.message).toContain('uspješno potvrđen');
    });

    it('verifyEmail baca BadRequestException za istekao token', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        staffUserId: baseUser.id,
        expiresAt: new Date(Date.now() - 60000),
        usedAt: null,
      });

      await expect(service.verifyEmail({ token: 'istekao' })).rejects.toThrow(BadRequestException);
    });

    it('resendVerification NE salje email ako je nalog vec verifikovan (ali vraca istu poruku)', async () => {
      prisma.staffUser.findUnique.mockResolvedValue({ ...baseUser, emailVerifiedAt: new Date() });

      const result = await service.resendVerification({ email: baseUser.email });

      expect(email.sendEmailVerification).not.toHaveBeenCalled();
      expect(result.message).toContain('Ako nalog postoji');
    });

    it('resendVerification salje NOV email ako nalog postoji i jos NIJE verifikovan', async () => {
      prisma.staffUser.findUnique.mockResolvedValue({ ...baseUser, emailVerifiedAt: null });

      await service.resendVerification({ email: baseUser.email });

      expect(email.sendEmailVerification).toHaveBeenCalledTimes(1);
    });
  });
});
