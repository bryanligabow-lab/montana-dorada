import type { FastifyReply, FastifyRequest } from 'fastify';
import type { JwtPayload } from '../lib/auth';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Verifica un token del portal del empleado (rechaza tokens de admin). */
    portalAuthenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}
