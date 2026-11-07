async function test() {
  const r = await fetch('http://localhost:5000/api/products/6aef1c94906da9819304fa97-apple-iphone-17-pro');
  const d = await r.json();
  console.log('Product:', d.data.name, d.data.slug);
  console.log('Related models:', d.data.relatedModels);
}
test();
