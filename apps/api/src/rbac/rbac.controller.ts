import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';

@Controller('rbac')
export class RbacController {
  @Get('staff-check')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN)
  staffCheck(): { authorized: true } {
    return { authorized: true };
  }
}
