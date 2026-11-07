const mongoose = require('mongoose');
async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/printedsoul');
  const m = await mongoose.connection.collection('devicemodels').findOne({name: 'iphone-12'});
  console.log('iPhone 12:', JSON.stringify({
    displayName: m.displayName,
    templates: (m.templates || []).map(t => ({ id: t.id, name: t.name, hasPrintArea: !!t.printArea }))
  }, null, 2));
  process.exit(0);
}
run();
