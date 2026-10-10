import { Network } from '../models/Network.js';
import { NetworkMember } from '../models/NetworkMember.js';
import { ApiError } from '../utils/ApiError.js';
import { recalculateNetworkAllocation } from './allocationService.js';

export const createNetwork = async (userId, networkData) => {
  const network = await Network.create({
    ...networkData,
    owner: userId,
  });

  // Automatically register owner as an owner-member in NetworkMember
  await NetworkMember.create({
    network: network._id,
    user: userId,
    role: 'owner',
    status: 'active',
  });

  return network;
};

export const getNetworksForUser = async (user) => {
  if (user.role === 'admin') {
    // Admin sees networks they own or administer
    return Network.find({ owner: user._id }).sort({ createdAt: -1 });
  }

  // Normal users see networks they have joined
  const memberships = await NetworkMember.find({
    user: user._id,
    status: 'active',
  }).populate('network');

  return memberships.map((m) => m.network).filter(Boolean);
};

export const getNetworkById = async (networkId, user) => {
  const network = await Network.findById(networkId).populate('owner', 'name email');
  if (!network) {
    throw ApiError.notFound('Network not found');
  }

  // Check authorization: must be admin owner or joined member
  const isOwner = network.owner._id.toString() === user._id.toString();
  if (!isOwner) {
    const membership = await NetworkMember.findOne({
      network: networkId,
      user: user._id,
      status: 'active',
    });
    if (!membership && user.role !== 'admin') {
      throw ApiError.forbidden('You are not authorized to access this network');
    }
  }

  const memberCount = await NetworkMember.countDocuments({ network: networkId, status: 'active' });

  return {
    ...network.toObject(),
    memberCount,
    isOwner,
  };
};

export const updateNetworkConfig = async (networkId, userId, updateData) => {
  const network = await Network.findById(networkId);
  if (!network) {
    throw ApiError.notFound('Network not found');
  }

  if (network.owner.toString() !== userId.toString()) {
    throw ApiError.forbidden('Only the network owner/admin can update network settings');
  }

  // Check capacity constraints
  const newTotal = updateData.totalCapacityMbps !== undefined ? updateData.totalCapacityMbps : network.totalCapacityMbps;
  const newReserved = updateData.reservedBandwidthMbps !== undefined ? updateData.reservedBandwidthMbps : network.reservedBandwidthMbps;

  if (newReserved > newTotal) {
    throw ApiError.badRequest('Reserved bandwidth cannot exceed total network capacity');
  }

  Object.assign(network, updateData);
  await network.save();

  // Trigger recalculation if capacity or policy changed
  await recalculateNetworkAllocation({
    networkId: network._id,
    eventType: 'POLICY_CHANGE',
    executedBy: userId,
  });

  return network;
};

export const joinNetworkByCode = async (userId, invitationCode) => {
  const network = await Network.findOne({ invitationCode: invitationCode.trim().toUpperCase() });
  if (!network) {
    throw ApiError.notFound('Invalid invitation code. Network not found');
  }

  // Check if user is already a member
  let membership = await NetworkMember.findOne({
    network: network._id,
    user: userId,
  });

  if (membership) {
    if (membership.status === 'suspended') {
      throw ApiError.forbidden('Your access to this network has been suspended');
    }
    return { network, membership, message: 'Already a member of this network' };
  }

  membership = await NetworkMember.create({
    network: network._id,
    user: userId,
    role: network.owner.toString() === userId.toString() ? 'owner' : 'member',
    status: 'active',
  });

  return { network, membership, message: 'Successfully joined network' };
};

export const getNetworkMembers = async (networkId, user) => {
  const network = await Network.findById(networkId);
  if (!network) {
    throw ApiError.notFound('Network not found');
  }

  // Check permissions: owner or active member can view member list
  const isOwner = network.owner.toString() === user._id.toString();
  if (!isOwner) {
    const membership = await NetworkMember.findOne({
      network: networkId,
      user: user._id,
      status: 'active',
    });
    if (!membership && user.role !== 'admin') {
      throw ApiError.forbidden('Access denied to network member list');
    }
  }

  return NetworkMember.find({ network: networkId })
    .populate('user', 'name email role')
    .sort({ createdAt: -1 });
};
