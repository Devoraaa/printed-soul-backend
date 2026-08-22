const mongoose = require("mongoose");
const uri = "mongodb+srv://385parmarkartik_db_user:FxQMsV4eZOSrHQ1o@printedsoulstoretest.c7bychj.mongodb.net";

mongoose.connect(uri)
  .then(() => {
    console.log("Connected to MongoDB successfully!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });
