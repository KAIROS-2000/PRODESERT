export abstract class AuthNotificationPort {
  abstract sendEmailVerification(email: string, token: string): Promise<void>;
  abstract sendPasswordReset(email: string, token: string): Promise<void>;
}
