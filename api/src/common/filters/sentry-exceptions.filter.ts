import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';

/**
 * Globalni exception filter - prijavljuje neuhvacene/server (5xx) greske
 * Sentry-u (ako je SENTRY_DSN podesen, vidi main.ts), pa delegira na
 * standardno NestJS ponasanje (BaseExceptionFilter) da odgovor klijentu
 * ostane nepromijenjen. Ocekivane 4xx greske (BadRequestException i sl.)
 * namjerno NE saljemo Sentry-u - to je normalan tok, ne bug.
 */
@Catch()
export class SentryExceptionsFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      Sentry.captureException(exception);
    }

    super.catch(exception, host);
  }
}
