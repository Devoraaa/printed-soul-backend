const mongoose = require("mongoose");
const uri = "mongodb://127.0.0.1:27017/printedsoul";

mongoose.connect(uri)
  .then(() => {
    console.log("SUCCESSFULLY connected to local MongoDB (127.0.0.1:27017) via script!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Local DB connection error:", err.message);
    process.exit(1);
  });
