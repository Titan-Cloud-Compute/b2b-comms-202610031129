import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Post,
  Req,
  Sse,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Observable, from, map, switchMap } from 'rxjs';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import '../../auth/session.types';
import { ChannelActor, SharedChannelService } from './shared-channel.service';
import type {
  AddSharedChannelMemberRequest,
  CreateSharedChannelRequest,
  PostSharedChannelMessageRequest,
} from '../../shared/contracts/shared-channel';

function actorOf(req: Request): ChannelActor {
  const s = req.session;
  if (!s?.userId) throw new UnauthorizedException();
  return { userId: s.userId, role: String(s.role) };
}

@ApiTags('channels')
@UseGuards(JwtAuthGuard)
@Controller('api/channels')
export class SharedChannelController {
  constructor(private readonly channels: SharedChannelService) {}

  @Get()
  list(@Req() req: Request) {
    return this.channels.list(actorOf(req));
  }

  @Post()
  create(@Req() req: Request, @Body() body: CreateSharedChannelRequest) {
    return this.channels.create(actorOf(req), body);
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.channels.get(id, actorOf(req));
  }

  @Post(':id/members')
  addMember(@Req() req: Request, @Param('id') id: string, @Body() body: AddSharedChannelMemberRequest) {
    return this.channels.addMember(id, actorOf(req), body);
  }

  @Get(':id/messages')
  messages(@Req() req: Request, @Param('id') id: string) {
    return this.channels.messages(id, actorOf(req));
  }

  @Post(':id/messages')
  post(@Req() req: Request, @Param('id') id: string, @Body() body: PostSharedChannelMessageRequest) {
    return this.channels.postMessage(id, actorOf(req), body);
  }

  /** Server-Sent Events: pushes each new message in the channel to members. */
  @Sse(':id/stream')
  stream(@Req() req: Request, @Param('id') id: string): Observable<MessageEvent> {
    const actor = actorOf(req);
    return from(this.channels.assertMember(id, actor)).pipe(
      switchMap(() => this.channels.stream(id)),
      map((m) => ({ data: m, type: 'message', id: m.id }) as MessageEvent),
    );
  }
}
