import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Network } from '../src/models/Network.js';
import { NetworkMember } from '../src/models/NetworkMember.js';
import { BandwidthRequest } from '../src/models/BandwidthRequest.js';

describe('Bandwidth Requests Integration Tests', () => {
  let app;
  let adminToken;
  let userToken;
  let outsiderToken;
  let network;
  let requestId;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();
    app = createApp();
    await User.deleteMany({});
    await Network.deleteMany({});
    await NetworkMember.deleteMany({});
    await BandwidthRequest.deleteMany({});

    // 1. Admin
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'Network Admin',
      email: 'reqadmin@titan.local',
      password: 'AdminPassword123!',
      role: 'admin',
    });
    adminToken = adminRes.body.data.token;

    // 2. Member User
    const userRes = await request(app).post('/api/auth/register').send({
      name: 'Member User',
      email: 'requser@titan.local',
      password: 'UserPassword123!',
      role: 'user',
    });
    userToken = userRes.body.data.token;

    // 3. Outsider User (has not joined network)
    const outsiderRes = await request(app).post('/api/auth/register').send({
      name: 'Outsider User',
      email: 'outsider@titan.local',
      password: 'UserPassword123!',
      role: 'user',
    });
    outsiderToken = outsiderRes.body.data.token;

    // Create Network (100 Mbps, 10 reserved => 90 usable)
    const netRes = await request(app)
      .post('/api/networks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Lab Mesh',
        totalCapacityMbps: 100,
        reservedBandwidthMbps: 10,
        allocationPolicy: 'PRIORITY',
      });
    network = netRes.body.data;

    // Member joins network
    await request(app)
      .post('/api/networks/join')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ invitationCode: network.invitationCode });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('should block non-member from submitting a request to the network', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({
        networkId: network._id,
        desiredMbps: 25,
        priority: 'high',
        reason: 'Illegal access attempt',
      });

    expect(res.status).toBe(403);
  });

  it('should allow authorized member to submit a bandwidth request and recalculate allocation', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        networkId: network._id,
        desiredMbps: 30,
        priority: 'high',
        reason: 'AI model training batch',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.allocatedMbps).toBe(30); // 30 of 90 usable granted
    expect(res.body.data.status).toBe('approved');
    requestId = res.body.data._id;
  });

  it('should allow user to cancel request and release bandwidth', async () => {
    const res = await request(app)
      .patch(`/api/requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.allocatedMbps).toBe(0);
  });

  it('should reject request when network requests are paused by admin', async () => {
    // Admin pauses requests
    await request(app)
      .patch(`/api/networks/${network._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isRequestsPaused: true });

    // User attempts to submit request
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        networkId: network._id,
        desiredMbps: 15,
        priority: 'medium',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('paused');
  });
});
