import { Schema, model } from "mongoose";

const historySchema = new Schema({
    video: {
        type: Schema.Types.ObjectId,
        ref: "Video",
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    contactName: {
        type: String,
        required: true,
    },
    contactAddress: {
        type: String,
        required: true,
    },
    sendType: {
        type: String,
        enum: ["email", "sms"],
        required: true,
    },
    subject: {
        type: String,
    },
    status: {
        type: String,
        enum: ["sent", "failed"],
        required: true,
    },
    uploadedVideoName: {
        type: String,
    },
},
    { timestamps: true }
);

export default model("History", historySchema);
