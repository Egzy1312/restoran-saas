import { randomBytes } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { generateSecret, generateURI, verify as verifyTotp } from 'otplib';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { TwoFactorVerifyDto } from './dto/two-factor-verify.dto';

interface RefreshPayload {
  sub: string;
  type: 'refresh';
}

interface PreTwoFactorPayload {
  sub: string;
  type: 'pre_2fa';
}

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PRE_2FA_EXPIRES_IN = '5m';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  /**
   * Zastita od brute-force pogadjanja lozinke (dodano naknadno, pored
   * @Throttle na /login rutu koji je po IP-u - ovo je po NALOGU, pa ne
   * pomaze ni ako napadac rotira IP adrese). Nakon MAX_LOGIN_ATTEMPTS
   * pogresnih lozinki zaredom, nalog se zakljucava na LOGIN_LOCKOUT_MINUTES.
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.staffUser.findUnique({ where: { email: dto.email } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Pogrešan email ili lozinka.');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Nalog je privremeno zaključan zbog previše neuspješnih pokušaja prijave. Pokušajte ponovo za ${minutesLeft} min.`,
      );
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      await this.registerFailedLogin(user.id, user.failedLoginAttempts);
      throw new UnauthorizedException('Pogrešan email ili lozinka.');
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.staffUser.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    }

    if (user.totpEnabled) {
      // Nema pravih tokena dok se ne potvrdi 2FA kod - pre_auth_token je
      // namjerno kratkovjecan i NEMA "type: refresh"/pun payload, pa se ne
      // moze upotrijebiti ni za jedan restoran-scoped API poziv.
      const preAuthToken = await this.jwt.signAsync({ sub: user.id, type: 'pre_2fa' } satisfies PreTwoFactorPayload, {
        expiresIn: PRE_2FA_EXPIRES_IN,
      });
      return { requires_2fa: true, pre_auth_token: preAuthToken };
    }

    return this.issueTokens(user);
  }

  private async registerFailedLogin(userId: string, currentAttempts: number) {
    const attempts = currentAttempts + 1;
    const maxAttempts = this.config.get<number>('MAX_LOGIN_ATTEMPTS', 5);

    if (attempts >= maxAttempts) {
      const lockoutMinutes = this.config.get<number>('LOGIN_LOCKOUT_MINUTES', 15);
      await this.prisma.staffUser.update({
        where: { id: userId },
        data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + lockoutMinutes * 60000) },
      });
      return;
    }

    await this.prisma.staffUser.update({ where: { id: userId }, data: { failedLoginAttempts: attempts } });
  }

  /** Drugi korak prijave kad nalog ima ukljucen 2FA - vidi login() iznad. */
  async verifyTwoFactor(dto: TwoFactorVerifyDto) {
    let payload: PreTwoFactorPayload;
    try {
      payload = await this.jwt.verifyAsync<PreTwoFactorPayload>(dto.pre_auth_token);
    } catch {
      throw new UnauthorizedException('Sesija za unos 2FA koda je istekla, prijavite se ponovo.');
    }
    if (payload.type !== 'pre_2fa') {
      throw new UnauthorizedException('Nevažeći token.');
    }

    const user = await this.prisma.staffUser.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || !user.totpEnabled || !user.totpSecret) {
      throw new UnauthorizedException('2FA nije podešen za ovaj nalog.');
    }

    if (!(await verifyTotp({ token: dto.token, secret: user.totpSecret })).valid) {
      throw new UnauthorizedException('Neispravan 2FA kod.');
    }

    return this.issueTokens(user);
  }

  /** Generise novu TOTP tajnu (ne aktivira 2FA jos - vidi enableTwoFactor). */
  async setupTwoFactor(userId: string) {
    const user = await this.prisma.staffUser.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Nalog nije pronađen.');

    const secret = generateSecret();
    await this.prisma.staffUser.update({ where: { id: userId }, data: { totpSecret: secret, totpEnabled: false } });

    return { secret, otpauth_url: generateURI({ issuer: 'Restoran SaaS', label: user.email, secret }) };
  }

  /** Potvrdjuje prvi kod iz authenticator app-a i tek onda ukljucuje 2FA (sprecava da se korisnik slucajno zakljuca van naloga). */
  async enableTwoFactor(userId: string, token: string) {
    const user = await this.prisma.staffUser.findUnique({ where: { id: userId } });
    if (!user?.totpSecret) {
      throw new BadRequestException('Prvo pokrenite podešavanje 2FA (/auth/2fa/setup).');
    }
    if (!(await verifyTotp({ token, secret: user.totpSecret })).valid) {
      throw new BadRequestException('Neispravan kod - provjerite da li je vrijeme na uređaju tačno.');
    }

    await this.prisma.staffUser.update({ where: { id: userId }, data: { totpEnabled: true } });
    return { enabled: true };
  }

  /** Zahtijeva lozinku (ne samo vazeci JWT) - da neko sa ukradenim/nezakljucanim uredjajem ne moze sam iskljuciti 2FA. */
  async disableTwoFactor(userId: string, password: string) {
    const user = await this.prisma.staffUser.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Nalog nije pronađen.');

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Pogrešna lozinka.');
    }

    await this.prisma.staffUser.update({ where: { id: userId }, data: { totpEnabled: false, totpSecret: null } });
    return { enabled: false };
  }

  /**
   * Self-service registracija (nov tenant). Kreira Restaurant + prvi StaffUser
   * (role ADMIN) u jednoj transakciji, pa odmah prijavljuje (isti oblik
   * odgovora kao login/refresh) - email verifikacija NE blokira ovo (vidi
   * sendVerificationEmail), samo se salje link i user.email_verified ostaje
   * false dok se ne potvrdi. Restoran krece u 'trialing' statusu - pretplata
   * (Lemon Squeezy) se podesava kasnije u admin "Naplata" ekranu.
   */
  async register(dto: RegisterDto) {
    const existing = await this.prisma.staffUser.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Nalog sa ovim emailom već postoji.');

    const slug = await this.generateUniqueSlug(dto.restaurant_name);
    const trialDays = this.config.get<number>('TRIAL_DAYS', 14);
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const staffUser = await this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          name: dto.restaurant_name,
          slug,
          address: dto.address,
          subscriptionStatus: 'trialing',
          trialEndsAt,
        },
      });
      return tx.staffUser.create({
        data: {
          restaurantId: restaurant.id,
          email: dto.email,
          passwordHash,
          fullName: dto.owner_full_name,
          role: 'ADMIN',
        },
      });
    });

    await this.sendVerificationEmail(staffUser.id, staffUser.email, staffUser.fullName);

    return this.issueTokens(staffUser);
  }

  private async sendVerificationEmail(staffUserId: string, email: string, fullName: string) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
    await this.prisma.emailVerificationToken.create({ data: { staffUserId, token, expiresAt } });

    const verifyBaseUrl = this.config.get<string>('STAFF_VERIFY_EMAIL_URL', 'http://localhost:3005/verify-email');
    await this.email.sendEmailVerification(email, fullName, `${verifyBaseUrl}?token=${token}`);
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const verificationToken = await this.prisma.emailVerificationToken.findUnique({ where: { token: dto.token } });

    if (!verificationToken || verificationToken.usedAt || verificationToken.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Link za potvrdu emaila je nevažeći ili istekao.');
    }

    await this.prisma.$transaction([
      this.prisma.staffUser.update({ where: { id: verificationToken.staffUserId }, data: { emailVerifiedAt: new Date() } }),
      this.prisma.emailVerificationToken.update({ where: { id: verificationToken.id }, data: { usedAt: new Date() } }),
    ]);

    return { message: 'Email je uspješno potvrđen.' };
  }

  /** Isti anti-enumeracija obrazac kao forgotPassword - uvijek isti odgovor. */
  async resendVerification(dto: ResendVerificationDto) {
    const user = await this.prisma.staffUser.findUnique({ where: { email: dto.email } });

    if (user && user.isActive && !user.emailVerifiedAt) {
      await this.sendVerificationEmail(user.id, user.email, user.fullName);
    }

    return { message: 'Ako nalog postoji i email još nije potvrđen, poslat je novi link za potvrdu.' };
  }

  /** Slugify + garancija jedinstvenosti (append -2, -3, ... ako je zauzeto). */
  private async generateUniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        // đ NIJE "d + dijakritika" nego zaseban Unicode znak (U+0111) - NFD
        // ga ne razlaze, pa mora rucno prije normalizacije (inace bi ga
        // sljedeci .replace(/[^a-z0-9]+/g, ...) tiho pretvorio u crticu
        // umjesto u uobicajenu transliteraciju "d").
        .replace(/đ/g, 'd')
        .normalize('NFD')
        // Skini preostale kombinujuce dijakriticke znakove (Unicode blok
        // U+0300-U+036F) nakon NFD normalizacije - npr. č/ć/š/ž -> c/c/s/z.
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'restoran';

    let slug = base;
    let suffix = 2;
    // Mali broj restorana u praksi - sekvencijalna provjera je dovoljno brza, ne treba pametniji pristup.
    while (await this.prisma.restaurant.findUnique({ where: { slug } })) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    return slug;
  }

  /**
   * Access token je namjerno kratkovjecan (JWT_EXPIRES_IN, default 8h) - da
   * ne visi predugo ako uredjaj izgubi/bude ukraden. Refresh token je
   * dugovjecan (REFRESH_EXPIRES_IN, default 30d) i koristi se SAMO da se
   * dobije nov access token preko /auth/refresh, nikad direktno za pozive
   * API-ju. Oba su bez-stanja JWT-ovi (nema revocation liste u bazi) - za
   * pravu produkciju bi refresh token trebao biti opoziv (blacklist ili
   * rotacija sa cuvanjem u bazi), ovo je MVP kompromis.
   */
  private async issueTokens(user: {
    id: string;
    restaurantId: string | null;
    role: string;
    email: string;
    fullName: string;
    emailVerifiedAt?: Date | null;
    totpEnabled?: boolean;
  }) {
    // SUPER_ADMIN (platforma) nema restaurantId (vidi schema.prisma) - '' je
    // namjerni sentinel, ne stvarna vrijednost. Platform-admin rute (vidi
    // platform-admin/) NIKAD ne koriste restaurant_id iz tokena za lookup,
    // pa se ovaj sentinel nigdje stvarno ne dereferencira. Ovo izbjegava
    // pretvaranje restaurantId u `string | null` kroz desetak kontrolera
    // koji ga inace uvijek tretiraju kao siguran, postojeci restoran.
    const restaurantIdForToken = user.restaurantId ?? '';

    const payload = {
      sub: user.id,
      restaurant_id: restaurantIdForToken,
      role: user.role,
      email: user.email,
    };

    const refreshPayload: RefreshPayload = { sub: user.id, type: 'refresh' };

    const [access_token, refresh_token] = await Promise.all([
      this.jwt.signAsync(payload),
      this.jwt.signAsync(refreshPayload, {
        expiresIn: this.config.get<string>('REFRESH_EXPIRES_IN', '30d'),
      }),
    ]);

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        role: user.role,
        restaurant_id: user.restaurantId,
        email_verified: !!user.emailVerifiedAt,
        totp_enabled: !!user.totpEnabled,
      },
    };
  }

  /** Zamjenjuje refresh token za nov access+refresh token par (rotacija) - klijent poziva ovo umjesto da tjera korisnika na ponovnu prijavu kad access token istekne. */
  async refresh(dto: RefreshTokenDto) {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(dto.refresh_token);
    } catch {
      throw new UnauthorizedException('Refresh token je nevažeći ili istekao, prijavite se ponovo.');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Nevažeći token.');
    }

    const user = await this.prisma.staffUser.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Nalog više ne postoji ili je deaktiviran.');
    }

    return this.issueTokens(user);
  }

  /**
   * Namjerno UVIJEK vraca isti odgovor bez obzira da li email postoji u bazi
   * (i bez obzira da li je slanje uspjelo) - da neko ne moze provjeriti koji
   * su emailovi registrovani probajuci "zaboravljena lozinka" (enumeracija naloga).
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.staffUser.findUnique({ where: { email: dto.email } });

    if (user && user.isActive) {
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
      await this.prisma.passwordResetToken.create({ data: { staffUserId: user.id, token, expiresAt } });

      const resetBaseUrl = this.config.get<string>('STAFF_RESET_PASSWORD_URL', 'http://localhost:3005/reset-password');
      const resetLink = `${resetBaseUrl}?token=${token}`;
      await this.email.sendPasswordReset(user.email, user.fullName, resetLink);
    }

    return { message: 'Ako nalog postoji, poslat je email sa uputama za resetovanje lozinke.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { token: dto.token } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Link za resetovanje lozinke je nevažeći ili istekao.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.$transaction([
      this.prisma.staffUser.update({ where: { id: resetToken.staffUserId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    ]);

    return { message: 'Lozinka je uspješno promijenjena.' };
  }
}
