// Copyright (c) 2026 GeniusLv2006
// SPDX-License-Identifier: MPL-2.0

const cors = require('cors');
const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { allowedOrigins, JWT_SECRET } = require('./config');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "connect-src 'self' https://api.215123.cn https://challenges.cloudflare.com; " +
    "img-src 'self' data:; " +
    "frame-ancestors 'none'; " +
    "object-src 'none'; " +
    "base-uri 'self';"
  );
  next();
}

const corsMiddleware = cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV === 'development' && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
      return callback(null, true);
    }
    console.log('CORS blocked:', origin);
    return callback(new Error('CORS not allowed'), false);
  },
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const logLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: '请求过于频繁' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: '登录请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const blacklistCheckLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: '请求过于频繁' },
  standardHeaders: true,
  legacyHeaders: false,
});

function isTrustedRequestOrigin(req) {
  const candidates = [req.headers.origin, req.headers.referer].filter(Boolean);
  if (candidates.length === 0) return false;

  return candidates.some((value) => {
    try {
      const requestOrigin = new URL(value).origin;
      if (allowedOrigins.includes(requestOrigin)) return true;
      if (process.env.NODE_ENV === 'development' && /https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin)) {
        return true;
      }
    } catch {}
    return false;
  });
}

function requireTrustedAdminOrigin(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (!isTrustedRequestOrigin(req)) {
    return res.status(403).json({ error: '请求来源不受信任' });
  }
  return next();
}

function authMiddleware(req, res, next) {
  const cookieHeader = req.headers.cookie || '';
  const cookieMatch = cookieHeader.split(';').find(c => c.trim().startsWith('adminToken='));
  const cookieToken = cookieMatch ? decodeURIComponent(cookieMatch.split('=').slice(1).join('=').trim()) : null;
  const token = cookieToken || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: '未授权' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token 无效' });
  }
}

module.exports = {
  jsonParser: express.json({ limit: '10kb' }),
  securityHeaders,
  corsMiddleware,
  requireTrustedAdminOrigin,
  authMiddleware,
  generalLimiter,
  logLimiter,
  loginLimiter,
  blacklistCheckLimiter
};
