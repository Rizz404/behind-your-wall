import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const admin = await this.prisma.admin.findUnique({ where: { username: dto.username } });
    if (!admin) throw new UnauthorizedException('Invalid credentials');

    const passwordMatches = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!passwordMatches) throw new UnauthorizedException('Invalid credentials');

    const accessToken = await this.jwtService.signAsync({
      sub: admin.id,
      username: admin.username,
    });

    return { accessToken };
  }
}
