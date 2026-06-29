import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { Site } from '@prisma/client';

/** Reads the Site populated onto the request by SiteKeyGuard. */
export const CurrentSite = createParamDecorator((_data: unknown, ctx: ExecutionContext): Site => {
  const req = ctx.switchToHttp().getRequest<Request & { site: Site }>();
  return req.site;
});
