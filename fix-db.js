const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/printedsoul').then(async () => {
  await mongoose.connection.collection('products').updateMany(
    { name: /Payment/ },
    { $set: { designSlug: 'payment' } }
  );
  console.log('Fixed DB');
  process.exit(0);
});
