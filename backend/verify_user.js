import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDB } from "./src/db/mongodb.js";
import { User, Role } from "./src/db/models.js";
import { verifyPassword } from "./src/utils/password.js";

async function verify() {
  await connectDB();
  try {
    const user = await User.findOne({ username: "admin" }).populate('roles');
    if (!user) {
      console.log("User 'admin' NOT found!");
      return;
    }
    console.log("User 'admin' found.");
    console.log("Email:", user.email);
    console.log("Roles:", user.roles.map(r => r.name));
    console.log("Password Hash:", user.passwordHash);

    const passwordOk = await verifyPassword("admin123", user.passwordHash);
    console.log("Password 'admin123' verification result:", passwordOk);

    const passwordOkBcrypt = await bcrypt.compare("admin123", user.passwordHash);
    console.log("Bcrypt compare 'admin123' result:", passwordOkBcrypt);

  } catch (error) {
    console.error("Verification failed:", error);
  } finally {
    await mongoose.disconnect();
  }
}

verify();
