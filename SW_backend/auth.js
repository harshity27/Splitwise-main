import jwt from 'jsonwebtoken';

export function createToken(user, secret) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    secret,
    { expiresIn: '7d' },
  );
}

export function readToken(token, secret) {
  return jwt.verify(token, secret);
}

export function requireAuth(secret) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing authentication token.' });
    }

    try {
      req.user = readToken(authHeader.slice(7), secret);
      return next();
    } catch {
      return res.status(401).json({ message: 'Invalid or expired authentication token.' });
    }
  };
}
