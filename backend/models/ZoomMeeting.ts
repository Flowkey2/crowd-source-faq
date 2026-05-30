import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ZoomMeetingStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ZoomInsightType = 'FAQ' | 'Announcement';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface IZoomInsight extends Document {
  meetingId: Types.ObjectId;
  type: ZoomInsightType;
  question?: string;          // for FAQ
  answer_or_content: string;   // answer (FAQ) or full announcement text
  confidence_score: number;    // 0.0 – 1.0 from LLM
  status: 'pending_review' | 'approved' | 'rejected';
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  publishedFaqId?: Types.ObjectId; // if approved and promoted to an FAQ
  transcript_snippet?: string;  // short excerpt from transcript this was derived from
  createdAt: Date;
  updatedAt: Date;
}

export interface IZoomMeeting extends Document {
  userId: Types.ObjectId;        // owning user (from Zoom OAuth)
  zoomMeetingId: string;          // Zoom's internal meeting ID
  topic: string;
  startTime: Date;
  duration?: number;
  rawTranscriptUrl?: string;
  rawTranscriptText?: string;
  insightCount: number;
  status: ZoomMeetingStatus;
  errorMessage?: string;
  processingStartedAt?: Date;
  processingCompletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Insight Schema ────────────────────────────────────────────────────────────

const zoomInsightSchema = new MongooseSchema<IZoomInsight>(
  {
    meetingId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'ZoomMeeting',
      required: true,
    },
    type: {
      type: String,
      enum: ['FAQ', 'Announcement'] as ZoomInsightType[],
      required: true,
    },
    question: {
      type: String,
      trim: true,
    },
    answer_or_content: {
      type: String,
      required: true,
      trim: true,
    },
    confidence_score: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    status: {
      type: String,
      enum: ['pending_review', 'approved', 'rejected'],
      default: 'pending_review',
    },
    reviewedBy: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: Date,
    publishedFaqId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'FAQ',
    },
    transcript_snippet: {
      type: String,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

// ─── Meeting Schema ─────────────────────────────────────────────────────────────

const zoomMeetingSchema = new MongooseSchema<IZoomMeeting>(
  {
    userId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    zoomMeetingId: {
      type: String,
      required: true,
    },
    topic: {
      type: String,
      required: true,
      trim: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    duration: Number,
    rawTranscriptUrl: String,
    rawTranscriptText: String,
    insightCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'] as ZoomMeetingStatus[],
      default: 'pending',
    },
    errorMessage: String,
    processingStartedAt: Date,
    processingCompletedAt: Date,
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

zoomMeetingSchema.index({ userId: 1, zoomMeetingId: 1 }, { unique: true });
zoomMeetingSchema.index({ userId: 1, status: 1, startTime: -1 });
zoomMeetingSchema.index({ status: 1, startTime: -1 });

zoomInsightSchema.index({ meetingId: 1 });
zoomInsightSchema.index({ status: 1, type: 1 });
zoomInsightSchema.index({ publishedFaqId: 1 }, { sparse: true });

// ─── Models ───────────────────────────────────────────────────────────────────

export const ZoomMeeting = mongoose.model<IZoomMeeting>('ZoomMeeting', zoomMeetingSchema, 'yaksha_zoom_meetings');
export const ZoomInsight = mongoose.model<IZoomInsight>('ZoomInsight', zoomInsightSchema, 'yaksha_zoom_insights');
