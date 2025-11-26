import mongoose from "mongoose";
import colors from "colors";
import dotenv from "dotenv";

dotenv.config();

const URL = process.env.MONGO_URI;
const connectDB = async () => {
  try {

    mongoose.set('strictQuery', false);
    const conn = await mongoose.connect(URL);

    console.log(`MongoDB Connected: ${conn.connection.host}`.cyan.underline);
  } catch (error) {
    console.log(`Error: ${error.message}`.red.bold);
    process.exit();
  }
};

export default connectDB;
