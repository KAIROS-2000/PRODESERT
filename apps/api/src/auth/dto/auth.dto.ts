import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const normalizeEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().normalize('NFKC').toLowerCase() : value;

export class RegisterDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1_024)
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  @MinLength(40)
  @MaxLength(256)
  token!: string;
}

export class EmailOnlyDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class LoginDto extends RegisterDto {}

export class ResetPasswordDto extends VerifyEmailDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1_024)
  newPassword!: string;
}
