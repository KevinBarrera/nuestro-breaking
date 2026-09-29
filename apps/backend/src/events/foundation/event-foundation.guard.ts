import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionAccessService } from '@/identity-access/session-access.service';

@Injectable()
export class EventFoundationGuard implements CanActivate {
  constructor(private readonly sessions: SessionAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request<{ eventId: string }>>();
    await this.sessions.authorizeEvent(
      request,
      http.getResponse<Response>(),
      request.params.eventId,
    );
    return true;
  }
}
