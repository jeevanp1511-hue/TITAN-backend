import { asyncHandler } from '../utils/asyncHandler.js';
import * as allocationService from '../services/allocationService.js';
import { runAllocation } from '../services/allocationEngine.js';
import { AllocationHistory } from '../models/AllocationHistory.js';
import { AllocationRun } from '../models/AllocationRun.js';
import { Network } from '../models/Network.js';
import { BandwidthRequest } from '../models/BandwidthRequest.js';
import { ApiError } from '../utils/ApiError.js';

export const triggerRecalculation = asyncHandler(async (req, res) => {
  const { networkId } = req.params;
  const { policy } = req.body;

  const network = await Network.findById(networkId);
  if (!network) {
    throw ApiError.notFound('Network not found');
  }

  if (network.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw ApiError.forbidden('Only network admin can manually trigger allocation recalculation');
  }

  const run = await allocationService.recalculateNetworkAllocation({
    networkId,
    eventType: 'MANUAL_RUN',
    executedBy: req.user._id,
    overridePolicy: policy,
  });

  res.status(200).json({
    success: true,
    message: 'Allocation recalculated successfully',
    data: run,
  });
});

export const getLatestAllocation = asyncHandler(async (req, res) => {
  const { networkId } = req.params;
  const run = await AllocationRun.findOne({ network: networkId }).sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: run,
  });
});

export const getAllocationHistory = asyncHandler(async (req, res) => {
  const { networkId } = req.params;
  const history = await AllocationHistory.find({ network: networkId })
    .sort({ createdAt: -1 })
    .limit(50);

  res.status(200).json({
    success: true,
    data: history,
  });
});

export const comparePolicies = asyncHandler(async (req, res) => {
  const { networkId, totalCapacityMbps, reservedBandwidthMbps, requests } = req.body;

  let total = totalCapacityMbps;
  let reserved = reservedBandwidthMbps || 0;
  let requestList = requests || [];

  if (networkId) {
    const network = await Network.findById(networkId);
    if (!network) {
      throw ApiError.notFound('Network not found');
    }
    total = total !== undefined ? total : network.totalCapacityMbps;
    reserved = reserved !== undefined ? reserved : network.reservedBandwidthMbps;

    if (!requests || requests.length === 0) {
      const dbRequests = await BandwidthRequest.find({
        network: networkId,
        status: { $ne: 'cancelled' },
      }).populate('user', 'name');

      requestList = dbRequests.map((r) => ({
        id: r._id.toString(),
        userId: r.user?._id?.toString() || '',
        userName: r.user?.name || 'Authorized Member',
        desiredMbps: r.desiredMbps,
        priority: r.priority,
        createdAt: r.createdAt,
      }));
    }
  }

  if (total === undefined) {
    total = 100;
    reserved = 10;
    requestList = [
      { id: '1', userName: 'User A (Exam Portal)', desiredMbps: 40, priority: 'high', createdAt: new Date(Date.now() - 300000) },
      { id: '2', userName: 'User B (Video Call)', desiredMbps: 30, priority: 'medium', createdAt: new Date(Date.now() - 200000) },
      { id: '3', userName: 'User C (Large Download)', desiredMbps: 50, priority: 'low', createdAt: new Date(Date.now() - 100000) },
    ];
  }

  const fcfsResult = runAllocation({
    policy: 'FCFS',
    totalCapacityMbps: total,
    reservedBandwidthMbps: reserved,
    requests: requestList,
  });

  const priorityResult = runAllocation({
    policy: 'PRIORITY',
    totalCapacityMbps: total,
    reservedBandwidthMbps: reserved,
    requests: requestList,
  });

  const adaptiveResult = runAllocation({
    policy: 'ADAPTIVE',
    totalCapacityMbps: total,
    reservedBandwidthMbps: reserved,
    requests: requestList,
  });

  res.status(200).json({
    success: true,
    data: {
      simulationMeta: {
        totalCapacityMbps: total,
        reservedBandwidthMbps: reserved,
        usableCapacityMbps: Math.max(0, total - reserved),
        requestCount: requestList.length,
      },
      policies: {
        FCFS: fcfsResult,
        PRIORITY: priorityResult,
        ADAPTIVE: adaptiveResult,
      },
    },
  });
});
