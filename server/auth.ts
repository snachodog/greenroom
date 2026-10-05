import { createHash, timingSafeEqual } from 'node:crypto';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function authRequired(host: string, password: string | undefined): boolean {
  return Boolean(password) && !LOCAL_HOSTS.has(host);
}

const digest = (value: string) => createHash('sha256').update(value).digest();

export function checkBasic(header: string | undefined, password: string): boolean {
  if (!header?.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString();
  const given = decoded.slice(decoded.indexOf(':') + 1);
  return timingSafeEqual(digest(given), digest(password));
}
