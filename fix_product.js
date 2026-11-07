const mongoose = require('mongoose');
async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/printedsoul');
  // For product 6aef1c97d36e753ade5b2f34 (iphone-12), reset deviceModels to only iphone-12
  const iphone12Id = new mongoose.Types.ObjectId('6aed798d11a43f94f49749de');
  await mongoose.connection.collection('products').updateOne(
    { _id: new mongoose.Types.ObjectId('6aef1c97d36e753ade5b2f34') },
    { $set: { deviceModels: [iphone12Id] } }
  );
  console.log('Reset product 6aef1c97d36e753ade5b2f34 deviceModels to [iphone-12]');
  process.exit(0);
}
run();
