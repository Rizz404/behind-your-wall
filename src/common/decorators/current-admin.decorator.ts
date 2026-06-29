import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedAdmin {
  sub: string;
  username: string;
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
