import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

export type Role = 'viewer' | 'operator' | 'admin';

export interface ApiPrincipal {
  id: string;
  role: Role;
}

export interface ApiKeyRecord {
  id: string;
  role: Role;
  sha256: string;
  disabled?: boolean;
}

const roleRank: Record<Role, number> = { viewer: 1, operator: 2, admin: 3 };

export class ApiKeyAuthenticator {
  constructor(private readonly keys: ApiKeyRecord[]) {}

  authenticate(rawKey: string | undefined): ApiPrincipal | null {
    if (!rawKey) return null;
    const digest = createHash('sha256').update(rawKey).digest();
    for (const key of this.keys) {
      if (key.disabled) continue;
      const expected = Buffer.from(key.sha256, 'hex');
      if (expected.length === digest.length && timingSafeEqual(expected, digest)) return { id: key.id, role: key.role };
    }
    return null;
  }
}

export function requireRole(authenticator: ApiKeyAuthenticator, minimum: Role) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const principal = authenticator.authenticate(token);
    if (!principal) {
      await reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    if (roleRank[principal.role] < roleRank[minimum]) {
      await reply.code(403).send({ error: 'Forbidden' });
      return;
    }
    request.headers['x-zero-principal'] = principal.id;
    request.headers['x-zero-role'] = principal.role;
  };
}

export function sha256ApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
