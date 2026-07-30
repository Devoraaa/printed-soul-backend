const mongoose = require('mongoose');
const { User } = require('./src/models/User'); // assuming User is exported

mongoose.connect('mongodb+srv://385parmarkartik_db_user:FxQMsV4eZOSrHQ1o@printedsoulstoretest.c7bychj.mongodb.net').then(async () => {
  // Try to find the user
  let user = await User.findOne({ email: 'admin@printedsoul.com' });
  if (!user) {
    user = new User({
      name: 'Admin', 
      email: 'admin@printedsoul.com', 
      phone: '0000000000', 
      role: 'admin', 
      isVerified: true
    });
  }
  
  user.password = 'admin123';
  await user.save();
  
  console.log('Admin user saved via Mongoose');
  process.exit(0);
}).catch(err => { console.error(err); process.exit(1); });
