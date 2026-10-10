import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Network } from '../src/models/Network.js';
import { NetworkMember } from '../src/models/NetworkMember.js';

describe('Network Management Integration Tests', () => {
  let app;
  let adminToken;
  let userToken;
  let createdNetworkId;
  let inviteCode;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();
    app = createApp();
    await User.deleteMany({});
    await Network.deleteMany({});
    await NetworkMember.deleteMany({});

    // Register admin
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'Network Admin',
      email: 'netadmin@titan.local',
      password: 'AdminPassword123!',
      role: 'admin',
    });
    adminToken = adminRes.body.data.token;

    // Register regular user
    const userRes = await request(app).post('/api/auth/register').send({
      name: 'Regular User',
      email: 'netuser@titan.local',
      password: 'UserPassword123!',
      role: 'user',
    });
    userToken = userRes.body.data.token;
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('should allow admin to create a valid network', async () => {
    const res = await request(app)
      .post('/api/networks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Main Campus Backbone',
        description: 'Primary shared gateway for student dormitories',
        totalCapacityMbps: 200,
        reservedBandwidthMbps: 20,
        allocationPolicy: 'ADAPTIVE',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Main Campus Backbone');
    expect(res.body.data.invitationCode).toBeDefined();

    createdNetworkId = res.body.data._id;
    inviteCode = res.body.data.invitationCode;
  });

  it('should reject network creation when reserved capacity exceeds total capacity', async () => {
    const res = await request(app)
      .post('/api/networks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Invalid Capacity Network',
        totalCapacityMbps: 50,
        reservedBandwidthMbps: 60,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should forbid normal user from creating a network', async () => {
    const res = await request(app)
      .post('/api/networks')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'Unauthorized Network',
        totalCapacityMbps: 100,
        reservedBandwidthMbps: 10,
      });

    expect(res.status).toBe(403);
  });

  it('should allow normal user to join network using invitation code', async () => {
    const res = await request(app)
      .post('/api/networks/join')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        invitationCode: inviteCode,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should reject joining with invalid invitation code', async () => {
    const res = await request(app)
      .post('/api/networks/join')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        invitationCode: 'NONEXISTENT999',
      });

    expect(res.status).toBe(404);
  });
});
