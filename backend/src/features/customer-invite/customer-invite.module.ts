import { Module } from '@nestjs/common';
import { CustomerInviteController } from './customer-invite.controller';
import { CustomerInviteService } from './customer-invite.service';

/** Story: customer-invite. PrismaService + MailerService/guards come from global modules. */
@Module({
  controllers: [CustomerInviteController],
  providers: [CustomerInviteService],
})
export class CustomerInviteModule {}
