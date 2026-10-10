import { Network } from '../models/Network.js';
import { BandwidthRequest } from '../models/BandwidthRequest.js';
import { AllocationRun } from '../models/AllocationRun.js';
import { AllocationHistory } from '../models/AllocationHistory.js';
import { runAllocation } from './allocationEngine.js';
import { getSocketServer } from '../sockets/socketServer.js';
import { ApiError } from '../utils/ApiError.js';

// Per-network concurrency serialization locks
const networkLocks = new Map();

const acquireNetworkLock = async (networkId) => {
  const key = networkId.toString();
  while (networkLocks.has(key)) {
    await networkLocks.get(key);
  }
  let resolver;
  const promise = new Promise((resolve) => {
    resolver = resolve;
  });
  networkLocks.set(key, promise);
  return () => {
    networkLocks.delete(key);
    resolver();
  };
};

/**
 * Recalculate allocations for a given network and persist results
 */
export const recalculateNetworkAllocation = async ({
  networkId,
  eventType = 'AUTO_RECALC',
  executedBy = null,
  overridePolicy = null,
}) => {
  const releaseLock = await acquireNetworkLock(networkId);

  try {
    const network = await Network.findById(networkId);
    if (!network) {
      throw ApiError.notFound('Network not found');
    }

    // Fetch active requests (excluding cancelled and explicitly rejected from prior non-reversible states)
    const requests = await BandwidthRequest.find({
      network: networkId,
      status: { $ne: 'cancelled' },
    })
      .populate('user', 'name email')
      .sort({ createdAt: 1 });

    const policyToUse = overridePolicy || network.allocationPolicy;

    // Prepare inputs for pure allocation engine
    const engineRequests = requests.map((r) => ({
      id: r._id.toString(),
      userId: r.user?._id ? r.user._id.toString() : r.user?.toString(),
      userName: r.user?.name || 'Authorized Member',
      desiredMbps: r.desiredMbps,
      priority: r.priority,
      createdAt: r.createdAt,
      status: r.status,
    }));

    const result = runAllocation({
      policy: policyToUse,
      totalCapacityMbps: network.totalCapacityMbps,
      reservedBandwidthMbps: network.reservedBandwidthMbps,
      requests: engineRequests,
      policyWeights: network.priorityWeights,
      minimumGuarantees: network.minimumGuarantees,
      enableAging: network.enableAging,
      agingWaitThresholdMinutes: network.agingWaitThresholdMinutes,
    });

    // Update individual request statuses in database
    const bulkOps = result.requests.map((resReq) => ({
      updateOne: {
        filter: { _id: resReq.id },
        update: {
          $set: {
            allocatedMbps: resReq.allocatedMbps,
            unmetMbps: resReq.unmetMbps,
            status: resReq.status,
            allocationReason: resReq.explanation,
          },
        },
      },
    }));

    if (bulkOps.length > 0) {
      await BandwidthRequest.bulkWrite(bulkOps);
    }

    // Persist AllocationRun
    const allocationRun = await AllocationRun.create({
      network: network._id,
      policy: result.policy,
      totalCapacityMbps: result.totalCapacityMbps,
      reservedBandwidthMbps: result.reservedBandwidthMbps,
      usableCapacityMbps: result.usableCapacityMbps,
      totalAllocatedMbps: result.totalAllocatedMbps,
      remainingCapacityMbps: result.remainingCapacityMbps,
      totalRequestedMbps: result.totalRequestedMbps,
      unmetDemandMbps: result.unmetDemandMbps,
      requestCount: result.requests.length,
      allocations: result.requests.map((r) => ({
        requestId: r.id,
        userId: r.userId,
        userName: r.userName,
        priority: r.priority,
        effectiveWeight: r.effectiveWeight,
        desiredMbps: r.desiredMbps,
        allocatedMbps: r.allocatedMbps,
        unmetMbps: r.unmetMbps,
        status: r.status,
        explanation: r.explanation,
      })),
      executedBy,
    });

    // Update activeAllocationRun pointer on network
    network.activeAllocationRun = allocationRun._id;
    await network.save();

    // Persist AllocationHistory entry
    await AllocationHistory.create({
      network: network._id,
      runId: allocationRun._id,
      policy: result.policy,
      eventType,
      totalAllocatedMbps: result.totalAllocatedMbps,
      usableCapacityMbps: result.usableCapacityMbps,
      remainingCapacityMbps: result.remainingCapacityMbps,
      unmetDemandMbps: result.unmetDemandMbps,
      activeRequestCount: result.requests.length,
      summaryNote: `Allocated ${result.totalAllocatedMbps} / ${result.usableCapacityMbps} Mbps via ${result.policy}`,
    });

    // Broadcast updated allocation to authorized network members via Socket.IO
    try {
      const io = getSocketServer();
      if (io) {
        io.to(`network_${networkId.toString()}`).emit('allocation:updated', {
          networkId: networkId.toString(),
          policy: result.policy,
          usableCapacityMbps: result.usableCapacityMbps,
          totalAllocatedMbps: result.totalAllocatedMbps,
          remainingCapacityMbps: result.remainingCapacityMbps,
          unmetDemandMbps: result.unmetDemandMbps,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (socketErr) {
      console.warn('[Socket.IO] Broadcast failed (ignoring for non-blocking):', socketErr.message);
    }

    return allocationRun;
  } finally {
    releaseLock();
  }
};
