import { asyncHandler } from '../utils/asyncHandler.js';
import * as networkService from '../services/networkService.js';
import { NetworkMember } from '../models/NetworkMember.js';
import { Network } from '../models/Network.js';
import { ApiError } from '../utils/ApiError.js';

export const getMembers = asyncHandler(async (req, res) => {
  const members = await networkService.getNetworkMembers(req.params.networkId, req.user);
  res.status(200).json({
    success: true,
    data: members,
  });
});

export const updateMemberStatus = asyncHandler(async (req, res) => {
  const { networkId, memberId } = req.params;
  const { status } = req.body;

  const network = await Network.findById(networkId);
  if (!network) {
    throw ApiError.notFound('Network not found');
  }

  if (network.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw ApiError.forbidden('Only network admin can change member status');
  }

  const member = await NetworkMember.findById(memberId);
  if (!member) {
    throw ApiError.notFound('Member record not found');
  }

  member.status = status;
  await member.save();

  res.status(200).json({
    success: true,
    message: `Member status updated to ${status}`,
    data: member,
  });
});
