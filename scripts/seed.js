import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Network } from '../src/models/Network.js';
import { NetworkMember } from '../src/models/NetworkMember.js';
import { BandwidthRequest } from '../src/models/BandwidthRequest.js';
import { AllocationRun } from '../src/models/AllocationRun.js';
import { AllocationHistory } from '../src/models/AllocationHistory.js';
import { recalculateNetworkAllocation } from '../src/services/allocationService.js';

const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'TitanDemo123!';

export const seedDatabase = async () => {
  console.log('[Seed] Connecting to database...');
  await connectDB();

  console.log('[Seed] Cleaning existing demo records...');
  await BandwidthRequest.deleteMany({});
  await AllocationHistory.deleteMany({});
  await AllocationRun.deleteMany({});
  await NetworkMember.deleteMany({});
  await Network.deleteMany({});
  await User.deleteMany({ email: { $in: ['admin@titan.local', 'alex@titan.local', 'bella@titan.local', 'charlie@titan.local'] } });

  console.log('[Seed] Creating demo accounts...');
  // 1. Admin account
  const admin = await User.create({
    name: 'Administrator',
    email: 'admin@titan.local',
    password: DEMO_PASSWORD,
    role: 'admin',
  });

  // 2. User accounts matching acceptance scenario
  const userA = await User.create({
    name: 'User A (Alex)',
    email: 'alex@titan.local',
    password: DEMO_PASSWORD,
    role: 'user',
  });

  const userB = await User.create({
    name: 'User B (Bella)',
    email: 'bella@titan.local',
    password: DEMO_PASSWORD,
    role: 'user',
  });

  const userC = await User.create({
    name: 'User C (Charlie)',
    email: 'charlie@titan.local',
    password: DEMO_PASSWORD,
    role: 'user',
  });

  console.log('[Seed] Creating benchmark demo network (PS-32 Benchmark Network)...');
  const network = await Network.create({
    name: 'Campus Gateway Alpha (PS-32)',
    description: 'Shared 100 Mbps campus uplink with 10 Mbps emergency reserve and adaptive fair sharing.',
    owner: admin._id,
    totalCapacityMbps: 100,
    reservedBandwidthMbps: 10,
    allocationPolicy: 'PRIORITY',
    invitationCode: 'TITAN99',
    priorityWeights: { high: 5, medium: 3, low: 1 },
    minimumGuarantees: { high: 10, medium: 5, low: 0 },
    enableAging: true,
    agingWaitThresholdMinutes: 5,
  });

  console.log('[Seed] Registering network memberships...');
  await NetworkMember.create([
    { network: network._id, user: admin._id, role: 'owner', status: 'active' },
    { network: network._id, user: userA._id, role: 'member', status: 'active' },
    { network: network._id, user: userB._id, role: 'member', status: 'active' },
    { network: network._id, user: userC._id, role: 'member', status: 'active' },
  ]);

  console.log('[Seed] Submitting acceptance benchmark requests (120 Mbps total demand)...');
  const now = Date.now();
  await BandwidthRequest.create([
    {
      network: network._id,
      user: userA._id,
      desiredMbps: 40,
      priority: 'high',
      reason: 'Proctored online exam application & telemetry',
      status: 'pending',
      createdAt: new Date(now - 180000), // 3 min ago
    },
    {
      network: network._id,
      user: userB._id,
      desiredMbps: 30,
      priority: 'medium',
      reason: 'Live video lecture meeting & presentation stream',
      status: 'pending',
      createdAt: new Date(now - 120000), // 2 min ago
    },
    {
      network: network._id,
      user: userC._id,
      desiredMbps: 50,
      priority: 'low',
      reason: 'Large dataset batch download & backup',
      status: 'pending',
      createdAt: new Date(now - 60000), // 1 min ago
    },
  ]);

  console.log('[Seed] Running initial allocation calculation...');
  const run = await recalculateNetworkAllocation({
    networkId: network._id,
    eventType: 'MANUAL_RUN',
    executedBy: admin._id,
  });

  console.log('====================================================');
  console.log('  TITAN DEMO SEED COMPLETED SUCCESSFULLY');
  console.log('====================================================');
  console.log(`  Network: "${network.name}" (Code: ${network.invitationCode})`);
  console.log(`  Capacity: ${network.totalCapacityMbps} Mbps | Reserved: ${network.reservedBandwidthMbps} Mbps | Usable: ${run.usableCapacityMbps} Mbps`);
  console.log(`  Allocated: ${run.totalAllocatedMbps} Mbps | Remaining: ${run.remainingCapacityMbps} Mbps | Unmet: ${run.unmetDemandMbps} Mbps`);
  console.log('----------------------------------------------------');
  console.log('  DEMO CREDENTIALS:');
  console.log(`  Admin:   admin@titan.local  / ${DEMO_PASSWORD}`);
  console.log(`  User A:  alex@titan.local   / ${DEMO_PASSWORD} (Exam, 40 Mbps, High)`);
  console.log(`  User B:  bella@titan.local  / ${DEMO_PASSWORD} (Video, 30 Mbps, Medium)`);
  console.log(`  User C:  charlie@titan.local / ${DEMO_PASSWORD} (Download, 50 Mbps, Low)`);
  console.log('====================================================\n');
};

// If run directly via CLI
if (process.argv[1]?.endsWith('seed.js')) {
  seedDatabase()
    .then(async () => {
      await disconnectDB();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Seed] Error during seeding:', err);
      await disconnectDB();
      process.exit(1);
    });
}
