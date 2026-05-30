import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

// Sub-schema for individual comments to be embedded within posts
const commentSchema = new MongooseSchema(
  {
    author: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    upvotes: {
      type: [MongooseSchema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    downvotes: {
      type: [MongooseSchema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    verified: {
      type: Boolean,
      default: false,
    },
    isExpertAnswer: {
      type: Boolean,
      default: false,
    },
    parentId: {
      type: MongooseSchema.Types.ObjectId,
      default: null,
    },
    depth: {
      type: Number,
      default: 0,
    },
    replies: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
  },
  { timestamps: true }
);

// Community post status enum
export type CommunityPostStatus = 'answered' | 'unanswered';

// Interface for a comment embedded in a post
export interface IComment {
  _id: Types.ObjectId;
  author: Types.ObjectId;
  body: string;
  upvotes: Types.ObjectId[];
  downvotes: Types.ObjectId[];
  verified: boolean;
  isExpertAnswer: boolean;
  parentId: Types.ObjectId | null;
  depth: number;
  replies: IComment[];
  createdAt: Date;
  updatedAt: Date;
}

// Interface for the CommunityPost document
export interface ICommunityPost extends Document {
  title: string;
  body: string;
  author: Types.ObjectId;
  status: CommunityPostStatus;
  answer: string | null;
  answerIsExpert?: boolean;
  upvotes: Types.ObjectId[];
  comments: IComment[];
  reports: Array<{ reportedBy: Types.ObjectId; reason: string; createdAt?: Date }>;
  embedding?: number[];
}

// Main schema for a community question/post
const communityPostSchema = new MongooseSchema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    body: {
      type: String,
      required: [true, 'Post body is required'],
      trim: true,
    },
    author: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['answered', 'unanswered'] as CommunityPostStatus[],
      default: 'unanswered',
    },
    answer: {
      type: String,
      default: null,
    },
    answerIsExpert: {
      type: Boolean,
      default: false,
    },
    upvotes: {
      type: [MongooseSchema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    comments: {
      type: [commentSchema],
      default: [],
    },
    reports: {
      type: [{
        reportedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
        reason: { type: String, trim: true },
        createdAt: { type: Date, default: Date.now },
      }],
      default: [],
    },
    embedding: {
      type: [Number],
      default: undefined,
      select: false,
    },
  },
  { timestamps: true }
);

// Creates a compound text index to enable traditional keyword-based MongoDB $text searches
communityPostSchema.index({ title: 'text', body: 'text' });

// Export the model, explicitly defining the target collection name ('yaksha_faq_communityposts')
export default mongoose.model<ICommunityPost>('CommunityPost', communityPostSchema, 'yaksha_faq_communityposts');