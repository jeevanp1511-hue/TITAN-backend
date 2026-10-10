import { BandwidthRequest } from '../models/BandwidthRequest.js';
import { Network } from '../models/Network.js';
import { NetworkMember } from '../models/NetworkMember.js';
import { ApiError } from '../utils/ApiError.js';
import { recalculateNetworkAllocation } from './allocationService.js';

export const createBandwidthRequest = async (userId, { networkId, desiredMbps, priority, reason }) => {
  const network = await Network.findById(networkId);
  if (!network) {
    throw ApiError.notFound('Target network does not exist');
  }

  if (network.isRequestsPaused) {
    throw ApiError.badRequest('New bandwidth requests are currently paused by the administrator');
  }

  // Validate user is active member or owner
  const isOwner = network.owner.toString() === userId.toString();
  if (!isOwner) {
    const membership = await NetworkMember.findOne({
      network: networkId,
      user: userId,
      status: 'active',
    });
    if (!membership) {
      throw ApiError.forbidden('You must join this network before submitting a bandwidth request');
    }
  }

  // Prevent duplicate pending requests from same user in same network if desired
  const existingActive = await BandwidthRequest.findOne({
    network: networkId,
    user: userId,
    status: { $in: ['pending', 'approved', 'partially_allocated'] },
  });

  if (existingActive) {
    throw ApiError.badRequest(
      'You already have an active bandwidth request in this network. Please cancel it first before submitting a new one.'
    );
  }

  const request = await BandwidthRequest.create({
    network: networkId,
    user: userId,
    desiredMbps,
    priority: priority.toLowerCase(),
    reason: reason || '',
    status: 'pending',
  });

  // Automatically recalculate allocation for the network
  await recalculateNetworkAllocation({
    networkId,
    eventType: 'REQUEST_SUBMISSION',
    executedBy: userId,
  });

  const updated = await BandwidthRequest.findById(request._id).populate('user', 'name email');
  return updated;
};

export const cancelBandwidthRequest = async (requestId, user) => {
  const request = await BandwidthRequest.findById(requestId).populate('network');
  if (!request) {
    throw ApiError.notFound('Bandwidth request not found');
  }

  const isOwnerOfRequest = request.user.toString() === user._id.toString();
  const isNetworkAdmin = request.network.owner.toString() === user._id.toString();

  if (!isOwnerOfRequest && !isNetworkAdmin && user.role !== 'admin') {
    throw ApiError.forbidden('You are not authorized to cancel this bandwidth request');
  }

  if (request.status === 'cancelled') {
    throw ApiError.badRequest('This request is already cancelled');
  }

  request.status = 'cancelled';
  request.cancelledAt = new Date();
  request.allocatedMbps = 0;
  request.unmetMbps = request.desiredMbps;
  request.allocationReason = `Cancelled by ${user.name} (${user.role})`;
  await request.save();

  // Recalculate allocation so freed capacity is immediately redistributed to others!
  await recalculateNetworkAllocation({
    networkId: request.network._id,
    eventType: 'REQUEST_CANCELLATION',
    executedBy: user._id,
  });

  return request;
};

export const getRequestsForNetwork = async (networkId, user) => {
  const network = await Network.findById(networkId);
  if (!network) {
    throw ApiError.notFound('Network not found');
  }

  const isOwner = network.owner.toString() === user._id.toString();

  if (isOwner || user.role === 'admin') {
    return BandwidthRequest.find({ network: networkId })
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
  }

  // Normal users only see their own requests for this network
  return BandwidthRequest.find({
    network: networkId,
    user: user._id,
  })
    .populate('user', 'name email')
    .sort({ createdAt: -1 });
};
