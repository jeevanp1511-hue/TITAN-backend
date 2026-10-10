import mongoose from 'mongoose';

const networkMemberSchema = new mongoose.Schema(
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
    role: {
      type: String,
      enum: ['owner', 'member'],
      default: 'member',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'suspended'],
      default: 'active',
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

networkMemberSchema.index({ network: 1, user: 1 }, { unique: true });

export const NetworkMember = mongoose.model('NetworkMember', networkMemberSchema);
