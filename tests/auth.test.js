import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';

describe('Auth API Integration Tests', () => {
  let app;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();
    app = createApp();
    await User.deleteMany({});
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('should register a new user successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'First User Admin',
        email: 'first@titan.local',
        password: 'Password123!',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('first@titan.local');
    // First user created should be granted admin
    expect(res.body.data.user.role).toBe('admin');
    expect(res.body.data.token).toBeDefined();
  });

  it('should register a standard user role for subsequent registrations', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Standard User',
        email: 'user@titan.local',
        password: 'Password123!',
        role: 'user',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('user');
  });

  it('should reject registration with duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Duplicate',
        email: 'user@titan.local',
        password: 'Password123!',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('should log in an existing user with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@titan.local',
        password: 'Password123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
  });

  it('should reject login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@titan.local',
        password: 'WrongPassword!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return current user profile on /api/auth/me when authenticated', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@titan.local',
        password: 'Password123!',
      });

    const token = loginRes.body.data.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe('user@titan.local');
  });

  it('should reject /api/auth/me when token is missing', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
