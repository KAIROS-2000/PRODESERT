export const PublicAppEnvironment = {
  DEVELOPMENT: 'development',
  TEST: 'test',
  STAGING: 'staging',
  PRODUCTION: 'production',
} as const;

export type PublicAppEnvironment = (typeof PublicAppEnvironment)[keyof typeof PublicAppEnvironment];

export interface PublicEnvInput {
  readonly apiBaseUrl: string | undefined;
  readonly siteUrl: string | undefined;
  readonly appEnvironment: string | undefined;
}

export interface PublicEnv {
  readonly apiBaseUrl: string;
  readonly siteUrl: string;
  readonly appEnvironment: PublicAppEnvironment;
}

export const publicEnvKeys = {
  apiBaseUrl: 'NEXT_PUBLIC_API_BASE_URL',
  siteUrl: 'NEXT_PUBLIC_SITE_URL',
  appEnvironment: 'NEXT_PUBLIC_APP_ENV',
} as const;

export class PublicEnvError extends Error {
  public constructor(
    public readonly key: string,
    message: string,
  ) {
    super(`${key}: ${message}`);
    this.name = 'PublicEnvError';
  }
}

const requiredHttpUrl = (key: string, rawValue: string | undefined): string => {
  const value = rawValue?.trim();

  if (!value) {
    throw new PublicEnvError(key, 'значение обязательно');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PublicEnvError(key, 'ожидается абсолютный URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PublicEnvError(key, 'разрешены только протоколы http и https');
  }

  return url.toString().replace(/\/$/, '');
};

const parseAppEnvironment = (value: string | undefined): PublicAppEnvironment => {
  const normalized = value?.trim().toLocaleLowerCase('en-US');
  const allowed = Object.values(PublicAppEnvironment) as readonly string[];

  if (!normalized || !allowed.includes(normalized)) {
    throw new PublicEnvError(
      publicEnvKeys.appEnvironment,
      `ожидается одно из значений: ${allowed.join(', ')}`,
    );
  }

  return normalized as PublicAppEnvironment;
};

export const createPublicEnv = (input: PublicEnvInput): PublicEnv => ({
  apiBaseUrl: requiredHttpUrl(publicEnvKeys.apiBaseUrl, input.apiBaseUrl),
  siteUrl: requiredHttpUrl(publicEnvKeys.siteUrl, input.siteUrl),
  appEnvironment: parseAppEnvironment(input.appEnvironment),
});
