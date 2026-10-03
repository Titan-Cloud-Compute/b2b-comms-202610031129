import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import {
  MAX_VENDOR_DOCUMENT_BYTES,
  UploadedVendorFile,
  VendorOnboardingService,
  VendorProfileInput,
} from './vendor-onboarding.service';

function userIdOf(req: Request): string {
  const userId = req.session?.userId;
  if (!userId) throw new UnauthorizedException();
  return userId;
}

@ApiTags('vendor-onboarding')
@UseGuards(JwtAuthGuard)
@Controller('api/vendor-onboarding')
export class VendorOnboardingController {
  constructor(private readonly service: VendorOnboardingService) {}

  @Get('profile')
  async getProfile(@Req() req: Request) {
    return (await this.service.getProfile(userIdOf(req))) ?? null;
  }

  @Post('profile')
  createProfile(@Req() req: Request, @Body() body: VendorProfileInput) {
    return this.service.upsertProfile(userIdOf(req), body);
  }

  @Put('profile')
  updateProfile(@Req() req: Request, @Body() body: VendorProfileInput) {
    return this.service.upsertProfile(userIdOf(req), body);
  }

  @Get('documents')
  listDocuments(@Req() req: Request) {
    return this.service.listDocuments(userIdOf(req));
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_VENDOR_DOCUMENT_BYTES } }))
  uploadDocument(
    @Req() req: Request,
    @UploadedFile() file: UploadedVendorFile | undefined,
    @Body('documentType') documentType?: string,
  ) {
    return this.service.uploadDocument(userIdOf(req), file, documentType);
  }
}
