import mongoose from "mongoose";

const UserRoomStatsSchema = new mongoose.Schema({

  userId: {
    type: String,
    required: true,
    index: true
  },

  roomCode: {
    type: String,
    required: true,
    index: true
  },

  totalAnswers: {
    type: Number,
    default: 0
  },

  correctAnswers: {
    type: Number,
    default: 0
  },

  currentStreak: {
    type: Number,
    default: 0
  },

  maxStreak: {
    type: Number,
    default: 0
  },

  accuracy: {
    type: Number,
    default: 0
  },

  fastestResponse: {
    type: Number,
    default: null
  },

  totalPoints: {
    type: Number,
    default: 0
  },

},{timestamps:true});

UserRoomStatsSchema.index({ userId:1, roomCode:1 }, { unique:true });

export default mongoose.model("UserRoomStats", UserRoomStatsSchema);