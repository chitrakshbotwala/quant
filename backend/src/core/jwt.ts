import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRY_HOURS = Number(process.env.JWT_EXPIRY_HOURS || '24');

export type AppJwt = {
  userId: string;
  email: string;
  role: string;
};

export function signToken(payload: AppJwt): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${JWT_EXPIRY_HOURS}h` });
}

export function verifyToken(token: string): AppJwt {
  return jwt.verify(token, JWT_SECRET) as AppJwt;
}
