const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://385parmarkartik_db_user:FxQMsV4eZOSrHQ1o@printedsoulstoretest.c7bychj.mongodb.net').then(async () => {
  const db = mongoose.connection.db;
  
  await db.collection('users').updateOne(
    { email: 'admin@printedsoul.com' },
    { 
      $set: { 
        isDeleted: false
      } 
    }
  );
  
  console.log('Admin isDeleted set to false');
  process.exit(0);
});
