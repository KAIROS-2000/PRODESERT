import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { argon2id, hash, verify } from 'argon2';
import { type Environment } from '../config/environment';

const COMMON_PASSWORDS = new Set([
  '1234567890',
  'password123',
  'qwerty12345',
  'administrator',
  'iloveyou123',
  'пароль12345',
]);

@Injectable()
export class PasswordService {
  private readonly dummyHashPromise: Promise<string>;

  constructor(private readonly config: ConfigService<Environment, true>) {
    this.dummyHashPromise = this.hashPassword('timing-only-password-that-is-never-valid');
  }

  assertPolicy(password: string): void {
    const normalized = password.normalize('NFKC');
    if (normalized.length < 10 || normalized.length > 1_024) {
      throw new BadRequestException({
        code: 'PASSWORD_POLICY_FAILED',
        message: 'Password must contain between 10 and 1024 characters.',
      });
    }
    if (COMMON_PASSWORDS.has(normalized.toLocaleLowerCase('ru-RU'))) {
      throw new BadRequestException({
        code: 'PASSWORD_POLICY_FAILED',
        message: 'Choose a less common password.',
      });
    }
  }

  async hashPassword(password: string): Promise<string> {
    return hash(password, {
      type: argon2id,
      memoryCost: this.config.get('ARGON2_MEMORY_KIB', { infer: true }),
      timeCost: this.config.get('ARGON2_TIME_COST', { infer: true }),
      parallelism: this.config.get('ARGON2_PARALLELISM', { infer: true }),
    });
  }

  async verifyOrDummy(password: string, storedHash?: string): Promise<boolean> {
    const candidateHash = storedHash ?? (await this.dummyHashPromise);
    try {
      const valid = await verify(candidateHash, password);
      return storedHash ? valid : false;
    } catch {
      return false;
    }
  }
}
