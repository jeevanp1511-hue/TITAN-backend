import { asyncHandler } from '../utils/asyncHandler.js';
import * as networkService from '../services/networkService.js';
import { AllocationRun } from '../models/AllocationRun.js';

export const createNetwork = asyncHandler(async (req, res) => {
  const network = await networkService.createNetwork(req.user._id, req.body);
  res.status(201).json({
    success: true,
    message: 'Network created successfully',
    data: network,
  });
});

export const getNetworks = asyncHandler(async (req, res) => {
  const networks = await networkService.getNetworksForUser(req.user);
  res.status(200).json({
    success: true,
    data: networks,
  });
});

export const getNetworkById = asyncHandler(async (req, res) => {
  const network = await networkService.getNetworkById(req.params.id, req.user);
  let activeRun = null;
  if (network.activeAllocationRun) {
    activeRun = await AllocationRun.findById(network.activeAllocationRun);
  }

  res.status(200).json({
    success: true,
    data: {
      ...network,
      activeRun,
    },
  });
});

export const updateNetwork = asyncHandler(async (req, res) => {
  const updated = await networkService.updateNetworkConfig(req.params.id, req.user._id, req.body);
  res.status(200).json({
    success: true,
    message: 'Network configuration updated successfully',
    data: updated,
  });
});

export const joinNetwork = asyncHandler(async (req, res) => {
  const { invitationCode } = req.body;
  const result = await networkService.joinNetworkByCode(req.user._id, invitationCode);
  res.status(200).json({
    success: true,
    message: result.message,
    data: result.network,
  });
});
