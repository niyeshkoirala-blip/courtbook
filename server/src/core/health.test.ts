import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from './db.js';

describe('GET /api/v1/health', () => {
  const app = createApp();
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
  });

  afterAll(async () => {
    await disconnectDb();
    await mongod.stop();
  });

  it('reports db down with 503 before a connection exists', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.data).toMatchObject({ status: 'degraded', db: 'down' });
  });

  it('reports db up with 200 once connected', async () => {
    await connectDb(mongod.getUri());
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ status: 'ok', db: 'up' });
    expect(res.body.data.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof res.body.data.uptime).toBe('number');
    // request-id middleware echoes an id on every response
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});
