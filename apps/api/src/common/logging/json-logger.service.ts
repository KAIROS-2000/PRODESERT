import { Injectable, type LoggerService } from '@nestjs/common';

type LogLevel = 'debug' | 'error' | 'fatal' | 'log' | 'verbose' | 'warn';

@Injectable()
export class JsonLogger implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('log', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(level: LogLevel, message: unknown, optionalParams: unknown[]): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: 'pro-dessert-api',
      message: this.toSafeValue(message),
      context: optionalParams.map((value) => this.toSafeValue(value)),
    };

    const line = `${JSON.stringify(entry)}\n`;
    if (level === 'error' || level === 'fatal' || level === 'warn') {
      process.stderr.write(line);
      return;
    }
    process.stdout.write(line);
  }

  private toSafeValue(value: unknown): unknown {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        ...(process.env.NODE_ENV === 'production' ? {} : { stack: value.stack }),
      };
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }
}
