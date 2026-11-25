import mongoose, { Schema, type Model, Types } from "mongoose";

interface IPasswordResetToken {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
}

const passwordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    // One mutable record per account lets a single atomic update revoke every
    // earlier link before the newest email is sent.
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    usedAt: Date,
  },
  { timestamps: true },
);

const PasswordResetToken =
  (mongoose.models.PasswordResetToken as Model<IPasswordResetToken>) ||
  mongoose.model<IPasswordResetToken>(
    "PasswordResetToken",
    passwordResetTokenSchema,
  );

export default PasswordResetToken;
