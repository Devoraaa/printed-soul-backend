const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/printedsoul').then(async () => {
  const products = await mongoose.connection.collection('products').find({ name: /Payment/ }).sort({ createdAt: -1 }).limit(2).toArray();
  console.log("--- PRODUCTS ---");
  console.log(JSON.stringify(products, null, 2));
  
  if (products.length > 0 && products[0].images && products[0].images.length > 0) {
    const images = await mongoose.connection.collection('images').find({ _id: { $in: products[0].images } }).toArray();
    console.log("--- IMAGES ---");
    console.log(JSON.stringify(images, null, 2));
  } else {
    console.log("No images array found on product.");
  }
  process.exit(0);
});
