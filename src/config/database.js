const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const databaseConnection = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`MongoDB Connected: ${databaseConnection.connection.host}`);
  } catch (connectionError) {
    console.error("MongoDB connection error:", connectionError);
    process.exit(1);
  }
};

module.exports = connectDB;
