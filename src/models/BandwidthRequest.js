import mongoose from 'mongoose';

const bandwidthRequestSchema = new mongoose.Schema(
  {
    network: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Network',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    desiredMbps: {
      type: Number,
      required: [true, 'Desired bandwidth in Mbps is required'],
      min: [0.1, 'Desired bandwidth must be at least 0.1 Mbps'],
    },
    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
      required: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [200, 'Reason cannot exceed 200 characters'],
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'partially_allocated', 'rejected', 'cancelled'],
      default: 'pending',
      required: true,
    },
    allocatedMbps: {
      type: Number,
      default: 0,
      min: 0,
    },
    unmetMbps: {
      type: Number,
      default: 0,
      min: 0,
    },
    allocationReason: {
      type: String,
      default: 'Awaiting allocation run',
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

bandwidthRequestSchema.index({ network: 1, status: 1 });
bandwidthRequestSchema.index({ user: 1, network: 1 });

export const BandwidthRequest = mongoose.model('BandwidthRequest', bandwidthRequestSchema);
