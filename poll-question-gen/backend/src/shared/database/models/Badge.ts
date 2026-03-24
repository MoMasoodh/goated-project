import mongoose from "mongoose";

const BadgeSchema = new mongoose.Schema({

  name: {
    type: String,
    required: true
  },

  description: {
    type: String,
    default: ""
  },

  icon: {
    type: String,
    default: ""
  },

  category: {
    type: String,
    enum: ["performance","engagement","speed","milestone"],
    required: true
  },

  rule: {
    type: {
      type: String,
      required: true
    },

    threshold: {
      type: Number,
      required: true
    }
  },

  criteria: {
    type: String,
    default: ""
  }

},{timestamps:true});

export default mongoose.model("Badge", BadgeSchema);