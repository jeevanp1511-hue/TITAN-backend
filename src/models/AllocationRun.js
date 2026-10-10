import mongoose from 'mongoose';

const allocationItemSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BandwidthRequest',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    userName: {
      type: String,
      default: '',
    },
    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      required: true,
    },
    effectiveWeight: {
      type: Number,
      default: 1,
    },
    desiredMbps: {
      type: Number,
      required: true,
    },
    allocatedMbps: {
      type: Number,
      required: true,
    },
    unmetMbps: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['approved', 'partially_allocated', 'rejected'],
      required: true,
    },
    explanation: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const allocationRunSchema = new mongoose.Schema(
  {
    network: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Network',
      required: true,
      index: true,
    },
    policy: {
      type: String,
      enum: ['FCFS', 'PRIORITY', 'ADAPTIVE'],
      required: true,
    },
    totalCapacityMbps: {
      type: Number,
      required: true,
    },
    reservedBandwidthMbps: {
      type: Number,
      required: true,
    },
    usableCapacityMbps: {
      type: Number,
      required: true,
    },
    totalAllocatedMbps: {
      type: Number,
      required: true,
    },
    remainingCapacityMbps: {
      type: Number,
      required: true,
    },
    totalRequestedMbps: {
      type: Number,
      required: true,
    },
    unmetDemandMbps: {
      type: Number,
      required: true,
    },
    requestCount: {
      type: Number,
      default: 0,
    },
    allocations: [allocationItemSchema],
    executedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

allocationRunSchema.index({ network: 1, createdAt: -1 });

export const AllocationRun = mongoose.model('AllocationRun', allocationRunSchema);
