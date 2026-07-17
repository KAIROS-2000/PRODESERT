export const Role = {
  CUSTOMER: 'CUSTOMER',
  MANAGER: 'MANAGER',
  CONTENT_MANAGER: 'CONTENT_MANAGER',
  ADMIN: 'ADMIN',
  SYSTEM: 'SYSTEM',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const staffRoles = [
  Role.MANAGER,
  Role.CONTENT_MANAGER,
  Role.ADMIN,
] as const satisfies readonly Role[];

export type StaffRole = (typeof staffRoles)[number];
