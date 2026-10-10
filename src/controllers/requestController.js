import { asyncHandler } from '../utils/asyncHandler.js';
import * as requestService from '../services/requestService.js';

export const createRequest = asyncHandler(async (req, res) => {
  const request = await requestService.createBandwidthRequest(req.user._id, req.body);
  res.status(201).json({
    success: true,
    message: 'Bandwidth request submitted successfully and allocation recalculated',
    data: request,
  });
});

export const cancelRequest = asyncHandler(async (req, res) => {
  const request = await requestService.cancelBandwidthRequest(req.params.id, req.user);
  res.status(200).json({
    success: true,
    message: 'Bandwidth request cancelled and allocation redistributed',
    data: request,
  });
});

export const getRequests = asyncHandler(async (req, res) => {
  const requests = await requestService.getRequestsForNetwork(req.params.networkId, req.user);
  res.status(200).json({
    success: true,
    data: requests,
  });
});
