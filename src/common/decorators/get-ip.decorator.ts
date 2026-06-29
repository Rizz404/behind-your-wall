import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { extractClientIp } from '../utils/ip.util';

export const GetIp = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return extractClientIp(req);
});
