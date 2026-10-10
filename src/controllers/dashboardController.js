import { asyncHandler } from '../utils/asyncHandler.js';
import { Network } from '../models/Network.js';
import { NetworkMember } from '../models/NetworkMember.js';
import { BandwidthRequest } from '../models/BandwidthRequest.js';
import { AllocationRun } from '../models/AllocationRun.js';
import { AllocationHistory } from '../models/AllocationHistory.js';

export const getAdminDashboard = asyncHandler(async (req, res) => {
  const { networkId } = req.query;

  let network;
  if (networkId) {
    network = await Network.findById(networkId);
  } else {
    network = await Network.findOne({ owner: req.user._id }).sort({ createdAt: -1 });
  }

  if (!network) {
    return res.status(200).json({
      success: true,
      data: {
        hasNetwork: false,
        message: 'No networks created yet. Create a network to view bandwidth telemetry.',
      },
    });
  }

  const memberCount = await NetworkMember.countDocuments({ network: network._id, status: 'active' });
  const requests = await BandwidthRequest.find({ network: network._id, status: { $ne: 'cancelled' } }).populate('user', 'name email');
  const activeRun = network.activeAllocationRun ? await AllocationRun.findById(network.activeAllocationRun) : null;
  const history = await AllocationHistory.find({ network: network._id }).sort({ createdAt: -1 }).limit(10);

  // Priority distribution
  const priorityDist = {
    high: requests.filter((r) => r.priority === 'high').length,
    medium: requests.filter((r) => r.priority === 'medium').length,
    low: requests.filter((r) => r.priority === 'low').length,
  };

  const totalAllocated = activeRun ? activeRun.totalAllocatedMbps : 0;
  const usableCapacity = Math.max(0, network.totalCapacityMbps - network.reservedBandwidthMbps);
  const remainingCapacity = Math.max(0, usableCapacity - totalAllocated);

  res.status(200).json({
    success: true,
    data: {
      hasNetwork: true,
      network: {
        _id: network._id,
        name: network.name,
        description: network.description,
        totalCapacityMbps: network.totalCapacityMbps,
        reservedBandwidthMbps: network.reservedBandwidthMbps,
        usableCapacityMbps: usableCapacity,
        allocationPolicy: network.allocationPolicy,
        invitationCode: network.invitationCode,
        isRequestsPaused: network.isRequestsPaused,
        priorityWeights: network.priorityWeights,
        minimumGuarantees: network.minimumGuarantees,
        enableAging: network.enableAging,
      },
      stats: {
        memberCount,
        requestCount: requests.length,
        totalAllocatedMbps: totalAllocated,
        remainingCapacityMbps: remainingCapacity,
        unmetDemandMbps: activeRun ? activeRun.unmetDemandMbps : 0,
        priorityDistribution: priorityDist,
      },
      requests,
      activeRun,
      recentHistory: history,
    },
  });
});

export const getUserDashboard = asyncHandler(async (req, res) => {
  // Find networks joined by this user
  const memberships = await NetworkMember.find({
    user: req.user._id,
    status: 'active',
  }).populate('network');

  const joinedNetworks = memberships.map((m) => m.network).filter(Boolean);

  // User's requests across all networks
  const myRequests = await BandwidthRequest.find({
    user: req.user._id,
  })
    .populate('network', 'name totalCapacityMbps reservedBandwidthMbps allocationPolicy')
    .sort({ createdAt: -1 });

  const totalAllocatedToMe = myRequests
    .filter((r) => r.status === 'approved' || r.status === 'partially_allocated')
    .reduce((sum, r) => sum + r.allocatedMbps, 0);

  res.status(200).json({
    success: true,
    data: {
      joinedNetworks,
      myRequests,
      summary: {
        totalJoinedNetworks: joinedNetworks.length,
        totalActiveRequests: myRequests.filter((r) => r.status !== 'cancelled').length,
        totalAllocatedMbps: Math.round(totalAllocatedToMe * 100) / 100,
      },
    },
  });
});
