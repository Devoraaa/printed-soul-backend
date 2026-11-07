const mongoose = require('mongoose');
async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/printedsoul');
  const prods = await mongoose.connection.collection('products').find().sort({_id: -1}).limit(15).toArray();
  console.log('Total products inspected:', prods.length);
  for (const p of prods) {
    console.log(JSON.stringify({
      _id: p._id,
      name: p.name,
      slug: p.slug,
      designSlug: p.designSlug,
      caseType: p.caseType,
      models: p.deviceModels
    }, null, 2));
  }
  process.exit(0);
}
run();
