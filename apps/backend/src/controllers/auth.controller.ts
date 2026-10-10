import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { NextFunction, Response } from 'express';
import prisma from '../database/prisma';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { RegisterInput, LoginInput } from '../validators/schemas';

// Helper function to generate JWT tokens
const generateToken = (user: { id: string; email: string; role: string }) => {
  const jwtSecret = process.env.JWT_SECRET as string;
  const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
  
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    jwtSecret,
    { expiresIn } as jwt.SignOptions
  );
};

// Helper function to generate refresh token (longer expiration)
const generateRefreshToken = (user: { id: string; email: string; role: string }) => {
  const jwtSecret = process.env.JWT_SECRET as string;
  const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, type: 'refresh' },
    jwtSecret,
    { expiresIn: refreshExpiresIn } as jwt.SignOptions
  );
};

const hashToken = (token: string) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Helper for cookie options (supports cross-domain in production)
const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? ('none' as const) : ('lax' as const),
});

export const register = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { email, password, firstName, lastName, role, phone }: RegisterInput = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new AppError('Email already registered', 400);
    }

    // Hash password (using stronger salt rounds)
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role: role || 'CONSUMER',
        phone,
      },
    });

    // Generate tokens
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store hashed refresh token in DB
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Matches 7d JWT_REFRESH_EXPIRES_IN
    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId: user.id,
        expiresAt,
      }
    });

    const cookieOptions = getCookieOptions();
    res.cookie('token', token, { ...cookieOptions, maxAge: 24 * 60 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      },
    });
    
    // Log audit event
    await prisma.auditLog.create({
      data: {
        action: 'USER_REGISTERED',
        entity: 'User',
        entityId: user.id,
        userId: user.id,
        details: { email: user.email, role: user.role },
      },
    });
  } catch (error) {
    if (error instanceof AppError) return next(error);
    console.error('Registration error:', error);
    next(new AppError('Failed to register user', 500));
  }
};

export const login = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { email, password }: LoginInput = req.body;

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new AppError('Invalid credentials', 401);
    }

    // Generate tokens
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store hashed refresh token in DB
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId: user.id,
        expiresAt,
      }
    });

    const cookieOptions = getCookieOptions();
    res.cookie('token', token, { ...cookieOptions, maxAge: 24 * 60 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      },
    });
    
    // Log audit event
    await prisma.auditLog.create({
      data: {
        action: 'USER_LOGIN',
        entity: 'User',
        entityId: user.id,
        userId: user.id,
        details: { email: user.email, role: user.role },
      },
    });
  } catch (error) {
    if (error instanceof AppError) return next(error);
    console.error('Login error:', error);
    next(new AppError('Failed to login', 500));
  }
};

export const getMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }
    
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
      }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    if (error instanceof AppError) return next(error);
    console.error('Get user error:', error);
    next(new AppError('Failed to fetch user data', 500));
  }
};

export const refreshToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      throw new AppError('Refresh token required', 400);
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET!) as {
      id: string;
      email: string;
      role: string;
      type: string;
    };

    if (decoded.type !== 'refresh') {
      throw new AppError('Invalid token type', 401);
    }

    // Check if user still exists
    const user = await prisma.user.findUnique({ 
      where: { email: decoded.email } 
    });
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Check DB for the hashed token
    const tokenHash = hashToken(refreshToken);
    const savedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash }
    });

    if (!savedToken) {
      throw new AppError('Refresh token has been revoked or is invalid', 401);
    }

    // Delete the old refresh token (rotation)
    await prisma.refreshToken.delete({
      where: { tokenHash }
    });

    // Generate new tokens
    const newToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(newRefreshToken),
        userId: user.id,
        expiresAt,
      }
    });

    const cookieOptions = getCookieOptions();
    res.cookie('token', newToken, { ...cookieOptions, maxAge: 24 * 60 * 60 * 1000 });
    res.cookie('refreshToken', newRefreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: newToken,
        refreshToken: newRefreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      },
    });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return next(new AppError('Invalid or expired refresh token', 401));
    }
    if (error instanceof AppError) return next(error);
    console.error('Refresh token error:', error);
    next(new AppError('Failed to refresh token', 500));
  }
};

export const logout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await prisma.refreshToken.deleteMany({
        where: { tokenHash }
      });
    }

    const cookieOptions = getCookieOptions();
    res.clearCookie('token', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(new AppError('Failed to logout', 500));
  }
};

export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError('Not authenticated', 401);
    }

    const { firstName, lastName, phone } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(phone !== undefined && { phone }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
      }
    });

    res.json({
      success: true,
      data: { user: updatedUser },
      message: 'Profile updated successfully'
    });
  } catch (error) {
    if (error instanceof AppError) return next(error);
    console.error('Update profile error:', error);
    next(new AppError('Failed to update profile', 500));
  }
};
