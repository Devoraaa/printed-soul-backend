const mongoose = require('mongoose');
async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/printedsoul');
  const prods = await mongoose.connection.collection('products').find({
    designSlug: /blorng/i
  }).toArray();
  console.log('Blorng products count:', prods.length);
  for (const p of prods) {
    console.log({
      _id: p._id,
      name: p.name,
      slug: p.slug,
      designSlug: p.designSlug,
      caseType: p.caseType,
      deviceModels: p.deviceModels
    });
  }
  process.exit(0);
}
run();
