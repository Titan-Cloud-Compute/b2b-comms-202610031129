/**
 * HTTP-level integration test for JwtAuthGuard + RolesGuard.
 *
 * Builds a minimal Nest app with a throwaway controller to assert the correct
 * HTTP status codes (401, 403, 200) for each guard/decorator combination,
 * driven by supertest with a real signed session cookie.
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import type { INestApplication } from '@nestjs/common';

import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard, RequireUser, RequireManager, RequireAdmin } from './roles.guard';
import { Public } from './decorators/public.decorator';

const TEST_SECRET = 'test-secret';

@Controller('t')
@UseGuards(JwtAuthGuard, RolesGuard)
class ThrowawayController {
  @Get('public')
  @Public()
  getPublic() {
    return { ok: true };
  }

  @Get('any')
  @RequireUser()
  getAny() {
    return { ok: true };
  }

  @Get('manager')
  @RequireManager()
  getManager() {
    return { ok: true };
  }

  @Get('admin')
  @RequireAdmin()
  getAdmin() {
    return { ok: true };
  }
}

describe('JwtAuthGuard + RolesGuard HTTP contract', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  function mintCookie(role: 'USER' | 'MANAGER' | 'ADMIN'): string {
    return jwtService.sign({ userId: 'u1', role, firmId: null });
  }

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: TEST_SECRET })],
      controllers: [ThrowawayController],
      providers: [JwtAuthGuard, RolesGuard, Reflector],
    }).compile();

    app = module.createNestApplication();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    app.use(require('cookie-parser')());
    await app.init();

    jwtService = module.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  // ── @Public() — no cookie needed ──────────────────────────────────────────
  it('GET /t/public → 200 with no cookie', () => {
    return request(app.getHttpServer()).get('/t/public').expect(200);
  });

  // ── @RequireUser() — any authenticated user ───────────────────────────────
  it('GET /t/any → 401 with no cookie', () => {
    return request(app.getHttpServer()).get('/t/any').expect(401);
  });

  it('GET /t/any → 401 with garbage cookie', () => {
    return request(app.getHttpServer())
      .get('/t/any')
      .set('Cookie', 'session=notavalidtoken')
      .expect(401);
  });

  // ── @RequireManager() — MANAGER or ADMIN ─────────────────────────────────
  it('GET /t/manager → 403 for USER', () => {
    return request(app.getHttpServer())
      .get('/t/manager')
      .set('Cookie', `session=${mintCookie('USER')}`)
      .expect(403);
  });

  it('GET /t/manager → 200 for MANAGER', () => {
    return request(app.getHttpServer())
      .get('/t/manager')
      .set('Cookie', `session=${mintCookie('MANAGER')}`)
      .expect(200);
  });

  it('GET /t/manager → 200 for ADMIN', () => {
    return request(app.getHttpServer())
      .get('/t/manager')
      .set('Cookie', `session=${mintCookie('ADMIN')}`)
      .expect(200);
  });

  // ── @RequireAdmin() — ADMIN only ──────────────────────────────────────────
  it('GET /t/admin → 403 for USER', () => {
    return request(app.getHttpServer())
      .get('/t/admin')
      .set('Cookie', `session=${mintCookie('USER')}`)
      .expect(403);
  });

  it('GET /t/admin → 403 for MANAGER', () => {
    return request(app.getHttpServer())
      .get('/t/admin')
      .set('Cookie', `session=${mintCookie('MANAGER')}`)
      .expect(403);
  });

  it('GET /t/admin → 200 for ADMIN', () => {
    return request(app.getHttpServer())
      .get('/t/admin')
      .set('Cookie', `session=${mintCookie('ADMIN')}`)
      .expect(200);
  });
});
