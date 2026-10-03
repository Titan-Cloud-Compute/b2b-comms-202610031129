import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequireAdmin, RolesGuard } from '../../auth/roles.guard';
import '../../auth/session.types';
import { CustomerInviteService } from './customer-invite.service';

@ApiTags('customer-invites')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireAdmin()
@Controller('api/customer-invites')
export class CustomerInviteController {
  constructor(private readonly invites: CustomerInviteService) {}

  @Get()
  list() {
    return this.invites.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: Request, @Body() body: { email?: unknown } | undefined) {
    const userId = req.session?.userId;
    if (!userId) throw new UnauthorizedException();
    return this.invites.invite(userId, body?.email);
  }
}
