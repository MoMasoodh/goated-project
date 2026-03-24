import mongoose from "mongoose";

const UserAchievementSchema = new mongoose.Schema({

  userId: {
    type: String,
    required: true,
    index: true
  },

  badgeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Badge",
    required: true
  },

  roomCode: {
    type: String,
    required: true
  },

  earnedAt: {
    type: Date,
    default: Date.now
  }

});

UserAchievementSchema.index({ userId:1, badgeId:1, roomCode:1 }, { unique:true });

export default mongoose.model("UserAchievement", UserAchievementSchema);