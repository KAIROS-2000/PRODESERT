import {
  type ValidationArguments,
  type ValidationOptions,
  registerDecorator,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

interface ReservationLike {
  readonly status?: unknown;
  readonly expiresAt?: unknown;
}

interface PaymentLike {
  readonly status?: unknown;
  readonly confirmedAt?: unknown;
  readonly externalPaymentId?: unknown;
}

@ValidatorConstraint({ name: 'oneCReservationConsistency', async: false })
class OneCReservationConsistencyConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, arguments_: ValidationArguments): boolean {
    const reservation = arguments_.object as ReservationLike;
    return reservation.status !== 'ACTIVE' || typeof reservation.expiresAt === 'string';
  }
}

@ValidatorConstraint({ name: 'oneCPaymentConsistency', async: false })
class OneCPaymentConsistencyConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, arguments_: ValidationArguments): boolean {
    const payment = arguments_.object as PaymentLike;
    if (payment.status === 'CONFIRMED') {
      return (
        typeof payment.confirmedAt === 'string' &&
        typeof payment.externalPaymentId === 'string' &&
        payment.externalPaymentId.trim().length > 0
      );
    }
    if (payment.status === 'NOT_PAID') {
      return payment.confirmedAt === null && payment.externalPaymentId === null;
    }
    return true;
  }
}

function consistencyDecorator(
  constraint: new () => ValidatorConstraintInterface,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options: validationOptions,
      validator: constraint,
    });
  };
}

export function IsOneCReservationConsistent(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return consistencyDecorator(OneCReservationConsistencyConstraint, validationOptions);
}

export function IsOneCPaymentConsistent(validationOptions?: ValidationOptions): PropertyDecorator {
  return consistencyDecorator(OneCPaymentConsistencyConstraint, validationOptions);
}
